# Server Test Log Monitor

An internal web application designed to manage, view, and parse server hardware logs alongside real-time DHCP lease monitoring. Built with a fast, lightweight **FastAPI** backend and an **Apple Human Interface Guidelines** inspired frontend (using native HTML/CSS/JS, SF Pro typography, and glassmorphism styling).

## Features

- **Apple-Inspired Native UI**: A clean, highly aesthetic interface utilizing translucent glassmorphism effects, modern rounded styling, and smooth micro-animations.
- **Server Dashboard**: Automatically parses server logs (specifically `1-raport-glowny.txt`) to extract and neatly present hardware information including System, Chassis, Motherboard, RAM, CPU, and BMC firmware.
- **Advanced Serial Directory Search**: Recursively discovers log directories. Features a custom collapsible search dropdown that instantly filters results and auto-expands grouped directories.
- **Run History**: Seamlessly pick and jump between multiple timestamped runs (`YYMMDD_HHMMSS`) for the same hardware serial number.
- **Log File Viewer**: Browse and view raw log outputs recursively across subfolders.
- **DHCP Monitor**: Live-polling DHCP leases dashboard. Shows MAC addresses, IPs, hostnames, dynamically generates direct IPMI web interface links, and allows you to securely save passwords per machine locally.

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
```

*Note: The application expects the FTP root to contain directories matching hardware serial numbers, and inside those, timestamped run folders (e.g., `FTP_ROOT/SERIAL_NUMBER/260629_223807/1-raport-glowny.txt`). Grouped subdirectories (e.g., `FTP_ROOT/GROUP/SERIAL_NUMBER`) are also supported.*

### 2. Installation & Running

The project comes with a monolithic startup script that handles virtual environments, dependencies, and launching the server.

Make the script executable (if it isn't already) and run it:

```bash
chmod +x start.sh
./start.sh
```

**What `start.sh` does:**
1. Verifies the OS and installs `python3-venv` if running on Linux.
2. Creates an isolated Python virtual environment (`venv/`).
3. Installs dependencies from `requirements.txt` (FastAPI, Uvicorn, Python-Dotenv).
4. Launches the web server on port `12345`.

### 3. Usage

Once the server says `Uvicorn running on http://0.0.0.0:12345`, open your web browser and navigate to:

```
http://localhost:12345
```

- **Dashboard Tab**: Use the top-left search bar to find and select a server. Switch between historical runs and read direct file outputs in the Log Viewer.
- **DHCP Leases Tab**: View active local leases. The list refreshes automatically every 5 seconds. You can safely type and save IPMI passwords dynamically without losing cursor focus during reloads.
