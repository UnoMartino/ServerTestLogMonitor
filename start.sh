#!/bin/bash
set -e

if [ "$(uname)" != "Darwin" ]; then
    echo 'Installing system requirements...'
    sudo apt update
    sudo apt install -y python3 python3-venv
else
    echo 'Skipping apt install on macOS. Assuming Python 3 is installed.'
fi

echo 'Setting up virtual environment...'
python3 -m venv venv
source venv/bin/activate

echo 'Installing Python dependencies...'
pip install -r requirements.txt

echo 'Starting server on 0.0.0.0:12345...'
uvicorn app:app --host 0.0.0.0 --port 12345
