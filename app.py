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

def init_passwords_file():
    if not os.path.exists(PASSWORDS_FILE):
        with open(PASSWORDS_FILE, 'w') as f:
            json.dump({}, f)

init_passwords_file()

def read_passwords():
    try:
        with open(PASSWORDS_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return {}

def write_passwords(data):
    with open(PASSWORDS_FILE, 'w') as f:
        json.dump(data, f, indent=4)

def parse_raport(content: str):
    sections = {}
    current_section = None
    lines = content.split('\n')
    for line in lines:
        match = re.match(r'^-{10,}\s+(.+)$', line)
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
    ram = '\n'.join(sections.get('PAMIEC RAM', []))
    ram_match = re.search(r'Ilosc zainstalowanej pamieci:\s+(\d+)szt\.\s+na\s+(\d+)\s+dostępnych slotów', ram)
    if ram_match:
        result['ram'] = {
            'used': ram_match.group(1),
            'total': ram_match.group(2)
        }
    else:
        result['ram'] = {'used': 'N/A', 'total': 'N/A'}
        
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

@app.get("/api/servers")
def list_servers():
    if not os.path.exists(FTP_ROOT):
        return {"servers": []}
    
    server_list = []
    serial_dirs = find_serial_dirs(FTP_ROOT)
    for serial in serial_dirs:
        latest_run = get_latest_run_dir(serial)
        
        meta_path = os.path.join(FTP_ROOT, serial, "metadata.json")
        metadata = {"customer": "", "so_number": "", "server_name": "", "notes": ""}
        if os.path.exists(meta_path):
            try:
                with open(meta_path, 'r') as f:
                    metadata = json.load(f)
            except:
                pass
                
        if latest_run:
            run_name = os.path.basename(latest_run)
            date_str = format_run_date(run_name)
            server_list.append({"serial": serial, "date": date_str, "raw": run_name, "metadata": metadata})
        else:
            server_list.append({"serial": serial, "date": "No runs", "raw": "", "metadata": metadata})
                
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
import json

class MetadataModel(BaseModel):
    customer: str
    so_number: str
    server_name: str
    notes: str

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
    
    meta_path = os.path.join(serial_dir, "metadata.json")
    if os.path.exists(meta_path):
        try:
            with open(meta_path, 'r') as f:
                data['metadata'] = json.load(f)
        except:
            data['metadata'] = {"customer": "", "so_number": "", "server_name": "", "notes": ""}
    else:
        data['metadata'] = {"customer": "", "so_number": "", "server_name": "", "notes": ""}
        
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
    for lease in leases:
        lease['password'] = passwords.get(lease['mac'], "")
        
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

