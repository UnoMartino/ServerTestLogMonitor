import os
import re
import json
import subprocess
import platform
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Server Test Log Monitor")

FTP_ROOT = os.getenv("FTP_ROOT", "/home/comset/FTP")
PASSWORDS_FILE = "ipmi_passwords.json"
LINKS_FILE = "ipmi_links.json"

def init_passwords_file():
    if not os.path.exists(PASSWORDS_FILE):
        with open(PASSWORDS_FILE, 'w') as f:
            json.dump({}, f)

def init_links_file():
    if not os.path.exists(LINKS_FILE):
        with open(LINKS_FILE, 'w') as f:
            json.dump({}, f)

init_passwords_file()
init_links_file()

def read_passwords():
    try:
        with open(PASSWORDS_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return {}

def write_passwords(data):
    with open(PASSWORDS_FILE, 'w') as f:
        json.dump(data, f, indent=4)

def read_links():
    try:
        with open(LINKS_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return {}

def write_links(data):
    with open(LINKS_FILE, 'w') as f:
        json.dump(data, f, indent=4)

def parse_raport(content: str):
    sections = {}
    current_section = None
    lines = content.split('\n')
    for line in lines:
        match = re.match(r'^-{30,}\s+([A-Za-z0-9].*)$', line)
        if match:
            current_section = match.group(1).strip()
            sections[current_section] = []
        elif current_section:
            sections[current_section].append(line)
            
    result = {}
    
    # SYSTEM
    sys_section = '\n'.join(sections.get('SYSTEM', []))
    result['system'] = {
        'producent': re.search(r'Producent:\s+(.*)', sys_section).group(1).strip() if re.search(r'Producent:\s+(.*)', sys_section) else 'N/A',
        'model': re.search(r'Model:\s+(.*)', sys_section).group(1).strip() if re.search(r'Model:\s+(.*)', sys_section) else 'N/A',
        'numer_seryjny': re.search(r'Numer seryjny:\s+(.*)', sys_section).group(1).strip() if re.search(r'Numer seryjny:\s+(.*)', sys_section) else 'N/A',
    }
    
    # OBUDOWA
    obudowa = '\n'.join(sections.get('OBUDOWA', []))
    result['chassis'] = {
        'producent': re.search(r'Producent:\s+(.*)', obudowa).group(1).strip() if re.search(r'Producent:\s+(.*)', obudowa) else 'N/A',
        'rodzaj': re.search(r'Rodzaj:\s+(.*)', obudowa).group(1).strip() if re.search(r'Rodzaj:\s+(.*)', obudowa) else 'N/A',
        'numer_seryjny': re.search(r'Numer seryjny:\s+(.*)', obudowa).group(1).strip() if re.search(r'Numer seryjny:\s+(.*)', obudowa) else 'N/A',
    }
    
    # PLYTA GLOWNA
    plyta = '\n'.join(sections.get('PLYTA GLOWNA', []))
    result['motherboard'] = {
        'producent': re.search(r'Producent:\s+(.*)', plyta).group(1).strip() if re.search(r'Producent:\s+(.*)', plyta) else 'N/A',
        'model': re.search(r'Model:\s+(.*)', plyta).group(1).strip() if re.search(r'Model:\s+(.*)', plyta) else 'N/A',
        'wersja_bios': re.search(r'Wersja BIOS:\s+(.*)', plyta).group(1).strip() if re.search(r'Wersja BIOS:\s+(.*)', plyta) else 'N/A',
        'numer_seryjny': re.search(r'Numer seryjny:\s+(.*)', plyta).group(1).strip() if re.search(r'Numer seryjny:\s+(.*)', plyta) else 'N/A',
    }
    
    # PROCESOR
    proc_lines = sections.get('PROCESOR', [])
    processors = []
    for line in proc_lines:
        line = line.strip()
        if line and not line.startswith('-'):
            processors.append(line)
    result['cpu'] = processors
    
    # PAMIEC RAM
    ram_lines = sections.get('PAMIEC RAM', [])
    ram = '\n'.join(ram_lines)
    ram_match = re.search(r'Ilosc zainstalowanej pamieci:\s+(\d+)szt\.\s+na\s+(\d+)\s+dostępnych slotów', ram)
    
    total_gb = 0.0
    for rline in ram_lines:
        m_size = re.match(r'^Rozmiar:\s+(\d+(?:\.\d+)?)\s*(GB|MB|TB)', rline.strip(), re.IGNORECASE)
        if m_size:
            val = float(m_size.group(1))
            unit = m_size.group(2).upper()
            if unit == 'MB':
                total_gb += val / 1024.0
            elif unit == 'TB':
                total_gb += val * 1024.0
            else:
                total_gb += val

    if total_gb > 0:
        ram_capacity = f"{int(total_gb)} GB" if total_gb.is_integer() else f"{total_gb:.1f} GB"
    else:
        mem_fallback = re.search(r'^(?:Mem|Total):\s+(\S+)', ram, re.MULTILINE)
        ram_capacity = mem_fallback.group(1).strip() if mem_fallback else 'N/A'

    if ram_match:
        result['ram'] = {
            'used': ram_match.group(1),
            'total': ram_match.group(2),
            'capacity': ram_capacity
        }
    else:
        result['ram'] = {'used': 'N/A', 'total': 'N/A', 'capacity': ram_capacity}
        
    # BMC/IPMI
    bmc = '\n'.join(sections.get('BMC/IPMI', []))
    fw_rev = re.search(r'Firmware Revision\s+:\s+(.*)', bmc)
    aux_fw = re.search(r'Auxiliary Firmware Revision Information\s+:\s+([0-9a-fA-F]+)', bmc)
    
    if fw_rev and aux_fw:
        rev_str = fw_rev.group(1).strip()
        aux_str = aux_fw.group(1).strip()[-2:]
        result['bmc'] = f"{rev_str}.{aux_str}"
    else:
        result['bmc'] = 'N/A'

    # DYSKI SATA/SAS
    sata_disks = []
    sata_lines = sections.get('DYSKI SATA/SAS', []) + sections.get('NAPEDY/DYSKI', [])
    in_sata_table = False
    for line in sata_lines:
        s = line.strip()
        if not s:
            continue
        if re.match(r'^NAME\s+MODEL\s+SERIAL', s, re.IGNORECASE):
            in_sata_table = True
            continue
        if in_sata_table:
            if s.startswith('---'):
                in_sata_table = False
                continue
            parts = s.split()
            if parts and parts[0].startswith('/dev/'):
                # Skip virtual devices like /dev/nbd*, /dev/loop*, /dev/ram* with no model/serial
                if len(parts) < 2:
                    continue
                device = parts[0]
                if len(parts) >= 3:
                    sn = parts[-1]
                    pn = " ".join(parts[1:-1])
                else:
                    pn = parts[1]
                    sn = "N/A"
                sata_disks.append({"device": device, "pn": pn, "sn": sn})

    # DYSKI NVMe
    nvme_disks = []
    nvme_lines = sections.get('DYSKI NVMe', [])
    sep_spans = None
    header_cols = []
    prev_line = ""
    for line in nvme_lines:
        s = line.strip()
        if not s:
            continue
        if re.match(r'^-{5,}\s+-{5,}', s):
            sep_spans = [m.span() for m in re.finditer(r'-+', line)]
            header_cols = [prev_line[start:end].strip().upper() for start, end in sep_spans]
            continue
        if sep_spans and s.startswith('/dev/nvme'):
            def get_col(col_name, fallback_idx):
                idx = header_cols.index(col_name) if col_name in header_cols else fallback_idx
                if idx < len(sep_spans):
                    start, end = sep_spans[idx]
                    return line[start:end].strip()
                return ""
            device = get_col('NODE', 0)
            sn = get_col('SN', 2 if len(sep_spans) >= 4 else 1)
            pn = get_col('MODEL', 3 if len(sep_spans) >= 4 else 2)
            if not device or not sn:
                parts = s.split()
                if len(parts) >= 4 and parts[1].startswith('/dev/'):
                    device, sn, pn = parts[0], parts[2], parts[3]
                elif len(parts) >= 3:
                    device, sn, pn = parts[0], parts[1], parts[2]
            nvme_disks.append({"device": device, "pn": pn or "N/A", "sn": sn or "N/A"})
        prev_line = line

    result['disks'] = {
        'sata_count': len(sata_disks),
        'nvme_count': len(nvme_disks),
        'sata': sata_disks,
        'nvme': nvme_disks
    }
        
    return result

import base64

def get_latest_run_dir(serial: str):
    serial_dir = os.path.join(FTP_ROOT, serial)
    if not os.path.isdir(serial_dir):
        return None
    runs = [d for d in os.listdir(serial_dir) if os.path.isdir(os.path.join(serial_dir, d))]
    if not runs:
        return None
    runs.sort(reverse=True)
    return os.path.join(serial_dir, runs[0])

def get_all_runs(serial: str):
    serial_dir = os.path.join(FTP_ROOT, serial)
    if not os.path.isdir(serial_dir):
        return []
    runs = [d for d in os.listdir(serial_dir) if os.path.isdir(os.path.join(serial_dir, d))]
    runs.sort(reverse=True)
    return runs

def format_run_date(run_name: str):
    try:
        return f"20{run_name[0:2]}-{run_name[2:4]}-{run_name[4:6]} {run_name[7:9]}:{run_name[9:11]}:{run_name[11:13]}"
    except:
        return run_name

def find_serial_dirs(base_path):
    serial_dirs = []
    if not os.path.exists(base_path):
        return serial_dirs
        
    for root, dirs, files in os.walk(base_path):
        has_runs = False
        for d in dirs:
            if re.match(r'^\d{6}_\d{6}$', d):
                has_runs = True
                break
                
        if has_runs:
            serial_dirs.append(os.path.relpath(root, base_path))
            dirs.clear() 
            
    return serial_dirs

def decode_serial(serial_b64: str):
    # Padding might be missing depending on btoa, so add it just in case
    serial_b64 += "=" * ((4 - len(serial_b64) % 4) % 4)
    return base64.b64decode(serial_b64).decode('utf-8')

def extract_specs_from_parsed(parsed: dict) -> dict:
    cpus = parsed.get('cpu') or []
    unique_cpus = list(dict.fromkeys([c.strip() for c in cpus if c.strip()]))
    cpu_model = ", ".join(unique_cpus) if unique_cpus else "N/A"
    cpu_count = len(cpus)
    mb = parsed.get('motherboard') or {}
    ram = parsed.get('ram') or {}
    disks = parsed.get('disks') or {}
    return {
        "bios_version": mb.get('wersja_bios', 'N/A'),
        "bmc_firmware": parsed.get('bmc', 'N/A'),
        "cpu_model": cpu_model,
        "cpu_count": cpu_count,
        "ram_sticks": ram.get('used', 'N/A'),
        "sata_count": disks.get('sata_count', 0),
        "nvme_count": disks.get('nvme_count', 0),
    }

def get_server_summary(run_dir: str):
    default_specs = {
        "bios_version": "N/A",
        "bmc_firmware": "N/A",
        "cpu_model": "N/A",
        "cpu_count": 0,
        "ram_sticks": "N/A",
        "sata_count": 0,
        "nvme_count": 0,
    }
    if not run_dir:
        return "", default_specs
    raport_path = os.path.join(run_dir, "1-raport-glowny.txt")
    if not os.path.exists(raport_path):
        return "", default_specs
    try:
        with open(raport_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        parsed = parse_raport(content)
        model = parsed.get('system', {}).get('model', '')
        model_str = "" if model == "N/A" else model
        return model_str, extract_specs_from_parsed(parsed)
    except Exception:
        return "", default_specs

@app.get("/api/servers")
def list_servers():
    if not os.path.exists(FTP_ROOT):
        return {"servers": []}
    
    links = read_links()
    server_list = []
    serial_dirs = find_serial_dirs(FTP_ROOT)
    for serial in serial_dirs:
        latest_run = get_latest_run_dir(serial)
        
        meta_path = os.path.join(FTP_ROOT, serial, "metadata.json")
        metadata = {"customer": "", "so_number": "", "server_name": "", "notes": ""}
        if os.path.exists(meta_path):
            try:
                with open(meta_path, 'r') as f:
                    loaded = json.load(f)
                    if isinstance(loaded, dict):
                        metadata.update(loaded)
            except:
                pass
                
        linked_mac = links.get(serial, "")
        system_model, specs = get_server_summary(latest_run)
        if latest_run:
            run_name = os.path.basename(latest_run)
            date_str = format_run_date(run_name)
            server_list.append({"serial": serial, "date": date_str, "raw": run_name, "metadata": metadata, "linked_mac": linked_mac, "model": system_model, "specs": specs})
        else:
            server_list.append({"serial": serial, "date": "No runs", "raw": "", "metadata": metadata, "linked_mac": linked_mac, "model": system_model, "specs": specs})
                
    server_list.sort(key=lambda x: x["raw"], reverse=True)
    return {"servers": server_list}

@app.get("/api/servers/{serial_b64}/runs")
def list_server_runs(serial_b64: str):
    serial = decode_serial(serial_b64)
    runs = get_all_runs(serial)
    if not runs:
        raise HTTPException(status_code=404, detail="No runs found")
    
    run_list = [{"run": r, "date": format_run_date(r)} for r in runs]
    return {"runs": run_list}

from pydantic import BaseModel
from typing import Dict, List, Optional
import json

class MetadataModel(BaseModel):
    customer: str
    so_number: str
    server_name: str
    notes: str

class BatchMetadataModel(BaseModel):
    serials: List[str]
    updates: Dict[str, str]

class IpmiLinkModel(BaseModel):
    serial: str
    mac: Optional[str] = ""

@app.get("/api/servers/{serial_b64}/runs/{run}")
def get_server_details(serial_b64: str, run: str):
    serial = decode_serial(serial_b64)
    run_dir = os.path.join(FTP_ROOT, serial, run)
    serial_dir = os.path.join(FTP_ROOT, serial)
    if not os.path.isdir(run_dir):
        raise HTTPException(status_code=404, detail="Run not found")
        
    raport_path = os.path.join(run_dir, "1-raport-glowny.txt")
    if not os.path.exists(raport_path):
        raise HTTPException(status_code=404, detail="1-raport-glowny.txt not found")
        
    with open(raport_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    data = parse_raport(content)
    data['specs'] = extract_specs_from_parsed(data)
    
    meta_path = os.path.join(serial_dir, "metadata.json")
    default_meta = {"customer": "", "so_number": "", "server_name": "", "notes": ""}
    if os.path.exists(meta_path):
        try:
            with open(meta_path, 'r') as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    default_meta.update(loaded)
        except:
            pass
    data['metadata'] = default_meta
    links = read_links()
    data['linked_mac'] = links.get(serial, "")
        
    return data

@app.post("/api/servers/{serial_b64}/runs/{run}/metadata")
def update_metadata(serial_b64: str, run: str, metadata: MetadataModel):
    serial = decode_serial(serial_b64)
    serial_dir = os.path.join(FTP_ROOT, serial)
    run_dir = os.path.join(serial_dir, run)
    if not os.path.isdir(run_dir):
        raise HTTPException(status_code=404, detail="Run not found")
        
    meta_path = os.path.join(serial_dir, "metadata.json")
    with open(meta_path, 'w') as f:
        json.dump(metadata.model_dump(), f)
    
    return {"status": "success"}

@app.post("/api/servers/batch-metadata")
def batch_update_metadata(batch: BatchMetadataModel):
    if not batch.serials:
        raise HTTPException(status_code=400, detail="No serials provided")
    
    allowed_keys = {"customer", "so_number", "server_name", "notes"}
    base_abs = os.path.abspath(FTP_ROOT)
    updated_count = 0
    
    for serial in batch.serials:
        serial_dir = os.path.abspath(os.path.join(FTP_ROOT, serial))
        if not serial_dir.startswith(base_abs + os.sep) or not os.path.isdir(serial_dir):
            continue
        meta_path = os.path.join(serial_dir, "metadata.json")
        current_meta = {"customer": "", "so_number": "", "server_name": "", "notes": ""}
        if os.path.exists(meta_path):
            try:
                with open(meta_path, 'r') as f:
                    loaded = json.load(f)
                    if isinstance(loaded, dict):
                        current_meta.update(loaded)
            except:
                pass
        for k, v in batch.updates.items():
            if k in allowed_keys:
                current_meta[k] = v
        with open(meta_path, 'w') as f:
            json.dump(current_meta, f)
        updated_count += 1
        
    return {"status": "success", "updated_count": updated_count}

@app.get("/api/ipmi-links")
def get_ipmi_links():
    return {"links": read_links()}

@app.post("/api/ipmi-links")
def save_ipmi_link(payload: IpmiLinkModel):
    serial = payload.serial.strip()
    if not serial:
        raise HTTPException(status_code=400, detail="Serial is required")
    links = read_links()
    mac = (payload.mac or "").strip().lower()
    if not mac:
        links.pop(serial, None)
    else:
        # Ensure 1-to-1 MAC to serial mapping
        to_remove = [s for s, m in links.items() if m.lower() == mac and s != serial]
        for s in to_remove:
            links.pop(s, None)
        links[serial] = mac
    write_links(links)
    return {"status": "success", "links": links}

@app.get("/api/servers/{serial_b64}/runs/{run}/logs")
def list_server_logs(serial_b64: str, run: str):
    serial = decode_serial(serial_b64)
    run_dir = os.path.join(FTP_ROOT, serial, run)
    if not os.path.isdir(run_dir):
        raise HTTPException(status_code=404, detail="Run not found")
    
    files = []
    for root, _, filenames in os.walk(run_dir):
        for filename in filenames:
            rel_path = os.path.relpath(os.path.join(root, filename), run_dir)
            files.append(rel_path)
            
    return {"files": sorted(files)}

@app.get("/api/servers/{serial_b64}/runs/{run}/logs/{filepath:path}")
def view_server_log(serial_b64: str, run: str, filepath: str):
    serial = decode_serial(serial_b64)
    run_dir = os.path.join(FTP_ROOT, serial, run)
    file_path = os.path.abspath(os.path.join(run_dir, filepath))
    
    if not file_path.startswith(os.path.abspath(run_dir)):
        raise HTTPException(status_code=403, detail="Invalid path")
        
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(file_path, media_type="text/plain")

@app.get("/api/dhcp")
def get_dhcp_leases():
    leases = []
    if platform.system() == "Darwin":
        leases = [
            {"mac": "64:31:36:5f:d4:ce", "ip": "192.168.10.120", "hostname": "-", "valid_until": "2026-06-30 18:45:31", "manufacturer": "-"},
            {"mac": "a1:b2:c3:d4:e5:f6", "ip": "192.168.10.5", "hostname": "host1", "valid_until": "2026-06-30 19:00:00", "manufacturer": "Supermicro"}
        ]
    else:
        try:
            output = subprocess.check_output(['dhcp-lease-list'], text=True)
            lines = output.strip().split('\n')
            started = False
            for line in lines:
                if line.startswith('===='):
                    started = True
                    continue
                if started and line.strip():
                    parts = re.split(r'\s{2,}', line.strip())
                    if len(parts) >= 2:
                        leases.append({
                            "mac": parts[0],
                            "ip": parts[1],
                            "hostname": parts[2] if len(parts) > 2 else "-",
                            "valid_until": parts[3] if len(parts) > 3 else "-",
                            "manufacturer": parts[4] if len(parts) > 4 else "-"
                        })
        except Exception as e:
            print(f"Error running dhcp-lease-list: {e}")
            
    passwords = read_passwords()
    links = read_links()
    mac_to_serial = {m.lower(): s for s, m in links.items() if m}
    for lease in leases:
        lease['password'] = passwords.get(lease['mac'], "")
        lease['linked_serial'] = mac_to_serial.get(lease['mac'].lower(), "")
        
    return {"leases": leases}

@app.post("/api/passwords")
async def save_password(request: Request):
    data = await request.json()
    mac = data.get("mac")
    password = data.get("password")
    
    if mac:
        passwords = read_passwords()
        passwords[mac] = password
        write_passwords(passwords)
        return {"status": "success"}
    raise HTTPException(status_code=400, detail="Invalid data")

# Mount static files at the end to act as a fallback
app.mount("/", StaticFiles(directory=".", html=True), name="static")

