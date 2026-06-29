document.addEventListener('DOMContentLoaded', () => {
    // --- Tabs Logic ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // --- Server Dashboard Logic ---
    const serverSearch = document.getElementById('serverSearch');
    const serverList = document.getElementById('serverList');
    const refreshServersBtn = document.getElementById('refreshServersBtn');
    const dashboardContent = document.getElementById('dashboardContent');
    const logFileSelect = document.getElementById('logFileSelect');
    const logViewer = document.getElementById('logViewer');
    
    let allServers = [];
    let currentSelectedSerial = null;

    async function loadServers() {
        try {
            const res = await fetch('/api/servers');
            const data = await res.json();
            allServers = data.servers; // Array of {serial, date, raw}
            
            renderServerList(allServers);
            
            // Keep current selection loaded if it exists
            if (currentSelectedSerial && allServers.find(s => s.serial === currentSelectedSerial)) {
                // keep data loaded
            } else {
                currentSelectedSerial = null;
                serverSearch.value = '';
                dashboardContent.classList.add('hidden');
            }
        } catch (e) {
            console.error('Failed to load servers', e);
        }
    }

    function renderServerList(servers, searchTerm = "") {
        serverList.innerHTML = '';
        
        const groups = {};
        const ungrouped = [];
        
        servers.forEach(server => {
            const parts = server.serial.split('/');
            if (parts.length > 1) {
                const groupName = parts[0];
                if (!groups[groupName]) groups[groupName] = [];
                groups[groupName].push(server);
            } else {
                ungrouped.push(server);
            }
        });

        const forceExpand = searchTerm.length > 0;

        for (const [groupName, items] of Object.entries(groups)) {
            const headerLi = document.createElement('li');
            headerLi.innerHTML = `
                <span class="item-serial" style="font-weight: 600;">📁 ${groupName}</span>
                <span class="group-arrow">${forceExpand ? '▲' : '▼'}</span>
            `;
            headerLi.style.background = 'rgba(0,0,0,0.03)';
            
            const childLis = items.map(server => {
                const childName = server.serial.substring(groupName.length + 1);
                const childLi = document.createElement('li');
                childLi.innerHTML = `<span class="item-serial" style="padding-left: 20px;">↳ ${childName}</span><span class="item-date">${server.date}</span>`;
                if (!forceExpand) childLi.classList.add('hidden');
                childLi.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectServer(server.serial);
                });
                return childLi;
            });
            
            headerLi.addEventListener('click', (e) => {
                e.stopPropagation();
                if (childLis.length === 0) return;
                const isCurrentlyHidden = childLis[0].classList.contains('hidden');
                childLis.forEach(c => c.classList.toggle('hidden', !isCurrentlyHidden));
                headerLi.querySelector('.group-arrow').textContent = isCurrentlyHidden ? '▲' : '▼';
            });
            
            serverList.appendChild(headerLi);
            childLis.forEach(c => serverList.appendChild(c));
        }

        ungrouped.forEach(server => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="item-serial">${server.serial}</span><span class="item-date">${server.date}</span>`;
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                selectServer(server.serial);
            });
            serverList.appendChild(li);
        });
    }

    let currentSelectedRun = null;
    const runSelect = document.getElementById('runSelect');

    async function selectServer(serial) {
        currentSelectedSerial = serial;
        serverSearch.value = serial;
        serverList.classList.add('hidden');
        
        try {
            const res = await fetch(`/api/servers/${btoa(serial)}/runs`);
            if (!res.ok) throw new Error('No runs found');
            const data = await res.json();
            
            runSelect.innerHTML = '';
            data.runs.forEach(run => {
                const opt = document.createElement('option');
                opt.value = run.run;
                opt.textContent = `${run.date} (${run.run})`;
                runSelect.appendChild(opt);
            });
            
            if (data.runs.length > 0) {
                const latestRun = data.runs[0].run;
                runSelect.value = latestRun;
                currentSelectedRun = latestRun;
                loadServerData(serial, latestRun);
            } else {
                dashboardContent.classList.add('hidden');
            }
        } catch (e) {
            console.error('Failed to load server runs', e);
            dashboardContent.classList.add('hidden');
        }
    }

    // Search input logic
    serverSearch.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        serverList.classList.remove('hidden');
        if (!term) {
            renderServerList(allServers, "");
            return;
        }
        const filtered = allServers.filter(s => s.serial.toLowerCase().includes(term) || s.date.toLowerCase().includes(term));
        renderServerList(filtered, term);
    });

    serverSearch.addEventListener('focus', () => {
        serverList.classList.remove('hidden');
    });

    // Hide list when clicking outside
    document.addEventListener('click', (e) => {
        if (!serverSearch.contains(e.target) && !serverList.contains(e.target)) {
            serverList.classList.add('hidden');
        }
    });

    async function loadServerData(serial, run) {
        try {
            const res = await fetch(`/api/servers/${btoa(serial)}/runs/${run}`);
            if (!res.ok) throw new Error('Data not found');
            const data = await res.json();
            
            if (data.metadata) {
                document.getElementById('metaCustomer').value = data.metadata.customer || '';
                document.getElementById('metaSO').value = data.metadata.so_number || '';
                document.getElementById('metaServerName').value = data.metadata.server_name || '';
                document.getElementById('metaNotes').value = data.metadata.notes || '';
            }
            
            // Populate cards
            populateGroup('sysData', data.system);
            populateGroup('chassisData', data.chassis);
            populateGroup('mbData', data.motherboard);
            
            const ramData = {
                'Used Slots': data.ram.used,
                'Total Slots': data.ram.total
            };
            populateGroup('ramData', ramData);
            
            const bmcData = {
                'Firmware': data.bmc
            };
            populateGroup('bmcData', bmcData);
            
            // CPU needs a bit custom handling since it's an array
            const cpuHtml = data.cpu.map(c => `<div><span class="data-value" style="text-align: left;">${c}</span></div>`).join('');
            document.getElementById('cpuData').innerHTML = cpuHtml;
            
            dashboardContent.classList.remove('hidden');
            
            // Load log files list
            loadLogFiles(serial, run);
            
        } catch (e) {
            console.error('Failed to load server data', e);
            dashboardContent.classList.add('hidden');
        }
    }

    function populateGroup(elementId, obj) {
        const el = document.getElementById(elementId);
        el.innerHTML = '';
        for (const [key, value] of Object.entries(obj)) {
            // format key from 'numer_seryjny' to 'Numer Seryjny'
            const formattedKey = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            el.innerHTML += `
                <div>
                    <span class="data-label">${formattedKey}</span>
                    <span class="data-value">${value}</span>
                </div>
            `;
        }
    }

    async function loadLogFiles(serial, run) {
        try {
            const res = await fetch(`/api/servers/${btoa(serial)}/runs/${run}/logs`);
            const data = await res.json();
            
            logFileSelect.innerHTML = '';
            data.files.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                logFileSelect.appendChild(opt);
            });
            
            // Select 1-raport-glowny.txt by default if it exists
            if (data.files.includes('1-raport-glowny.txt')) {
                logFileSelect.value = '1-raport-glowny.txt';
            }
            
            if (logFileSelect.value) {
                loadLogContent(serial, run, logFileSelect.value);
            }
        } catch (e) {
            console.error('Failed to load log files', e);
        }
    }

    async function loadLogContent(serial, run, filename) {
        try {
            logViewer.textContent = 'Loading...';
            const res = await fetch(`/api/servers/${btoa(serial)}/runs/${run}/logs/${filename}`);
            if (!res.ok) throw new Error('File not found');
            const text = await res.text();
            logViewer.textContent = text;
        } catch (e) {
            logViewer.textContent = 'Error loading log file: ' + e.message;
        }
    }

    document.getElementById('saveMetadataBtn').addEventListener('click', async () => {
        if (!currentSelectedSerial || !currentSelectedRun) return;
        
        const payload = {
            customer: document.getElementById('metaCustomer').value,
            so_number: document.getElementById('metaSO').value,
            server_name: document.getElementById('metaServerName').value,
            notes: document.getElementById('metaNotes').value
        };
        
        try {
            const btn = document.getElementById('saveMetadataBtn');
            btn.textContent = 'Saving...';
            btn.disabled = true;
            
            const res = await fetch(`/api/servers/${btoa(currentSelectedSerial)}/runs/${currentSelectedRun}/metadata`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) throw new Error('Failed to save metadata');
            
            setTimeout(() => {
                btn.textContent = 'Saved!';
                setTimeout(() => {
                    btn.textContent = 'Save Metadata';
                    btn.disabled = false;
                }, 1500);
            }, 300);
            
        } catch (e) {
            console.error(e);
            alert('Failed to save metadata.');
            const btn = document.getElementById('saveMetadataBtn');
            btn.textContent = 'Save Metadata';
            btn.disabled = false;
        }
    });


    refreshServersBtn.addEventListener('click', loadServers);
    
    runSelect.addEventListener('change', (e) => {
        if (currentSelectedSerial && e.target.value) {
            currentSelectedRun = e.target.value;
            loadServerData(currentSelectedSerial, currentSelectedRun);
        }
    });

    logFileSelect.addEventListener('change', (e) => {
        if (currentSelectedSerial && currentSelectedRun && e.target.value) {
            loadLogContent(currentSelectedSerial, currentSelectedRun, e.target.value);
        }
    });

    // --- DHCP Leases Logic ---
    const dhcpTableBody = document.getElementById('dhcpTableBody');

    function formatIpmiLink(ip) {
        if (!ip || ip === "-") return "-";
        const parts = ip.split('.');
        if (parts.length === 4) {
            const lastOctet = parseInt(parts[3], 10);
            const paddedPort = String(lastOctet).padStart(3, '0');
            const port = `10${paddedPort}`;
            return `<a href="https://${ip}:${port}" target="_blank" class="ipmi-link">https://${ip}:${port}</a>`;
        }
        return "-";
    }

    async function savePassword(mac, password) {
        try {
            await fetch('/api/passwords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac, password })
            });
        } catch (e) {
            console.error('Failed to save password', e);
        }
    }

    async function loadDhcpLeases() {
        try {
            const res = await fetch('/api/dhcp');
            const data = await res.json();
            
            // Only update table if we aren't currently focused on an input to avoid interrupting typing
            if (document.activeElement && document.activeElement.classList.contains('password-input')) {
                return;
            }
            
            dhcpTableBody.innerHTML = '';
            data.leases.forEach(lease => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${lease.mac}</td>
                    <td>${lease.ip}</td>
                    <td>${lease.hostname}</td>
                    <td>${lease.manufacturer}</td>
                    <td>${formatIpmiLink(lease.ip)}</td>
                    <td>
                        <input type="text" class="styled-input password-input" data-mac="${lease.mac}" value="${lease.password || ''}" placeholder="Save password...">
                    </td>
                `;
                dhcpTableBody.appendChild(tr);
            });
            
            // Attach events to new inputs
            document.querySelectorAll('.password-input').forEach(input => {
                input.addEventListener('change', (e) => {
                    const mac = e.target.getAttribute('data-mac');
                    const pwd = e.target.value;
                    savePassword(mac, pwd);
                });
            });
            
        } catch (e) {
            console.error('Failed to load DHCP leases', e);
        }
    }

    // Initial load
    loadServers();
    loadDhcpLeases();
    
    // Auto refresh DHCP leases every 5s
    setInterval(loadDhcpLeases, 5000);
});
