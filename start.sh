#!/bin/bash
set -e

COMMAND=$1

if [ "$COMMAND" = "install" ]; then
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
    
    echo 'Installation complete. Run "./start.sh run" to start the server.'
    
elif [ "$COMMAND" = "run" ]; then
    if [ ! -d "venv" ]; then
        echo 'Error: Virtual environment not found. Please run "./start.sh install" first.'
        exit 1
    fi
    source venv/bin/activate
    
    echo 'Starting server on 0.0.0.0:12345...'
    uvicorn app:app --host 0.0.0.0 --port 12345
    
else
    echo "Usage: $0 {install|run}"
    exit 1
fi
