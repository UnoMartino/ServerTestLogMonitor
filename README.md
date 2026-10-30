# Server Test Log Monitor

An internal web application designed to manage, view, and parse server hardware logs alongside real-time DHCP lease monitoring. Built with a fast, lightweight **FastAPI** backend and an **Apple Human Interface Guidelines** inspired frontend (using native HTML/CSS/JS, SF Pro typography, and glassmorphism styling).

## Features

- **Apple-Inspired Native UI (Polish Interface)**: A clean, modern interface utilizing translucent glassmorphism effects, rounded styling, and custom non-native dropdowns that prevent OS picker page jumps.
- **Left Sidebar Server Tree & Filtering**:
  - Tree-style sidebar supporting both flat and grouped serial directories (e.g., `GROUP/SERIAL_NUMBER`).
  - Displays each server's **Customer** (`Klient`) and **Server Name** (`Nazwa serwera`) stacked under the serial number, falling back to the hardware **Model** from the `SYSTEM` report section when metadata is empty.
  - Multi-criteria search and filtering checkboxes (by Serial, Customer, SO #, Server Name, Notes, active DHCP online status, linked IPMI MAC status, and metadata presence).
- **Server Hardware Dashboard**: Automatically parses `1-raport-glowny.txt` to extract and display:
  - **System, Obudowa (Chassis), Płyta główna (Motherboard), Procesor (CPU), and BMC/IPMI** firmware revision.
  - **RAM**: Total physical memory capacity (`Całkowita pamięć` summed from installed DIMM modules), occupied slots, and total slots.
  - **Dyski (SATA/SAS & NVMe)**: Summary counters and detailed disk table with device nodes, Part Numbers / Models (PN), and Serial Numbers (SN).
- **Metadata & Notes Management (`Metadata i notatki`)**:
  - Per-server fields for **Klient**, **SO #**, **Nazwa serwera**, and **Notatki** with an unsaved-changes indicator (yellow dot next to `Zapisz`).
  - **Copy & Paste**: Copy metadata from one server to the clipboard (`Kopiuj` / `Wklej`) or directly apply it to checked servers on the sidebar (`Kopiuj na zaznaczone`).
  - **Batch Edit (`Edycja grupowa`)**: Select multiple servers via sidebar checkboxes to bulk-update or clear metadata fields, or load values from any existing server.
- **Server Hardware Checker & Comparator (`Sprawdzarka` / `Porównaj`)**:
  - Verify checked servers against expected hardware parameters (**BIOS version**, **IPMI firmware**, **CPU model** & **CPU count**, **RAM module count**, **SATA/SAS disk count**, and **NVMe disk count**) with live match/mismatch highlighting.
  - Use the **Porównaj** button on any server's `System` card to prefill all verification criteria from that server and immediately compare it against all checked servers on the list.
- **IPMI MAC Linking & Live DHCP Status**:
  - Link a server serial number with its IPMI MAC address (`IPMI MAC`) using a modal with colon-agnostic substring MAC search.
  - When a linked server is active in DHCP, an online IPMI bar is displayed directly on the server page with its MAC, IP, direct IPMI link, and synchronized password input.
- **Run History & Dynamic Log Viewer**: Seamlessly switch between timestamped test runs (`YYMMDD_HHMMSS`) and browse raw log files in a dynamically expanding log viewer.
- **DHCP Monitor (`Adresy IP DHCP`)**: Live-polling DHCP leases table (auto-refreshing every 5s) showing MAC addresses, IPs, hostnames, manufacturers, IPMI links, and persistent per-MAC passwords.

## Architecture

- **Backend**: Python 3, FastAPI, Uvicorn.
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (No heavy frontend frameworks).
- **Environment Support**: Designed primarily for Ubuntu 24.04 (with real OS-level `dhcp-lease-list` parsing), but fully supports macOS (`Darwin`) via mocked fallbacks for local development.

---

## How-To Guide

### Prerequisites

Ensure you have Python 3 installed. If you are deploying this on Linux (Ubuntu), the startup script will automatically attempt to install the necessary `apt` dependencies (`python3-venv`).

### 1. Configuration

Create a `.env` file in the root directory to define where the server logs are stored:

```bash
# .env
FTP_ROOT="/path/to/your/FTP_Directory"
PORT=12345
```

*Note: The application expects the FTP root to contain directories matching hardware serial numbers, and inside those, timestamped run folders (e.g., `FTP_ROOT/SERIAL_NUMBER/260629_223807/1-raport-glowny.txt`). Grouped subdirectories (e.g., `FTP_ROOT/GROUP/SERIAL_NUMBER`) are also supported.*

### 2. Installation & Running

The project comes with a startup script that handles virtual environments, dependencies, and launching the server. It accepts two commands: `install` and `run`.

Make the script executable (if it isn't already):

```bash
chmod +x start.sh
```

**First-time Setup or Updates:**
To install all system requirements, set up the virtual environment, and install dependencies, use the `install` command:

```bash
./start.sh install
```

**Running the Server:**
Once installed, you can start the web server for normal use without reinstalling packages by using the `run` command:

```bash
./start.sh run
```

### 3. Usage

Once the server says `Uvicorn running on http://0.0.0.0:<PORT>`, open your web browser and navigate to:

```
http://localhost:<PORT>
```

- **Serwery Tab (`Serwery`)**:
  - Use the left sidebar to search, filter, and select servers.
  - Check servers on the sidebar to perform **Edycja grupowa** (`Edytuj`), verify hardware configurations (`Sprawdzarka`), compare checked servers against the currently viewed server (`Porównaj`), or use **Kopiuj / Wklej / Kopiuj na zaznaczone** in the **Metadata i notatki** card.
  - Click **IPMI MAC** on the sidebar toolbar to bind the selected server to a DHCP IPMI MAC address.
  - Switch between historical test runs and inspect log files in the **Podgląd logów** section.
- **Adresy IP DHCP Tab (`Adresy IP DHCP`)**: View active DHCP leases (auto-refreshed every 5 seconds), open IPMI web interfaces directly, and save per-MAC IPMI passwords without losing cursor focus during reloads.
