document.addEventListener('DOMContentLoaded', () => {
    // --- Tabs Logic ---
    const tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
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

    // --- State ---
    let allServers = [];
    let currentDhcpLeases = [];
    let currentSelectedSerial = null;
    let currentSelectedRun = null;
    let currentSelectedLogFile = null;
    let checkedSerials = new Set();
    let expandedGroups = new Set();
    let visibleSerials = [];
    let copiedMetadata = null;
    let savedServerMetadata = { customer: '', so_number: '', server_name: '', notes: '' };

    try {
        const savedClip = localStorage.getItem('copiedServerMetadata');
        if (savedClip) {
            copiedMetadata = JSON.parse(savedClip);
        }
    } catch (e) {
        copiedMetadata = null;
    }

    // --- DOM Elements ---
    const serverSearch = document.getElementById('serverSearch');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const serverList = document.getElementById('serverList');
    const refreshServersBtn = document.getElementById('refreshServersBtn');
    const batchEditBtn = document.getElementById('batchEditBtn');
    const batchCountBadge = document.getElementById('batchCountBadge');
    const linkIpmiBtn = document.getElementById('linkIpmiBtn');
    const selectAllVisibleCheck = document.getElementById('selectAllVisibleCheck');
    const serverCountLabel = document.getElementById('serverCountLabel');

    const emptyServerState = document.getElementById('emptyServerState');
    const dashboardContent = document.getElementById('dashboardContent');
    const logViewer = document.getElementById('logViewer');

    // Metadata Copy/Paste & Form Elements
    const copiedSourceBadge = document.getElementById('copiedSourceBadge');
    const copyMetadataBtn = document.getElementById('copyMetadataBtn');
    const copyMetadataBtnLabel = document.getElementById('copyMetadataBtnLabel');
    const pasteMetadataBtn = document.getElementById('pasteMetadataBtn');
    const copyToCheckedBtn = document.getElementById('copyToCheckedBtn');
    const copyToCheckedBadge = document.getElementById('copyToCheckedBadge');
    const metaCustomerInput = document.getElementById('metaCustomer');
    const metaSOInput = document.getElementById('metaSO');
    const metaServerNameInput = document.getElementById('metaServerName');
    const metaNotesInput = document.getElementById('metaNotes');
    const metadataDirtyIndicator = document.getElementById('metadataDirtyIndicator');

    // Custom Dropdown Elements (Run, Log File, Batch Source)
    const runSelectWrapper = document.getElementById('runSelectWrapper');
    const runSelectTrigger = document.getElementById('runSelectTrigger');
    const runSelectLabel = document.getElementById('runSelectLabel');
    const runSelectMenu = document.getElementById('runSelectMenu');

    const logFileSelectWrapper = document.getElementById('logFileSelectWrapper');
    const logFileSelectTrigger = document.getElementById('logFileSelectTrigger');
    const logFileSelectLabel = document.getElementById('logFileSelectLabel');
    const logFileSelectMenu = document.getElementById('logFileSelectMenu');

    const batchSourceWrapper = document.getElementById('batchSourceWrapper');
    const batchSourceTrigger = document.getElementById('batchSourceTrigger');
    const batchSourceLabel = document.getElementById('batchSourceLabel');
    const batchSourceMenu = document.getElementById('batchSourceMenu');

    // Filter Checkboxes
    const filterFieldSerial = document.getElementById('filterFieldSerial');
    const filterFieldCustomer = document.getElementById('filterFieldCustomer');
    const filterFieldSO = document.getElementById('filterFieldSO');
    const filterFieldServerName = document.getElementById('filterFieldServerName');
    const filterFieldNotes = document.getElementById('filterFieldNotes');
    const filterStatusOnline = document.getElementById('filterStatusOnline');
    const filterStatusLinked = document.getElementById('filterStatusLinked');
    const filterStatusMetadata = document.getElementById('filterStatusMetadata');

    // Server Active IPMI Card Elements
    const serverIpmiCard = document.getElementById('serverIpmiCard');
    const serverIpmiMac = document.getElementById('serverIpmiMac');
    const serverIpmiIp = document.getElementById('serverIpmiIp');
    const serverIpmiHostname = document.getElementById('serverIpmiHostname');
    const serverIpmiLinkCell = document.getElementById('serverIpmiLinkCell');
    const serverIpmiPassword = document.getElementById('serverIpmiPassword');

    // Disks Elements
    const sataDiskCount = document.getElementById('sataDiskCount');
    const nvmeDiskCount = document.getElementById('nvmeDiskCount');
    const disksContainer = document.getElementById('disksContainer');

    // --- Helper Functions ---
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function encodeSerial(serial) {
        return btoa(serial);
    }

    function isMacOnline(mac) {
        if (!mac) return null;
        const norm = mac.trim().toLowerCase();
        return currentDhcpLeases.find(l => (l.mac || '').toLowerCase() === norm) || null;
    }

    function hasAnyMetadata(meta) {
        if (!meta) return false;
        return Boolean(
            (meta.customer && meta.customer.trim()) ||
            (meta.so_number && meta.so_number.trim()) ||
            (meta.server_name && meta.server_name.trim()) ||
            (meta.notes && meta.notes.trim())
        );
    }

    function formatIpmiLink(ip) {
        if (!ip || ip === "-") return "-";
        const parts = ip.split('.');
        if (parts.length === 4) {
            const lastOctet = parseInt(parts[3], 10);
            const paddedPort = String(lastOctet).padStart(3, '0');
            const port = `10${paddedPort}`;
            return `<a href="https://192.168.2.95:${port}" target="_blank" class="ipmi-link">https://192.168.2.95:${port}</a>`;
        }
        return "-";
    }

    // --- Custom Dropdown Helpers ---
    function closeAllCustomSelects() {
        [
            [runSelectMenu, runSelectTrigger],
            [logFileSelectMenu, logFileSelectTrigger],
            [batchSourceMenu, batchSourceTrigger]
        ].forEach(([menu, trigger]) => {
            if (menu) menu.classList.add('hidden');
            if (trigger) trigger.classList.remove('open');
        });
    }

    function bindCustomSelectToggle(triggerEl, menuEl) {
        if (!triggerEl || !menuEl) return;
        triggerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !menuEl.classList.contains('hidden');
            closeAllCustomSelects();
            if (!isOpen) {
                menuEl.classList.remove('hidden');
                triggerEl.classList.add('open');
            }
        });
    }

    bindCustomSelectToggle(runSelectTrigger, runSelectMenu);
    bindCustomSelectToggle(logFileSelectTrigger, logFileSelectMenu);
    bindCustomSelectToggle(batchSourceTrigger, batchSourceMenu);

    document.addEventListener('click', (e) => {
        if (
            !runSelectWrapper.contains(e.target) &&
            !logFileSelectWrapper.contains(e.target) &&
            (!batchSourceWrapper || !batchSourceWrapper.contains(e.target))
        ) {
            closeAllCustomSelects();
        }
    });

    function populateCustomSelect(menuEl, labelEl, items, selectedValue, onSelect, placeholderText = '-') {
        menuEl.innerHTML = '';
        const selectedItem = items.find(i => i.value === selectedValue) || null;
        labelEl.textContent = selectedItem ? selectedItem.label : placeholderText;

        items.forEach(item => {
            const li = document.createElement('li');
            li.className = `custom-select-item${selectedItem && item.value === selectedItem.value ? ' selected' : ''}`;
            li.textContent = item.label;
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                labelEl.textContent = item.label;
                menuEl.querySelectorAll('.custom-select-item').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected');
                closeAllCustomSelects();
                onSelect(item.value);
            });
            menuEl.appendChild(li);
        });
    }

    // --- Copy / Paste Metadata State UI ---
    function updateCopyPasteState() {
        if (copiedMetadata) {
            pasteMetadataBtn.disabled = false;
            copiedSourceBadge.textContent = `Schowek: ${copiedMetadata.sourceSerial || 'skopiowano'}`;
            copiedSourceBadge.classList.remove('hidden');
        } else {
            pasteMetadataBtn.disabled = true;
            copiedSourceBadge.classList.add('hidden');
        }

        const count = checkedSerials.size;
        copyToCheckedBtn.disabled = count < 1;
        if (count > 0) {
            copyToCheckedBadge.textContent = count;
            copyToCheckedBadge.classList.remove('hidden');
        } else {
            copyToCheckedBadge.classList.add('hidden');
        }
    }

    // --- Toolbar & Selection State ---
    function updateToolbarState() {
        const count = checkedSerials.size;
        batchEditBtn.disabled = count < 2;
        if (count > 0) {
            batchCountBadge.textContent = count;
            batchCountBadge.classList.remove('hidden');
        } else {
            batchCountBadge.classList.add('hidden');
        }

        linkIpmiBtn.disabled = !currentSelectedSerial;

        if (visibleSerials.length === 0) {
            selectAllVisibleCheck.checked = false;
            selectAllVisibleCheck.indeterminate = false;
        } else {
            const checkedVisibleCount = visibleSerials.filter(s => checkedSerials.has(s)).length;
            selectAllVisibleCheck.checked = checkedVisibleCount === visibleSerials.length;
            selectAllVisibleCheck.indeterminate = checkedVisibleCount > 0 && checkedVisibleCount < visibleSerials.length;
        }

        updateCopyPasteState();
    }

    // --- Filtering & Tree Rendering ---
    function getFilteredServers() {
        const term = serverSearch.value.trim().toLowerCase();
        const bySerial = filterFieldSerial.checked;
        const byCustomer = filterFieldCustomer.checked;
        const bySO = filterFieldSO.checked;
        const byServerName = filterFieldServerName.checked;
        const byNotes = filterFieldNotes.checked;

        const reqOnline = filterStatusOnline.checked;
        const reqLinked = filterStatusLinked.checked;
        const reqMetadata = filterStatusMetadata.checked;

        return allServers.filter(s => {
            const m = s.metadata || {};
            const linkedMac = s.linked_mac || '';

            if (reqLinked && !linkedMac) return false;
            if (reqOnline && !isMacOnline(linkedMac)) return false;
            if (reqMetadata && !hasAnyMetadata(m)) return false;

            if (!term) return true;

            const anyFieldChecked = bySerial || byCustomer || bySO || byServerName || byNotes;
            if (!anyFieldChecked) {
                return s.serial.toLowerCase().includes(term);
            }

            if (bySerial && s.serial.toLowerCase().includes(term)) return true;
            if (byCustomer && m.customer && m.customer.toLowerCase().includes(term)) return true;
            if (bySO && m.so_number && m.so_number.toLowerCase().includes(term)) return true;
            if (byServerName && m.server_name && m.server_name.toLowerCase().includes(term)) return true;
            if (byNotes && m.notes && m.notes.toLowerCase().includes(term)) return true;

            return false;
        });
    }

    function buildSubtitle(server) {
        const m = server.metadata || {};
        const parts = [];
        if (m.customer && m.customer.trim()) parts.push(m.customer.trim());
        if (m.server_name && m.server_name.trim()) parts.push(m.server_name.trim());
        if (parts.length === 0 && server.model && server.model !== 'N/A') {
            parts.push(server.model.trim());
        }
        return parts.join(' • ');
    }

    function buildTreeSubtitleLines(server) {
        const m = server.metadata || {};
        const customer = (m.customer || '').trim();
        const serverName = (m.server_name || '').trim();
        const lines = [];
        if (customer) lines.push(customer);
        if (serverName) lines.push(serverName);
        if (lines.length === 0 && server.model && server.model !== 'N/A') {
            lines.push(server.model.trim());
        }
        return lines;
    }

    function createServerRowLi(server, displaySerial, isChild = false) {
        const li = document.createElement('li');
        const isSelected = server.serial === currentSelectedSerial;
        const isChecked = checkedSerials.has(server.serial);
        const linkedMac = server.linked_mac || '';
        const lease = isMacOnline(linkedMac);

        let statusDotHtml = '';
        if (lease) {
            statusDotHtml = `<span class="status-dot online" title="W sieci DHCP (${escapeHtml(lease.ip)} / ${escapeHtml(linkedMac)})"></span>`;
        } else if (linkedMac) {
            statusDotHtml = `<span class="status-dot linked-offline" title="Powiązany MAC (${escapeHtml(linkedMac)}) - poza siecią DHCP"></span>`;
        }

        const subtitleLines = buildTreeSubtitleLines(server);
        const subHtml = subtitleLines
            .map(line => `<span class="item-sub" title="${escapeHtml(line)}">${escapeHtml(line)}</span>`)
            .join('');

        const rowDiv = document.createElement('div');
        rowDiv.className = `tree-row${isChild ? ' child-row' : ''}${isSelected ? ' active' : ''}`;
        rowDiv.innerHTML = `
            <div class="tree-item-left">
                <label class="tree-check-hitarea" title="Zaznacz do edycji grupowej">
                    <input type="checkbox" class="tree-checkbox server-item-check" ${isChecked ? 'checked' : ''}>
                </label>
                <div class="tree-item-info">
                    <div class="item-serial-row">
                        <span class="item-serial">${escapeHtml(displaySerial)}</span>
                        ${statusDotHtml}
                    </div>
                    ${subHtml}
                </div>
            </div>
            <span class="item-date">${escapeHtml(server.date.split(' ')[0])}</span>
        `;

        const hitArea = rowDiv.querySelector('.tree-check-hitarea');
        const checkbox = rowDiv.querySelector('.server-item-check');
        hitArea.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                checkedSerials.add(server.serial);
            } else {
                checkedSerials.delete(server.serial);
            }
            renderServerTree();
        });

        rowDiv.addEventListener('click', () => {
            selectServer(server.serial);
        });

        li.appendChild(rowDiv);
        return li;
    }

    function renderServerTree() {
        const filtered = getFilteredServers();
        visibleSerials = filtered.map(s => s.serial);
        serverCountLabel.textContent = filtered.length;
        serverList.innerHTML = '';

        if (filtered.length === 0) {
            const emptyLi = document.createElement('li');
            emptyLi.className = 'tree-empty';
            emptyLi.textContent = 'Brak serwerów spełniających kryteria.';
            serverList.appendChild(emptyLi);
            updateToolbarState();
            return;
        }

        const groups = {};
        const ungrouped = [];

        filtered.forEach(server => {
            const parts = server.serial.split('/');
            if (parts.length > 1) {
                const groupName = parts[0];
                if (!groups[groupName]) groups[groupName] = [];
                groups[groupName].push(server);
            } else {
                ungrouped.push(server);
            }
        });

        const hasSearchOrFilter = serverSearch.value.trim().length > 0 ||
            filterStatusOnline.checked || filterStatusLinked.checked || filterStatusMetadata.checked;

        for (const [groupName, items] of Object.entries(groups)) {
            const isExpanded = hasSearchOrFilter || expandedGroups.has(groupName) || items.some(s => s.serial === currentSelectedSerial);
            const groupSerials = items.map(s => s.serial);
            const checkedInGroup = groupSerials.filter(s => checkedSerials.has(s)).length;
            const allGroupChecked = checkedInGroup === groupSerials.length && groupSerials.length > 0;
            const someGroupChecked = checkedInGroup > 0 && checkedInGroup < groupSerials.length;

            const headerLi = document.createElement('li');
            const headerDiv = document.createElement('div');
            headerDiv.className = 'tree-group-header';
            headerDiv.innerHTML = `
                <div class="tree-group-left">
                    <label class="tree-check-hitarea" title="Zaznacz całą grupę">
                        <input type="checkbox" class="tree-checkbox group-check" ${allGroupChecked ? 'checked' : ''}>
                    </label>
                    <span>${escapeHtml(groupName)} <small style="color: #86868b; font-weight: 500;">(${items.length})</small></span>
                </div>
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#86868b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${isExpanded ? '90deg' : '0deg'}); transition: transform 0.15s ease;">
                    <path d="M6 4l4 4-4 4"/>
                </svg>
            `;

            const groupHitArea = headerDiv.querySelector('.tree-check-hitarea');
            const groupCheckbox = headerDiv.querySelector('.group-check');
            groupCheckbox.indeterminate = someGroupChecked;
            groupHitArea.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            groupCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    groupSerials.forEach(s => checkedSerials.add(s));
                } else {
                    groupSerials.forEach(s => checkedSerials.delete(s));
                }
                renderServerTree();
            });

            headerDiv.addEventListener('click', () => {
                if (expandedGroups.has(groupName)) {
                    expandedGroups.delete(groupName);
                } else {
                    expandedGroups.add(groupName);
                }
                renderServerTree();
            });

            headerLi.appendChild(headerDiv);
            serverList.appendChild(headerLi);

            if (isExpanded) {
                items.forEach(server => {
                    const childName = server.serial.substring(groupName.length + 1);
                    const childLi = createServerRowLi(server, `↳ ${childName}`, true);
                    serverList.appendChild(childLi);
                });
            }
        }

        ungrouped.forEach(server => {
            const li = createServerRowLi(server, server.serial, false);
            serverList.appendChild(li);
        });

        updateToolbarState();
    }

    // --- Load Servers ---
    async function loadServers() {
        try {
            const res = await fetch('/api/servers');
            const data = await res.json();
            allServers = data.servers || [];

            const existingSet = new Set(allServers.map(s => s.serial));
            for (const s of Array.from(checkedSerials)) {
                if (!existingSet.has(s)) checkedSerials.delete(s);
            }

            if (currentSelectedSerial && !existingSet.has(currentSelectedSerial)) {
                currentSelectedSerial = null;
                currentSelectedRun = null;
                dashboardContent.classList.add('hidden');
                emptyServerState.classList.remove('hidden');
            }

            renderServerTree();
            updateServerIpmiCard();
        } catch (e) {
            console.error('Failed to load servers', e);
        }
    }

    // --- Select Server & Load Details ---
    async function selectServer(serial) {
        currentSelectedSerial = serial;
        const parts = serial.split('/');
        if (parts.length > 1) {
            expandedGroups.add(parts[0]);
        }
        renderServerTree();

        try {
            const res = await fetch(`/api/servers/${encodeSerial(serial)}/runs`);
            if (!res.ok) throw new Error('No runs found');
            const data = await res.json();

            const runs = data.runs || [];
            if (runs.length > 0) {
                const latestRun = runs[0].run;
                currentSelectedRun = latestRun;
                const runItems = runs.map(r => ({
                    value: r.run,
                    label: `${r.date} (${r.run})`
                }));
                populateCustomSelect(runSelectMenu, runSelectLabel, runItems, latestRun, (newRun) => {
                    currentSelectedRun = newRun;
                    loadServerData(serial, newRun);
                });
                await loadServerData(serial, latestRun);
            } else {
                dashboardContent.classList.add('hidden');
                emptyServerState.classList.remove('hidden');
            }
        } catch (e) {
            console.error('Failed to load server runs', e);
            dashboardContent.classList.add('hidden');
            emptyServerState.classList.remove('hidden');
        }
    }

    function renderDisksSection(disks) {
        const sataList = (disks && disks.sata) ? disks.sata : [];
        const nvmeList = (disks && disks.nvme) ? disks.nvme : [];
        const sataCountVal = (disks && typeof disks.sata_count === 'number') ? disks.sata_count : sataList.length;
        const nvmeCountVal = (disks && typeof disks.nvme_count === 'number') ? disks.nvme_count : nvmeList.length;

        sataDiskCount.textContent = sataCountVal;
        nvmeDiskCount.textContent = nvmeCountVal;

        const combined = [
            ...sataList.map(d => ({ type: 'SATA/SAS', badgeClass: 'sata', ...d })),
            ...nvmeList.map(d => ({ type: 'NVMe', badgeClass: 'nvme', ...d }))
        ];

        if (combined.length === 0) {
            disksContainer.innerHTML = `<div style="color: #86868b; font-size: 13.5px; padding: 8px 0;">Brak wykrytych dysków SATA/SAS oraz NVMe w raporcie.</div>`;
            return;
        }

        const rowsHtml = combined.map(d => `
            <tr>
                <td><span class="disk-type-badge ${d.badgeClass}">${escapeHtml(d.type)}</span></td>
                <td style="font-family: monospace; color: #6e6e73;">${escapeHtml(d.device || '-')}</td>
                <td style="font-weight: 500;">${escapeHtml(d.pn || 'N/A')}</td>
                <td style="font-family: monospace; font-weight: 600;">${escapeHtml(d.sn || 'N/A')}</td>
            </tr>
        `).join('');

        disksContainer.innerHTML = `
            <div class="table-container">
                <table class="styled-table">
                    <thead>
                        <tr>
                            <th>Typ</th>
                            <th>Urządzenie</th>
                            <th>Part Number / Model (PN)</th>
                            <th>Numer Seryjny (SN)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        `;
    }

    function updateServerIpmiCard() {
        if (!currentSelectedSerial) {
            serverIpmiCard.classList.add('hidden');
            return;
        }
        const serverObj = allServers.find(s => s.serial === currentSelectedSerial);
        const linkedMac = serverObj ? (serverObj.linked_mac || '') : '';
        if (!linkedMac) {
            serverIpmiCard.classList.add('hidden');
            return;
        }

        const activeLease = isMacOnline(linkedMac);
        if (!activeLease) {
            serverIpmiCard.classList.add('hidden');
            return;
        }

        serverIpmiCard.classList.remove('hidden');
        serverIpmiMac.textContent = activeLease.mac;
        serverIpmiIp.textContent = activeLease.ip;
        serverIpmiHostname.textContent = `Nazwa hosta: ${activeLease.hostname || '-'} | Producent: ${activeLease.manufacturer || '-'}`;
        serverIpmiLinkCell.innerHTML = formatIpmiLink(activeLease.ip);
        serverIpmiPassword.setAttribute('data-mac', activeLease.mac);

        if (document.activeElement !== serverIpmiPassword) {
            serverIpmiPassword.value = activeLease.password || '';
        }
    }

    function updateMetadataDirtyState() {
        if (!metadataDirtyIndicator) return;
        const isDirty =
            (metaCustomerInput.value || '') !== (savedServerMetadata.customer || '') ||
            (metaSOInput.value || '') !== (savedServerMetadata.so_number || '') ||
            (metaServerNameInput.value || '') !== (savedServerMetadata.server_name || '') ||
            (metaNotesInput.value || '') !== (savedServerMetadata.notes || '');
        if (isDirty) {
            metadataDirtyIndicator.classList.remove('hidden');
        } else {
            metadataDirtyIndicator.classList.add('hidden');
        }
    }

    [metaCustomerInput, metaSOInput, metaServerNameInput, metaNotesInput].forEach(el => {
        if (el) {
            el.addEventListener('input', updateMetadataDirtyState);
        }
    });

    async function loadServerData(serial, run) {
        try {
            const res = await fetch(`/api/servers/${encodeSerial(serial)}/runs/${run}`);
            if (!res.ok) throw new Error('Data not found');
            const data = await res.json();

            const meta = data.metadata || {};
            savedServerMetadata = {
                customer: meta.customer || '',
                so_number: meta.so_number || '',
                server_name: meta.server_name || '',
                notes: meta.notes || ''
            };
            metaCustomerInput.value = savedServerMetadata.customer;
            metaSOInput.value = savedServerMetadata.so_number;
            metaServerNameInput.value = savedServerMetadata.server_name;
            metaNotesInput.value = savedServerMetadata.notes;
            updateMetadataDirtyState();

            const serverIdx = allServers.findIndex(s => s.serial === serial);
            if (serverIdx !== -1) {
                if (data.metadata) allServers[serverIdx].metadata = data.metadata;
                if (data.linked_mac !== undefined) allServers[serverIdx].linked_mac = data.linked_mac;
                if (data.system && data.system.model && data.system.model !== 'N/A') {
                    allServers[serverIdx].model = data.system.model;
                }
            }

            populateGroup('sysData', data.system);
            populateGroup('chassisData', data.chassis);
            populateGroup('mbData', data.motherboard);

            populateGroup('ramData', {
                'Całkowita pamięć': (data.ram && data.ram.capacity) ? data.ram.capacity : 'N/A',
                'Zajęte sloty': data.ram ? data.ram.used : 'N/A',
                'Wszystkie sloty': data.ram ? data.ram.total : 'N/A'
            });

            populateGroup('bmcData', {
                'Firmware': data.bmc,
                'Powiązany MAC': data.linked_mac || 'Brak'
            });

            const cpuHtml = (data.cpu || []).map(c => `<div><span class="data-value" style="text-align: left;">${escapeHtml(c)}</span></div>`).join('');
            document.getElementById('cpuData').innerHTML = cpuHtml || '<div><span class="data-value">N/A</span></div>';

            renderDisksSection(data.disks);
            updateServerIpmiCard();

            emptyServerState.classList.add('hidden');
            dashboardContent.classList.remove('hidden');

            loadLogFiles(serial, run);
        } catch (e) {
            console.error('Failed to load server data', e);
            dashboardContent.classList.add('hidden');
            emptyServerState.classList.remove('hidden');
        }
    }

    function populateGroup(elementId, obj) {
        const el = document.getElementById(elementId);
        el.innerHTML = '';
        for (const [key, value] of Object.entries(obj || {})) {
            const formattedKey = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            el.innerHTML += `
                <div>
                    <span class="data-label">${escapeHtml(formattedKey)}</span>
                    <span class="data-value">${escapeHtml(value)}</span>
                </div>
            `;
        }
    }

    async function loadLogFiles(serial, run) {
        try {
            const res = await fetch(`/api/servers/${encodeSerial(serial)}/runs/${run}/logs`);
            const data = await res.json();
            const files = data.files || [];

            const defaultFile = files.includes('1-raport-glowny.txt')
                ? '1-raport-glowny.txt'
                : (files[0] || '');

            currentSelectedLogFile = defaultFile;
            const fileItems = files.map(f => ({ value: f, label: f }));

            populateCustomSelect(logFileSelectMenu, logFileSelectLabel, fileItems, defaultFile, (newFile) => {
                currentSelectedLogFile = newFile;
                loadLogContent(serial, run, newFile);
            });

            if (defaultFile) {
                loadLogContent(serial, run, defaultFile);
            } else {
                logViewer.textContent = '';
            }
        } catch (e) {
            console.error('Failed to load log files', e);
        }
    }

    async function loadLogContent(serial, run, filename) {
        try {
            logViewer.textContent = 'Ładowanie...';
            const res = await fetch(`/api/servers/${encodeSerial(serial)}/runs/${run}/logs/${filename}`);
            if (!res.ok) throw new Error('Nie znaleziono pliku');
            const text = await res.text();
            logViewer.textContent = text;
        } catch (e) {
            logViewer.textContent = 'Błąd ładowania pliku logu: ' + e.message;
        }
    }

    // --- Single Server Metadata Save & Copy/Paste ---
    copyMetadataBtn.addEventListener('click', () => {
        if (!currentSelectedSerial) return;
        copiedMetadata = {
            sourceSerial: currentSelectedSerial,
            customer: document.getElementById('metaCustomer').value,
            so_number: document.getElementById('metaSO').value,
            server_name: document.getElementById('metaServerName').value,
            notes: document.getElementById('metaNotes').value
        };
        try {
            localStorage.setItem('copiedServerMetadata', JSON.stringify(copiedMetadata));
        } catch (e) {}

        updateCopyPasteState();
        copyMetadataBtnLabel.textContent = 'Skopiowano!';
        setTimeout(() => {
            copyMetadataBtnLabel.textContent = 'Kopiuj';
        }, 1200);
    });

    pasteMetadataBtn.addEventListener('click', () => {
        if (!copiedMetadata) return;
        metaCustomerInput.value = copiedMetadata.customer || '';
        metaSOInput.value = copiedMetadata.so_number || '';
        metaServerNameInput.value = copiedMetadata.server_name || '';
        metaNotesInput.value = copiedMetadata.notes || '';
        updateMetadataDirtyState();
    });

    copyToCheckedBtn.addEventListener('click', () => {
        if (checkedSerials.size < 1) return;
        const currentMeta = {
            customer: document.getElementById('metaCustomer').value,
            so_number: document.getElementById('metaSO').value,
            server_name: document.getElementById('metaServerName').value,
            notes: document.getElementById('metaNotes').value
        };
        openBatchEditModal(currentMeta, currentSelectedSerial);
    });

    document.getElementById('saveMetadataBtn').addEventListener('click', async () => {
        if (!currentSelectedSerial || !currentSelectedRun) return;

        const payload = {
            customer: document.getElementById('metaCustomer').value,
            so_number: document.getElementById('metaSO').value,
            server_name: document.getElementById('metaServerName').value,
            notes: document.getElementById('metaNotes').value
        };

        const btn = document.getElementById('saveMetadataBtn');
        try {
            btn.textContent = 'Zapisywanie...';
            btn.disabled = true;

            const res = await fetch(`/api/servers/${encodeSerial(currentSelectedSerial)}/runs/${currentSelectedRun}/metadata`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to save metadata');

            savedServerMetadata = { ...payload };
            updateMetadataDirtyState();

            const srv = allServers.find(s => s.serial === currentSelectedSerial);
            if (srv) srv.metadata = { ...payload };
            renderServerTree();

            setTimeout(() => {
                btn.textContent = 'Zapisano!';
                setTimeout(() => {
                    btn.textContent = 'Zapisz';
                    btn.disabled = false;
                }, 1200);
            }, 200);
        } catch (e) {
            console.error(e);
            alert('Nie udało się zapisać danych.');
            btn.textContent = 'Zapisz';
            btn.disabled = false;
        }
    });

    // --- Search Input & Clear Button Logic ---
    function updateClearSearchButton() {
        if (serverSearch.value.length > 0) {
            clearSearchBtn.classList.remove('hidden');
        } else {
            clearSearchBtn.classList.add('hidden');
        }
    }

    serverSearch.addEventListener('input', () => {
        updateClearSearchButton();
        renderServerTree();
    });

    clearSearchBtn.addEventListener('click', () => {
        serverSearch.value = '';
        updateClearSearchButton();
        renderServerTree();
        serverSearch.focus();
    });

    [
        filterFieldSerial,
        filterFieldCustomer,
        filterFieldSO,
        filterFieldServerName,
        filterFieldNotes,
        filterStatusOnline,
        filterStatusLinked,
        filterStatusMetadata
    ].forEach(cb => {
        cb.addEventListener('change', () => renderServerTree());
    });

    selectAllVisibleCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            visibleSerials.forEach(s => checkedSerials.add(s));
        } else {
            visibleSerials.forEach(s => checkedSerials.delete(s));
        }
        renderServerTree();
    });

    refreshServersBtn.addEventListener('click', async () => {
        await loadDhcpLeases();
        await loadServers();
    });

    // --- Batch Edit Metadata Modal Logic ---
    const batchEditModal = document.getElementById('batchEditModal');
    const closeBatchModalBtn = document.getElementById('closeBatchModalBtn');
    const cancelBatchModalBtn = document.getElementById('cancelBatchModalBtn');
    const saveBatchMetadataBtn = document.getElementById('saveBatchMetadataBtn');
    const batchModalCount = document.getElementById('batchModalCount');
    const batchSerialChips = document.getElementById('batchSerialChips');

    const batchFields = [
        { key: 'customer', inputId: 'batchMetaCustomer' },
        { key: 'so_number', inputId: 'batchMetaSO' },
        { key: 'server_name', inputId: 'batchMetaServerName' },
        { key: 'notes', inputId: 'batchMetaNotes' }
    ];

    document.querySelectorAll('.batch-clear-check').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const targetId = e.target.getAttribute('data-target');
            const inputEl = document.getElementById(targetId);
            if (!inputEl) return;
            if (e.target.checked) {
                inputEl.value = '';
                inputEl.disabled = true;
                inputEl.placeholder = 'Pole zostanie wyczyszczone...';
            } else {
                inputEl.disabled = false;
                inputEl.placeholder = 'Bez zmian...';
            }
        });
    });

    function fillBatchModalFields(metaObj) {
        batchFields.forEach(f => {
            const inputEl = document.getElementById(f.inputId);
            const clearCb = document.querySelector(`.batch-clear-check[data-target="${f.inputId}"]`);
            if (clearCb) clearCb.checked = false;
            if (inputEl) {
                inputEl.disabled = false;
                inputEl.placeholder = 'Bez zmian...';
                inputEl.value = (metaObj && metaObj[f.key]) ? metaObj[f.key] : '';
            }
        });
    }

    function openBatchEditModal(prefillMeta = null, prefillSourceSerial = null) {
        if (checkedSerials.size < 1) return;
        const serialList = Array.from(checkedSerials);
        batchModalCount.textContent = serialList.length;
        batchSerialChips.innerHTML = serialList.map(s => `<span class="serial-chip">${escapeHtml(s)}</span>`).join('');

        fillBatchModalFields(prefillMeta);

        // Populate source server selector
        const sourceItems = [];
        if (copiedMetadata) {
            sourceItems.push({
                value: '__clipboard__',
                label: `📋 Schowek (${copiedMetadata.sourceSerial || 'skopiowane'})`
            });
        }
        allServers.forEach(s => {
            const sub = buildSubtitle(s);
            sourceItems.push({
                value: s.serial,
                label: sub ? `${s.serial} (${sub})` : s.serial
            });
        });

        populateCustomSelect(
            batchSourceMenu,
            batchSourceLabel,
            sourceItems,
            prefillSourceSerial || '',
            (selectedVal) => {
                if (selectedVal === '__clipboard__' && copiedMetadata) {
                    fillBatchModalFields(copiedMetadata);
                } else {
                    const srcSrv = allServers.find(s => s.serial === selectedVal);
                    if (srcSrv && srcSrv.metadata) {
                        fillBatchModalFields(srcSrv.metadata);
                    }
                }
            },
            'Wybierz serwer źródłowy...'
        );

        batchEditModal.classList.remove('hidden');
    }

    function closeBatchEditModal() {
        batchEditModal.classList.add('hidden');
    }

    batchEditBtn.addEventListener('click', () => {
        if (checkedSerials.size < 2) return;
        openBatchEditModal(null, null);
    });
    closeBatchModalBtn.addEventListener('click', closeBatchEditModal);
    cancelBatchModalBtn.addEventListener('click', closeBatchEditModal);
    batchEditModal.addEventListener('click', (e) => {
        if (e.target === batchEditModal) closeBatchEditModal();
    });

    saveBatchMetadataBtn.addEventListener('click', async () => {
        if (checkedSerials.size < 1) return;

        const updates = {};
        batchFields.forEach(f => {
            const inputEl = document.getElementById(f.inputId);
            const clearCb = document.querySelector(`.batch-clear-check[data-target="${f.inputId}"]`);
            if (clearCb && clearCb.checked) {
                updates[f.key] = '';
            } else if (inputEl && inputEl.value.trim() !== '') {
                updates[f.key] = inputEl.value.trim();
            }
        });

        if (Object.keys(updates).length === 0) {
            alert('Wprowadź wartość przynajmniej w jednym polu lub zaznacz „Wyczyść”.');
            return;
        }

        try {
            saveBatchMetadataBtn.disabled = true;
            saveBatchMetadataBtn.textContent = 'Zapisywanie...';

            const res = await fetch('/api/servers/batch-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serials: Array.from(checkedSerials),
                    updates
                })
            });

            if (!res.ok) throw new Error('Failed to batch update metadata');

            await loadServers();
            if (currentSelectedSerial && checkedSerials.has(currentSelectedSerial) && currentSelectedRun) {
                await loadServerData(currentSelectedSerial, currentSelectedRun);
            }

            closeBatchEditModal();
        } catch (e) {
            console.error(e);
            alert('Błąd podczas zapisu grupowego Metadata.');
        } finally {
            saveBatchMetadataBtn.disabled = false;
            saveBatchMetadataBtn.textContent = 'Zapisz dla zaznaczonych';
        }
    });

    // --- Link IPMI MAC Modal Logic ---
    const linkIpmiModal = document.getElementById('linkIpmiModal');
    const closeLinkIpmiModalBtn = document.getElementById('closeLinkIpmiModalBtn');
    const cancelLinkIpmiModalBtn = document.getElementById('cancelLinkIpmiModalBtn');
    const linkModalSerial = document.getElementById('linkModalSerial');
    const linkModalCurrentMac = document.getElementById('linkModalCurrentMac');
    const unlinkIpmiBtn = document.getElementById('unlinkIpmiBtn');
    const refreshModalDhcpBtn = document.getElementById('refreshModalDhcpBtn');
    const linkModalDhcpBody = document.getElementById('linkModalDhcpBody');
    const linkModalMacSearch = document.getElementById('linkModalMacSearch');
    const clearLinkMacSearchBtn = document.getElementById('clearLinkMacSearchBtn');

    function normalizeMacString(str) {
        return (str || '').replace(/[:\-\s]/g, '').toLowerCase();
    }

    function updateClearLinkMacButton() {
        if (linkModalMacSearch.value.length > 0) {
            clearLinkMacSearchBtn.classList.remove('hidden');
        } else {
            clearLinkMacSearchBtn.classList.add('hidden');
        }
    }

    linkModalMacSearch.addEventListener('input', () => {
        updateClearLinkMacButton();
        renderLinkModalContent();
    });

    clearLinkMacSearchBtn.addEventListener('click', () => {
        linkModalMacSearch.value = '';
        updateClearLinkMacButton();
        renderLinkModalContent();
        linkModalMacSearch.focus();
    });

    function renderLinkModalContent() {
        if (!currentSelectedSerial) return;
        const srv = allServers.find(s => s.serial === currentSelectedSerial);
        const currentMac = srv ? (srv.linked_mac || '') : '';

        linkModalSerial.textContent = currentSelectedSerial;
        linkModalCurrentMac.textContent = currentMac || 'Brak powiązania';
        if (currentMac) {
            unlinkIpmiBtn.classList.remove('hidden');
        } else {
            unlinkIpmiBtn.classList.add('hidden');
        }

        const normQuery = normalizeMacString(linkModalMacSearch.value);
        const filteredLeases = currentDhcpLeases.filter(lease => {
            if (!normQuery) return true;
            return normalizeMacString(lease.mac).includes(normQuery);
        });

        linkModalDhcpBody.innerHTML = '';
        if (filteredLeases.length === 0) {
            linkModalDhcpBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: #86868b; padding: 20px;">
                        ${currentDhcpLeases.length === 0
                            ? 'Brak aktywnych dzierżaw w zakładce Adresy IP DHCP.'
                            : 'Brak adresów MAC pasujących do wyszukiwania.'}
                    </td>
                </tr>
            `;
            return;
        }

        filteredLeases.forEach(lease => {
            const isLinkedToCurrent = currentMac && lease.mac.toLowerCase() === currentMac.toLowerCase();
            const linkedServerObj = allServers.find(s => (s.linked_mac || '').toLowerCase() === lease.mac.toLowerCase());
            const linkedSerialStr = linkedServerObj ? linkedServerObj.serial : (lease.linked_serial || '');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family: monospace; font-weight: 600;">${escapeHtml(lease.mac)}</td>
                <td>${escapeHtml(lease.ip)}</td>
                <td>${escapeHtml(lease.hostname)}</td>
                <td>${escapeHtml(lease.manufacturer)}</td>
                <td>${linkedSerialStr ? `<span class="serial-chip">${escapeHtml(linkedSerialStr)}</span>` : '<span style="color:#86868b;">-</span>'}</td>
                <td style="text-align: right;">
                    ${isLinkedToCurrent
                        ? `<button class="btn btn-secondary btn-sm" disabled>Połączony</button>`
                        : `<button class="btn btn-sm select-mac-btn" data-mac="${escapeHtml(lease.mac)}">Połącz</button>`
                    }
                </td>
            `;
            const selectBtn = tr.querySelector('.select-mac-btn');
            if (selectBtn) {
                selectBtn.addEventListener('click', () => {
                    saveServerIpmiLink(currentSelectedSerial, lease.mac);
                });
            }
            linkModalDhcpBody.appendChild(tr);
        });
    }

    async function saveServerIpmiLink(serial, mac) {
        try {
            const res = await fetch('/api/ipmi-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serial, mac })
            });
            if (!res.ok) throw new Error('Failed to save IPMI link');

            await loadDhcpLeases();
            await loadServers();
            if (currentSelectedSerial && currentSelectedRun) {
                await loadServerData(currentSelectedSerial, currentSelectedRun);
            }
            renderLinkModalContent();
        } catch (e) {
            console.error('Failed to link MAC', e);
            alert('Nie udało się zapisać powiązania MAC.');
        }
    }

    async function openLinkIpmiModal() {
        if (!currentSelectedSerial) return;
        linkModalMacSearch.value = '';
        updateClearLinkMacButton();
        await loadDhcpLeases();
        renderLinkModalContent();
        linkIpmiModal.classList.remove('hidden');
    }

    function closeLinkIpmiModal() {
        linkIpmiModal.classList.add('hidden');
    }

    linkIpmiBtn.addEventListener('click', openLinkIpmiModal);
    closeLinkIpmiModalBtn.addEventListener('click', closeLinkIpmiModal);
    cancelLinkIpmiModalBtn.addEventListener('click', closeLinkIpmiModal);
    linkIpmiModal.addEventListener('click', (e) => {
        if (e.target === linkIpmiModal) closeLinkIpmiModal();
    });

    unlinkIpmiBtn.addEventListener('click', () => {
        if (currentSelectedSerial) {
            saveServerIpmiLink(currentSelectedSerial, '');
        }
    });

    refreshModalDhcpBtn.addEventListener('click', async () => {
        await loadDhcpLeases();
        renderLinkModalContent();
    });

    // --- DHCP Leases & Password Sync Logic ---
    const dhcpTableBody = document.getElementById('dhcpTableBody');

    async function savePassword(mac, password) {
        try {
            await fetch('/api/passwords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac, password })
            });
            const lease = currentDhcpLeases.find(l => l.mac.toLowerCase() === mac.toLowerCase());
            if (lease) lease.password = password;
            updateServerIpmiCard();
        } catch (e) {
            console.error('Failed to save password', e);
        }
    }

    serverIpmiPassword.addEventListener('change', (e) => {
        const mac = e.target.getAttribute('data-mac');
        if (mac) {
            savePassword(mac, e.target.value);
            loadDhcpLeases();
        }
    });

    async function loadDhcpLeases() {
        try {
            const res = await fetch('/api/dhcp');
            const data = await res.json();
            currentDhcpLeases = data.leases || [];

            updateServerIpmiCard();
            renderServerTree();

            if (document.activeElement && document.activeElement.classList.contains('dhcp-table-password-input')) {
                return;
            }

            dhcpTableBody.innerHTML = '';
            currentDhcpLeases.forEach(lease => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-family: monospace;">${escapeHtml(lease.mac)}</td>
                    <td>${escapeHtml(lease.ip)}</td>
                    <td>${escapeHtml(lease.hostname)}</td>
                    <td>${escapeHtml(lease.manufacturer)}</td>
                    <td>${formatIpmiLink(lease.ip)}</td>
                    <td>
                        <input type="text" class="styled-input password-input dhcp-table-password-input" data-mac="${escapeHtml(lease.mac)}" value="${escapeHtml(lease.password || '')}" placeholder="Zapisz hasło...">
                    </td>
                `;
                dhcpTableBody.appendChild(tr);
            });

            document.querySelectorAll('.dhcp-table-password-input').forEach(input => {
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
    (async () => {
        updateCopyPasteState();
        await loadDhcpLeases();
        await loadServers();
    })();

    // Auto refresh DHCP leases every 5s
    setInterval(loadDhcpLeases, 5000);
});
