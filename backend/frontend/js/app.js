/* ═══ ServerSphere - Application Logic ═══ */

// ─── State ──────────────────────────────────────────────────
let currentVPSId = null;
let vpsList = [];
let allVPSList = [];       // unfiltered full list
let terminal = null;
let terminalWs = null;
let refreshInterval = null;

// ─── Multi-Session Terminal State ──────────────────────────
let terminalSessions = {};       // { vpsId: { ws, terminal, active, containerEl } }
let activeTerminalSession = null;
let terminalFullscreen = false;
let currentUser = null;    // { id, username, role, display_name, vps_access }

// ─── Role helpers ───────────────────────────────────────────
function isAdmin()    { return currentUser && currentUser.role === 'admin'; }
function isOperator() { return currentUser && (currentUser.role === 'operator' || currentUser.role === 'admin'); }
function isViewer()   { return currentUser && currentUser.role === 'viewer'; }

/** Filter VPS list based on current user's vps_access */
function filterVPSByAccess(list) {
    if (!currentUser) return list;
    if (isAdmin()) return list;  // admin sees everything
    if (currentUser.vps_access && currentUser.vps_access.length > 0) {
        const allowed = new Set(currentUser.vps_access);
        return list.filter(v => allowed.has(v.id));
    }
    return []; // empty vps_access = no access
}

// ─── API Helper ─────────────────────────────────────────────
async function api(method, path, body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`/api${path}`, opts);
    if (res.status === 401) {
        showLogin();
        throw new Error('Not authenticated');
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Request failed');
    }
    const ct = res.headers.get('content-type');
    if (ct && ct.includes('text/plain')) return res.text();
    return res.json();
}

// ─── Auth ───────────────────────────────────────────────────
async function fetchCurrentUser() {
    try {
        const r = await api('GET', '/auth/me');
        currentUser = {
            id: r.id,
            username: r.username,
            role: r.role,
            display_name: r.display_name,
            vps_access: r.vps_access || [],
            direct_vps_access: r.direct_vps_access || [],
            group_access: r.group_access || [],
            group_names: r.group_names || [],
        };
    } catch {
        currentUser = null;
    }
}

async function checkAuth() {
    try {
        const r = await api('GET', '/auth/check');
        if (r.authenticated) {
            // New format: { authenticated, user: { id, username, role, display_name } }
            const u = r.user || {};
            currentUser = {
                id: u.id,
                username: u.username || (typeof r.user === 'string' ? r.user : ''),
                role: u.role || 'viewer',
                display_name: u.display_name || u.username || '',
                vps_access: u.vps_access || [],
                direct_vps_access: u.direct_vps_access || [],
                group_access: u.group_access || [],
                group_names: u.group_names || [],
            };
            const displayName = currentUser.display_name || currentUser.username;
            document.getElementById('userDisplay').textContent = displayName;
            // Set avatar initials
            const initials = displayName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || 'U';
            const avatarEl = document.getElementById('userAvatarInitials');
            if (avatarEl) avatarEl.textContent = initials;
            await fetchCurrentUser();  // get full info including vps_access
            applyPermissions();
            showApp();
            return;
        }
    } catch {}
    // Don't show login error here — called on page load too
    showLogin();
}

function applyPermissions() {
    if (!currentUser) return;

    // Add VPS button (sidebar)
    const addVpsNav = document.getElementById('navAddVPS');
    if (addVpsNav) addVpsNav.style.display = isAdmin() ? '' : 'none';

    // Add VPS button on VPS list page header
    const addVpsBtn = document.getElementById('addVPSBtn');
    if (addVpsBtn) addVpsBtn.style.display = isAdmin() ? '' : 'none';

    // User Management nav
    const usersNav = document.getElementById('navUsers');
    if (usersNav) usersNav.style.display = isAdmin() ? '' : 'none';

    // Audit Logs nav
    const auditNav = document.getElementById('navAudit');
    if (auditNav) auditNav.style.display = isAdmin() ? '' : 'none';

    // Permissions nav (admin only)
    const permNav = document.getElementById('navPermissions');
    if (permNav) permNav.style.display = isAdmin() ? '' : 'none';

    // SSH Keys nav (admin only)
    const sshKeysNav = document.getElementById('navSSHKeys');
    if (sshKeysNav) sshKeysNav.style.display = isAdmin() ? '' : 'none';

    // Groups nav (admin only)
    const groupsNav = document.getElementById('navGroups');
    if (groupsNav) groupsNav.style.display = isAdmin() ? '' : 'none';

    // GitHub Actions nav (admin only)
    const githubNav = document.getElementById('navGitHub');
    if (githubNav) githubNav.style.display = isAdmin() ? '' : 'none';

    // Terminal tab
    const terminalTab = document.getElementById('tabBtnTerminal');
    if (terminalTab) terminalTab.style.display = isOperator() ? '' : 'none';

    // Quick Command tab
    const quickcmdTab = document.getElementById('tabBtnQuickCmd');
    if (quickcmdTab) quickcmdTab.style.display = isOperator() ? '' : 'none';

    // Terminal button in VPS detail header
    const termBtn = document.getElementById('openTerminalBtn');
    if (termBtn) termBtn.style.display = isOperator() ? '' : 'none';
}

function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    currentUser = null;
}

function showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    showPage('dashboard');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('loginUser').value;
    const pass = document.getElementById('loginPass').value;
    try {
        const r = await api('POST', '/auth/login', { username: user, password: pass });
        // New format: { success, user: { id, username, role, display_name } }
        document.getElementById('loginError').classList.add('hidden');
        await checkAuth();
    } catch (err) {
        const el = document.getElementById('loginError');
        el.textContent = err.message;
        el.classList.remove('hidden');
    }
});

async function logout() {
    try { await api('POST', '/auth/logout'); } catch {}
    currentUser = null;
    showLogin();
}

// ─── Navigation ─────────────────────────────────────────────
function showPage(page) {
    // Restrict users page to admin
    if (page === 'users' && !isAdmin()) page = 'dashboard';
    // Restrict audit page to admin
    if (page === 'audit' && !isAdmin()) page = 'dashboard';
    // Restrict permissions page to admin
    if (page === 'permissions' && !isAdmin()) page = 'dashboard';
    // Restrict SSH keys page to admin
    if (page === 'ssh-keys' && !isAdmin()) page = 'dashboard';
    // Restrict groups page to admin
    if (page === 'groups' && !isAdmin()) page = 'dashboard';
    // Restrict github page to admin
    if (page === 'github' && !isAdmin()) page = 'dashboard';

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelectorAll('.nav-item[data-page]').forEach(n => {
        n.classList.toggle('active', n.dataset.page === page);
    });

    // Update topbar title & search placeholder
    const pageTitles = {
        'dashboard': 'Overview',
        'vps-list': 'Instances',
        'vps-detail': 'VPS Detail',
        'users': 'User Management',
        'audit': 'Audit Logs',
        'permissions': 'Role Permissions',
        'ssh-keys': 'SSH Keys',
        'groups': 'Groups',
        'github': 'GitHub Actions',
    };
    const pageTitleEl = document.getElementById('pageTitle');
    if (pageTitleEl && pageTitles[page]) {
        pageTitleEl.textContent = pageTitles[page];
    }
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
        if (page === 'users') {
            searchInput.placeholder = 'Search users...';
        } else if (page === 'audit') {
            searchInput.placeholder = 'Search audit logs...';
        } else {
            searchInput.placeholder = 'Search instances...';
        }
    }
    if (page === 'dashboard') refreshDashboard();
    if (page === 'vps-list') loadVPSList();
    if (page === 'users') loadUsersList();
    if (page === 'audit') loadAuditLogs();
    if (page === 'ssh-keys') loadSSHKeys();
    if (page === 'groups') loadGroups();
    if (page === 'github') loadGitHubActions();
}

// ─── Dashboard ──────────────────────────────────────────────
async function refreshDashboard() {
    try {
        const list = await api('GET', '/vps');
        allVPSList = list;
        vpsList = filterVPSByAccess(list);

        // Fetch online status in background (non-blocking)
        const vpsIds = vpsList.map(v => v.id);
        let statusMap = {};
        if (vpsIds.length > 0) {
            try {
                statusMap = await api('POST', '/vps/status', { ids: vpsIds });
            } catch {}
        }
        // Apply status
        for (const v of vpsList) {
            v.online = statusMap[v.id] === true;
        }

        const online = vpsList.filter(v => v.online).length;
        const offline = vpsList.length - online;

        document.getElementById('totalVPS').textContent = vpsList.length;
        document.getElementById('onlineVPS').textContent = online;
        document.getElementById('offlineVPS').textContent = offline;

        // Fetch container counts for online VPS (in background)
        let totalContainers = 0;
        const containerPromises = vpsList.filter(v => v.online).map(async v => {
            try {
                const containers = await api('GET', `/vps/${v.id}/containers`);
                if (Array.isArray(containers)) totalContainers += containers.length;
            } catch {}
        });
        document.getElementById('totalContainers').textContent = '...';
        Promise.all(containerPromises).then(() => {
            document.getElementById('totalContainers').textContent = totalContainers;
        });

        // Render cards
        const grid = document.getElementById('dashboardGrid');
        if (vpsList.length === 0) {
            if (isAdmin()) {
                grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🖥️</div>
                    <p>No VPS added yet. <a href="#" onclick="showAddVPSModal()">Add your first VPS</a></p></div>`;
            } else {
                grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🖥️</div>
                    <p>No VPS available.</p></div>`;
            }
            return;
        }

        let html = '';
        for (const v of vpsList) {
            html += `<div class="vps-card" onclick="showVPSDetail('${v.id}')">
                <div class="vps-card-header">
                    <div class="vps-card-name">
                        <span class="status-dot ${v.online ? 'online' : 'offline'}"></span>
                        ${esc(v.name)}
                    </div>
                    <span style="font-size:12px;color:var(--text-muted)">${esc(v.group)}</span>
                </div>
                <div class="vps-card-host">${esc(v.host)}:${v.port} · ${esc(v.username)}</div>
                ${v.tags && v.tags.length ? `<div class="vps-card-tags">${v.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
            </div>`;
        }
        grid.innerHTML = html;

        // Load resource previews for online VPS
        for (const v of vpsList.filter(v => v.online)) {
            loadCardResources(v.id);
        }

    } catch (err) {
        console.error('Dashboard error:', err);
    }
}

async function loadCardResources(vpsId) {
    try {
        const r = await api('GET', `/vps/${vpsId}/resources`);
        const card = document.querySelector(`.vps-card[onclick*="${vpsId}"]`);
        if (!card || r.error) return;

        let resHtml = '<div class="vps-card-resources">';
        if (r.cpu_percent !== undefined) {
            const color = r.cpu_percent > 80 ? 'var(--danger)' : r.cpu_percent > 60 ? 'var(--warning)' : 'var(--success)';
            resHtml += `<div class="resource-item">CPU: <span>${r.cpu_percent}%</span>
                <div class="resource-bar"><div class="resource-bar-fill" style="width:${r.cpu_percent}%;background:${color}"></div></div></div>`;
        }
        if (r.memory && r.memory.percent) {
            const color = r.memory.percent > 80 ? 'var(--danger)' : r.memory.percent > 60 ? 'var(--warning)' : 'var(--success)';
            resHtml += `<div class="resource-item">RAM: <span>${r.memory.percent}%</span>
                <div class="resource-bar"><div class="resource-bar-fill" style="width:${r.memory.percent}%;background:${color}"></div></div></div>`;
        }
        if (r.disk && r.disk.percent) {
            const pct = parseInt(r.disk.percent);
            const color = pct > 80 ? 'var(--danger)' : pct > 60 ? 'var(--warning)' : 'var(--success)';
            resHtml += `<div class="resource-item">Disk: <span>${r.disk.percent}%</span>
                <div class="resource-bar"><div class="resource-bar-fill" style="width:${r.disk.percent}%;background:${color}"></div></div></div>`;
        }
        resHtml += '</div>';
        const tagsEl = card.querySelector('.vps-card-tags');
        if (tagsEl) {
            tagsEl.insertAdjacentHTML('beforebegin', resHtml);
        } else {
            card.insertAdjacentHTML('beforeend', resHtml);
        }
    } catch {}
}

// ─── VPS List ───────────────────────────────────────────────
async function loadVPSList() {
    try {
        const list = await api('GET', '/vps');
        allVPSList = list;
        vpsList = filterVPSByAccess(list);

        // Fetch online status
        const vpsIds = vpsList.map(v => v.id);
        let statusMap = {};
        if (vpsIds.length > 0) {
            try {
                statusMap = await api('POST', '/vps/status', { ids: vpsIds });
            } catch {}
        }
        for (const v of vpsList) {
            v.online = statusMap[v.id] === true;
        }

        const tbody = document.getElementById('vpsTableBody');
        if (vpsList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No VPS available.</td></tr>';
            return;
        }
        tbody.innerHTML = vpsList.map(v => `<tr>
            <td><span class="status-dot ${v.online ? 'online' : 'offline'}"></span></td>
            <td><strong>${esc(v.name)}</strong></td>
            <td><code>${esc(v.host)}:${v.port}</code></td>
            <td>${esc(v.username)}</td>
            <td><span class="tag">${esc(v.group)}</span></td>
            <td>${v.tags && v.tags.length ? v.tags.map(t => `<span class="tag">${esc(t)}</span>`).join(' ') : '-'}</td>
            <td class="action-btns">
                <button class="btn btn-xs btn-primary" onclick="showVPSDetail('${v.id}')">Open</button>
                ${isAdmin() ? `<button class="btn btn-xs" onclick="editVPS('${v.id}')">Edit</button>
                <button class="btn btn-xs btn-danger" onclick="deleteVPS('${v.id}','${esc(v.name)}')">Delete</button>` : ''}
            </td>
        </tr>`).join('');
    } catch (err) {
        console.error('VPS list error:', err);
    }
}

// ─── VPS Modal (Multi-Step Wizard) ───────────────────────
let addVPSStep = 1;
let addVPSData = {};
let wizardAuthMethod = 'password'; // 'password' or 'key'
let connectionTestPassed = false;

function setAuthMethod(method) {
    wizardAuthMethod = method;
    const passBtn = document.getElementById('authMethodPassword');
    const keyBtn = document.getElementById('authMethodKey');
    const passField = document.getElementById('authPasswordField');
    const keyField = document.getElementById('authKeyField');
    if (method === 'password') {
        passBtn.classList.add('btn-primary');
        keyBtn.classList.remove('btn-primary');
        passField.classList.remove('hidden');
        keyField.classList.add('hidden');
    } else {
        keyBtn.classList.add('btn-primary');
        passBtn.classList.remove('btn-primary');
        keyField.classList.remove('hidden');
        passField.classList.add('hidden');
    }
}

function updateWizardUI() {
    // Show/hide pages
    for (let i = 1; i <= 4; i++) {
        const page = document.getElementById(`wizardPage${i}`);
        if (page) page.classList.toggle('hidden', i !== addVPSStep);
    }
    // Update step indicators
    for (let i = 1; i <= 4; i++) {
        const step = document.getElementById(`wizardStep${i}`);
        if (step) {
            step.classList.toggle('active', i === addVPSStep);
            step.classList.toggle('completed', i < addVPSStep);
        }
    }
    // Update step lines
    for (let i = 1; i <= 3; i++) {
        const line = document.getElementById(`wizardLine${i}`);
        if (line) line.classList.toggle('completed', i < addVPSStep);
    }
    // Show/hide nav buttons
    const prevBtn = document.getElementById('wizardPrevBtn');
    const nextBtn = document.getElementById('wizardNextBtn');
    const saveBtn = document.getElementById('wizardSaveBtn');
    const cancelBtn = document.getElementById('wizardCancelBtn');

    prevBtn.style.display = addVPSStep > 1 ? '' : 'none';
    cancelBtn.style.display = '';

    if (addVPSStep === 4) {
        nextBtn.classList.add('hidden');
        saveBtn.classList.remove('hidden');
    } else {
        nextBtn.classList.remove('hidden');
        saveBtn.classList.add('hidden');
    }

    // If step 4, build summary
    if (addVPSStep === 4) buildWizardSummary();
}

function nextAddStep() {
    // Validate current step
    if (addVPSStep === 1) {
        const host = document.getElementById('vpsHost').value.trim();
        if (!host) { showToast('Host / IP is required', 'warning'); return; }
        collectWizardData();
    }
    if (addVPSStep === 2) {
        // Connection test step - allow proceeding even without testing
    }
    if (addVPSStep === 3) {
        const name = document.getElementById('vpsName').value.trim();
        if (!name) { showToast('Name is required', 'warning'); return; }
        collectWizardData();
    }
    if (addVPSStep < 4) {
        addVPSStep++;
        updateWizardUI();
    }
}

function prevAddStep() {
    if (addVPSStep > 1) {
        addVPSStep--;
        updateWizardUI();
    }
}

function goToWizardStep(step) {
    // Only allow going to completed or current steps
    if (step <= addVPSStep) {
        addVPSStep = step;
        updateWizardUI();
    }
}

function collectWizardData() {
    addVPSData.host = document.getElementById('vpsHost').value.trim();
    addVPSData.port = parseInt(document.getElementById('vpsPort').value) || 22;
    addVPSData.username = document.getElementById('vpsUsername').value || 'root';
    addVPSData.password = wizardAuthMethod === 'password' ? (document.getElementById('vpsPassword').value || null) : null;
    addVPSData.key_file = wizardAuthMethod === 'key' ? (document.getElementById('vpsKeyFile').value || null) : null;
    addVPSData.name = document.getElementById('vpsName')?.value?.trim() || '';
    addVPSData.group = document.getElementById('vpsGroup')?.value || 'default';
    addVPSData.tags = (document.getElementById('vpsTags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
}

function buildWizardSummary() {
    collectWizardData();
    const authLabel = wizardAuthMethod === 'password'
        ? (addVPSData.password ? '••••••••' : '(none)')
        : (addVPSData.key_file || '(none)');
    const tagsStr = addVPSData.tags.length ? addVPSData.tags.map(t => `<span class="tag">${esc(t)}</span>`).join(' ') : '<span style="color:var(--text-muted)">none</span>';

    document.getElementById('wizardConfirmSummary').innerHTML = `
        <div style="display:grid;grid-template-columns:140px 1fr;gap:8px 16px;">
            <div style="color:var(--text-muted);font-weight:500;">Host</div>
            <div><code>${esc(addVPSData.host)}</code></div>
            <div style="color:var(--text-muted);font-weight:500;">Port</div>
            <div>${addVPSData.port}</div>
            <div style="color:var(--text-muted);font-weight:500;">Username</div>
            <div>${esc(addVPSData.username)}</div>
            <div style="color:var(--text-muted);font-weight:500;">Auth</div>
            <div>${wizardAuthMethod === 'password' ? 'Password' : 'SSH Key'}: ${esc(authLabel)}</div>
            <div style="color:var(--text-muted);font-weight:500;">Name</div>
            <div><strong>${esc(addVPSData.name)}</strong></div>
            <div style="color:var(--text-muted);font-weight:500;">Group</div>
            <div>${esc(addVPSData.group)}</div>
            <div style="color:var(--text-muted);font-weight:500;">Tags</div>
            <div>${tagsStr}</div>
        </div>
    `;
}

function showAddVPSModal() {
    if (!isAdmin()) return;
    document.getElementById('vpsModalTitle').textContent = 'Add VPS';
    document.getElementById('vpsEditId').value = '';
    addVPSStep = 1;
    addVPSData = {};
    connectionTestPassed = false;
    wizardAuthMethod = 'password';

    // Reset form fields
    document.getElementById('vpsHost').value = '';
    document.getElementById('vpsPort').value = 22;
    document.getElementById('vpsUsername').value = 'root';
    document.getElementById('vpsPassword').value = '';
    document.getElementById('vpsKeyFile').value = '';
    document.getElementById('vpsName').value = '';
    document.getElementById('vpsGroup').value = 'default';
    document.getElementById('vpsTags').value = '';

    setAuthMethod('password');
    loadSavedSSHKeys();
    loadGroupDropdown();

    // Reset test connection status
    document.getElementById('testConnectionStatus').innerHTML = `
        <span class="material-icons" style="font-size:48px;color:var(--neutral)">lan</span>
        <p style="margin-top:12px;color:var(--text-muted);">Click the button below to test your SSH connection.</p>
    `;
    document.getElementById('testConnectionBtn').disabled = false;
    document.getElementById('testConnectionBtn').innerHTML = '<span class="material-icons" style="font-size:16px">play_arrow</span> Test Connection';

    // Show wizard steps, hide for edit mode
    document.getElementById('wizardSteps').style.display = 'flex';

    updateWizardUI();
    document.getElementById('vpsModal').classList.remove('hidden');
}

function closeVPSModal() {
    document.getElementById('vpsModal').classList.add('hidden');
}

async function testVPSConnection() {
    const host = document.getElementById('vpsHost').value.trim();
    if (!host) { showToast('Please enter a host first', 'warning'); return; }

    const btn = document.getElementById('testConnectionBtn');
    const statusEl = document.getElementById('testConnectionStatus');

    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons" style="font-size:16px;animation:spin 1s linear infinite">sync</span> Testing...';
    statusEl.innerHTML = `
        <span class="material-icons" style="font-size:48px;color:var(--warning);animation:spin 1s linear infinite">sync</span>
        <p style="margin-top:12px;color:var(--warning);">Testing connection to ${esc(host)}...</p>
    `;

    try {
        const data = {
            host: host,
            port: parseInt(document.getElementById('vpsPort').value) || 22,
            username: document.getElementById('vpsUsername').value || 'root',
        };
        if (wizardAuthMethod === 'password') {
            data.password = document.getElementById('vpsPassword').value || null;
        } else {
            data.key_file = document.getElementById('vpsKeyFile').value || null;
        }

        const result = await api('POST', '/vps/test-connection', data);

        if (result.connected) {
            connectionTestPassed = true;
            statusEl.innerHTML = `
                <span class="material-icons" style="font-size:48px;color:var(--success)">check_circle</span>
                <p style="margin-top:12px;color:var(--success);font-weight:500;">Connection Successful!</p>
                <p style="color:var(--text-muted);font-size:12px;">${esc(result.message || 'SSH connection established.')}</p>
            `;
            btn.innerHTML = '<span class="material-icons" style="font-size:16px;color:var(--success)">check_circle</span> Connected';
        } else {
            connectionTestPassed = false;
            statusEl.innerHTML = `
                <span class="material-icons" style="font-size:48px;color:var(--danger)">error</span>
                <p style="margin-top:12px;color:var(--danger);font-weight:500;">Connection Failed</p>
                <p style="color:var(--text-muted);font-size:12px;">${esc(result.message || 'Could not connect.')}</p>
            `;
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons" style="font-size:16px">refresh</span> Retry';
        }
    } catch (err) {
        connectionTestPassed = false;
        statusEl.innerHTML = `
            <span class="material-icons" style="font-size:48px;color:var(--danger)">error</span>
            <p style="margin-top:12px;color:var(--danger);font-weight:500;">Connection Failed</p>
            <p style="color:var(--text-muted);font-size:12px;">${esc(err.message)}</p>
        `;
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons" style="font-size:16px">refresh</span> Retry';
    }
}

async function editVPS(vpsId) {
    if (!isAdmin()) return;
    const vps = vpsList.find(v => v.id === vpsId);
    if (!vps) return;

    document.getElementById('vpsModalTitle').textContent = 'Edit VPS';
    document.getElementById('vpsEditId').value = vps.id;
    document.getElementById('vpsHost').value = vps.host;
    document.getElementById('vpsPort').value = vps.port;
    document.getElementById('vpsUsername').value = vps.username;
    document.getElementById('vpsPassword').value = '';
    document.getElementById('vpsKeyFile').value = '';
    document.getElementById('vpsName').value = vps.name;
    document.getElementById('vpsTags').value = (vps.tags || []).join(', ');

    // Load groups first, then set the value
    await loadGroupDropdown();
    document.getElementById('vpsGroup').value = vps.group;

    // For edit, jump to step 3 (details) and simplify the wizard
    addVPSStep = 3;
    wizardAuthMethod = vps.has_key ? 'key' : 'password';
    setAuthMethod(wizardAuthMethod);

    // Show wizard steps indicator
    document.getElementById('wizardSteps').style.display = 'flex';

    updateWizardUI();
    document.getElementById('vpsModal').classList.remove('hidden');
}

async function saveVPSFromWizard() {
    const editId = document.getElementById('vpsEditId').value;
    collectWizardData();
    const data = {
        name: addVPSData.name,
        host: addVPSData.host,
        port: addVPSData.port,
        username: addVPSData.username,
        password: addVPSData.password,
        key_file: addVPSData.key_file,
        tags: addVPSData.tags,
        group: addVPSData.group,
    };
    try {
        if (editId) {
            await api('PUT', `/vps/${editId}`, data);
        } else {
            await api('POST', '/vps', data);
        }
        closeVPSModal();
        loadVPSList();
        refreshDashboard();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function deleteVPS(vpsId, name) {
    if (!isAdmin()) return;
    showConfirm(`Delete VPS "${name}"? This cannot be undone.`, async () => {
        try {
            await api('DELETE', `/vps/${vpsId}`);
            loadVPSList();
            refreshDashboard();
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });
}

// ─── VPS Detail ─────────────────────────────────────────────
async function showVPSDetail(vpsId) {
    currentVPSId = vpsId;
    showPage('vps-detail');

    // Hide page nav active
    document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.remove('active'));

    const vps = vpsList.find(v => v.id === vpsId);
    document.getElementById('detailVPSName').textContent = vps ? vps.name : 'VPS';

    // Re-apply permissions for tabs (in case they were reset)
    applyPermissions();

    // Load in parallel
    loadVPSInfo(vpsId);
    loadVPSResources(vpsId);
    loadContainers(vpsId);
}

async function refreshVPSDetail() {
    if (!currentVPSId) return;
    loadVPSInfo(currentVPSId);
    loadVPSResources(currentVPSId);
    loadContainers(currentVPSId);
}

async function loadVPSInfo(vpsId) {
    try {
        const info = await api('GET', `/vps/${vpsId}/info`);
        document.getElementById('vpsInfoBody').innerHTML = `<div class="info-grid">
            <div class="info-item"><div class="info-label">Hostname</div><div class="info-value">${esc(info.hostname)}</div></div>
            <div class="info-item"><div class="info-label">Kernel</div><div class="info-value">${esc(info.kernel)}</div></div>
            <div class="info-item"><div class="info-label">OS</div><div class="info-value" style="font-size:12px">${esc(info.os)}</div></div>
            <div class="info-item"><div class="info-label">Uptime</div><div class="info-value">${esc(info.uptime)}</div></div>
            <div class="info-item"><div class="info-label">CPU</div><div class="info-value">${esc(info.cpu_model)}</div></div>
            <div class="info-item"><div class="info-label">CPU Cores</div><div class="info-value">${esc(info.cpu_cores)}</div></div>
        </div>`;
    } catch (err) {
        document.getElementById('vpsInfoBody').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
}

async function loadVPSResources(vpsId) {
    try {
        const r = await api('GET', `/vps/${vpsId}/resources`);
        if (r.error) throw new Error(r.error);

        let html = '<div class="resource-grid">';

        // CPU
        const cpuPct = r.cpu_percent || 0;
        const cpuColor = cpuPct > 80 ? 'var(--danger)' : cpuPct > 60 ? 'var(--warning)' : 'var(--success)';
        html += `<div class="resource-row">
            <div class="resource-icon">🧠</div>
            <div class="resource-info">
                <div class="resource-title">CPU Usage</div>
                <div class="resource-value">${cpuPct}%</div>
                <div class="resource-bar-lg"><div class="resource-bar-lg-fill" style="width:${cpuPct}%;background:${cpuColor}"></div></div>
            </div>
        </div>`;

        // Memory
        if (r.memory && r.memory.total_mb) {
            const memPct = r.memory.percent || 0;
            const memColor = memPct > 80 ? 'var(--danger)' : memPct > 60 ? 'var(--warning)' : 'var(--success)';
            html += `<div class="resource-row">
                <div class="resource-icon">💾</div>
                <div class="resource-info">
                    <div class="resource-title">Memory</div>
                    <div class="resource-value">${r.memory.used_mb}MB / ${r.memory.total_mb}MB (${memPct}%)</div>
                    <div class="resource-bar-lg"><div class="resource-bar-lg-fill" style="width:${memPct}%;background:${memColor}"></div></div>
                </div>
            </div>`;
        }

        // Disk
        if (r.disk && r.disk.total) {
            const dPct = parseInt(r.disk.percent) || 0;
            const dColor = dPct > 80 ? 'var(--danger)' : dPct > 60 ? 'var(--warning)' : 'var(--success)';
            html += `<div class="resource-row">
                <div class="resource-icon">💿</div>
                <div class="resource-info">
                    <div class="resource-title">Disk</div>
                    <div class="resource-value">${r.disk.used} / ${r.disk.total} (${r.disk.percent}%)</div>
                    <div class="resource-bar-lg"><div class="resource-bar-lg-fill" style="width:${dPct}%;background:${dColor}"></div></div>
                </div>
            </div>`;
        }

        // Load
        if (r.load_avg) {
            html += `<div class="resource-row">
                <div class="resource-icon">⚖️</div>
                <div class="resource-info">
                    <div class="resource-title">Load Average</div>
                    <div class="resource-value">${r.load_avg.join(' · ')}</div>
                </div>
            </div>`;
        }

        html += '</div>';
        document.getElementById('vpsResourceBody').innerHTML = html;

    } catch (err) {
        document.getElementById('vpsResourceBody').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
}

// ─── Containers ─────────────────────────────────────────────
async function loadContainers(vpsId) {
    try {
        const containers = await api('GET', `/vps/${vpsId}/containers`);
        const el = document.getElementById('containerList');
        const canAct = isOperator(); // container actions for operator+admin

        if (!Array.isArray(containers) || (containers.length === 1 && containers[0].error)) {
            el.innerHTML = `<div class="empty-state"><div class="empty-icon">🐳</div>
                <p>${containers[0]?.error || 'No containers found'}</p></div>`;
            return;
        }

        if (containers.length === 0) {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">🐳</div><p>No containers running</p></div>';
            return;
        }

        el.innerHTML = '<div class="container-grid">' + containers.map(c => `
            <div class="container-card">
                <div class="container-header">
                    <div class="container-name">
                        <span class="container-state ${c.state}">${c.state}</span>
                        ${esc(c.name)}
                    </div>
                </div>
                <div class="container-meta">
                    <div>Image: ${esc(c.image)}</div>
                    <div>Status: ${esc(c.status)}</div>
                    ${c.ports ? `<div>Ports: ${esc(c.ports)}</div>` : ''}
                </div>
                <div class="container-actions">
                    ${canAct ? (c.state === 'running' ? `
                        <button class="btn btn-xs" onclick="containerAction('${vpsId}','${c.id}','stop')">⏹ Stop</button>
                        <button class="btn btn-xs" onclick="containerAction('${vpsId}','${c.id}','restart')">🔄 Restart</button>
                    ` : `
                        <button class="btn btn-xs btn-primary" onclick="containerAction('${vpsId}','${c.id}','start')">▶ Start</button>
                    `) : ''}
                    <button class="btn btn-xs" onclick="showContainerLogs('${vpsId}','${c.id}','${esc(c.name)}')">📋 Logs</button>
                    <button class="btn btn-xs" onclick="showContainerStats('${vpsId}','${c.id}','${esc(c.name)}')">📊 Stats</button>
                    ${canAct ? `<button class="btn btn-xs btn-danger" onclick="containerAction('${vpsId}','${c.id}','remove')">🗑️</button>` : ''}
                </div>
            </div>
        `).join('') + '</div>';
    } catch (err) {
        document.getElementById('containerList').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
}

async function containerAction(vpsId, containerId, action) {
    if (!isOperator()) { showToast('Permission denied', 'error'); return; }
    try {
        const r = await api('POST', `/vps/${vpsId}/containers/${containerId}/action`, { action });
        if (r.success) {
            loadContainers(vpsId);
        } else {
            showToast('Error: ' + (r.error || 'Action failed'), 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// ─── Container Logs Modal ───────────────────────────────────
async function showContainerLogs(vpsId, containerId, name) {
    document.getElementById('containerLogTitle').textContent = `Logs: ${name}`;
    document.getElementById('containerLogViewer').textContent = 'Loading...';
    document.getElementById('containerLogModal').classList.remove('hidden');
    document.getElementById('containerLogModal').dataset.vpsId = vpsId;
    document.getElementById('containerLogModal').dataset.containerId = containerId;

    try {
        const logs = await api('GET', `/vps/${vpsId}/containers/${containerId}/logs?tail=${document.getElementById('containerLogTail').value}`);
        document.getElementById('containerLogViewer').textContent = logs;
    } catch (err) {
        document.getElementById('containerLogViewer').textContent = 'Error: ' + err.message;
    }
}

async function loadContainerLogsWithTail() {
    const modal = document.getElementById('containerLogModal');
    const vpsId = modal.dataset.vpsId;
    const containerId = modal.dataset.containerId;
    const tail = document.getElementById('containerLogTail').value;
    document.getElementById('containerLogViewer').textContent = 'Loading...';
    try {
        const logs = await api('GET', `/vps/${vpsId}/containers/${containerId}/logs?tail=${tail}`);
        document.getElementById('containerLogViewer').textContent = logs;
    } catch (err) {
        document.getElementById('containerLogViewer').textContent = 'Error: ' + err.message;
    }
}

function closeContainerLogModal() {
    document.getElementById('containerLogModal').classList.add('hidden');
}

// ─── Container Stats Modal ──────────────────────────────────
async function showContainerStats(vpsId, containerId, name) {
    document.getElementById('containerStatsTitle').textContent = `Stats: ${name}`;
    document.getElementById('containerStatsBody').innerHTML = '<div class="loading">Loading...</div>';
    document.getElementById('containerStatsModal').classList.remove('hidden');

    try {
        const s = await api('GET', `/vps/${vpsId}/containers/${containerId}/stats`);
        if (s.error) throw new Error(s.error);
        document.getElementById('containerStatsBody').innerHTML = `<div class="info-grid">
            <div class="info-item"><div class="info-label">CPU</div><div class="info-value">${esc(s.cpu)}</div></div>
            <div class="info-item"><div class="info-label">Memory</div><div class="info-value">${esc(s.mem_usage)} (${esc(s.mem_percent)})</div></div>
            <div class="info-item"><div class="info-label">Network I/O</div><div class="info-value">${esc(s.net_io)}</div></div>
            <div class="info-item"><div class="info-label">Block I/O</div><div class="info-value">${esc(s.block_io)}</div></div>
            <div class="info-item"><div class="info-label">PIDs</div><div class="info-value">${esc(s.pids)}</div></div>
        </div>`;
    } catch (err) {
        document.getElementById('containerStatsBody').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
}

function closeContainerStatsModal() {
    document.getElementById('containerStatsModal').classList.add('hidden');
}

// ─── VPS Logs ───────────────────────────────────────────────
async function loadVPSLogs() {
    if (!currentVPSId) return;
    const type = document.getElementById('logType').value;
    const tail = document.getElementById('logTail').value;
    document.getElementById('logViewer').textContent = 'Loading...';
    try {
        const logs = await api('GET', `/vps/${currentVPSId}/logs?log_type=${type}&tail=${tail}`);
        document.getElementById('logViewer').textContent = logs;
    } catch (err) {
        document.getElementById('logViewer').textContent = 'Error: ' + err.message;
    }
}

// ─── Tabs ───────────────────────────────────────────────────
function switchTab(tabName) {
    // Block restricted tabs
    if ((tabName === 'terminal' || tabName === 'quickcmd') && !isOperator()) {
        return;
    }

    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.toggle('active', tc.id === `tab-${tabName}`));

    if (tabName === 'terminal') {
        // Auto-connect when switching to terminal tab
        if (currentVPSId) {
            const session = terminalSessions[currentVPSId];
            if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
                setTimeout(() => connectTerminal(currentVPSId), 200);
            } else {
                switchTerminalSession(currentVPSId);
            }
        }
        // Refit terminal
        setTimeout(() => { fitActiveTerminal(); }, 100);
    }
}

// ─── Terminal ───────────────────────────────────────────────
function initTerminal(vpsId) {
    // Legacy single-terminal mode uses null vpsId => uses #terminalContainer
    const containerId = vpsId ? `terminalContainer_${vpsId}` : 'terminalContainer';
    const container = document.getElementById(containerId);
    if (!container) return null;

    const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        theme: {
            background: '#0d1117',
            foreground: '#c9d1d9',
            cursor: '#6c5ce7',
            selectionBackground: 'rgba(108, 92, 231, 0.3)',
        },
    });
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon.WebLinksAddon());
    term.open(container);
    term._fitAddon = fitAddon;
    term.writeln('\x1b[1;36mVPS Terminal - Connecting...\x1b[0m');
    term.writeln('');

    // Legacy mode: set global terminal
    if (!vpsId) terminal = term;
    return term;
}

function connectTerminal(targetVpsId) {
    if (!isOperator()) { showToast('Permission denied', 'error'); return; }
    const vpsId = targetVpsId || currentVPSId;
    if (!vpsId) { showToast('No VPS selected', 'warning'); return; }

    // Check if a session already exists and is connected
    const existing = terminalSessions[vpsId];
    if (existing && existing.ws && existing.ws.readyState === WebSocket.OPEN) {
        switchTerminalSession(vpsId);
        return;
    }

    // If we have an existing disconnected session, clean up the old WS
    if (existing && existing.ws) {
        existing.ws.close();
        existing.ws = null;
    }

    // Create new session if needed
    if (!terminalSessions[vpsId]) {
        createTerminalSession(vpsId);
    }

    const session = terminalSessions[vpsId];
    const term = session.terminal;

    // Dispose old listeners
    if (term._inputDisposable) { term._inputDisposable.dispose(); term._inputDisposable = null; }
    if (term._resizeDisposable) { term._resizeDisposable.dispose(); term._resizeDisposable = null; }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws/terminal/${vpsId}`;
    const ws = new WebSocket(wsUrl);
    session.ws = ws;

    // Update status
    updateTerminalStatus('Connecting...', 'var(--warning)');
    switchTerminalSession(vpsId);

    ws.onopen = () => {
        updateTerminalStatus('Connected', 'var(--success)');
        term.clear();
        term.focus();
        if (term._fitAddon) term._fitAddon.fit();

        // Send initial terminal size
        ws.send(JSON.stringify({
            type: 'resize',
            cols: term.cols,
            rows: term.rows
        }));

        // Send input to WebSocket
        term._inputDisposable = term.onData(data => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'input', data }));
            }
        });

        // Handle resize
        term._resizeDisposable = term.onResize(({ cols, rows }) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
        });
    };

    ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
            event.data.text().then(text => term.write(text));
        } else {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'connected') {
                    term.writeln(`\r\n${msg.message}\r\n`);
                } else if (msg.error) {
                    term.writeln(`\r\nError: ${msg.error}\r\n`);
                }
            } catch {
                term.write(event.data);
            }
        }
    };

    ws.onclose = () => {
        if (terminalSessions[vpsId]) {
            terminalSessions[vpsId].ws = null;
        }
        if (activeTerminalSession === vpsId) {
            updateTerminalStatus('Disconnected', 'var(--danger)');
        }
        updateSessionTabStatus(vpsId, false);
    };

    ws.onerror = () => {
        if (activeTerminalSession === vpsId) {
            updateTerminalStatus('Error', 'var(--danger)');
        }
    };
}

function disconnectTerminal() {
    if (!activeTerminalSession) {
        // Legacy fallback
        if (terminal && terminal._inputDisposable) { terminal._inputDisposable.dispose(); terminal._inputDisposable = null; }
        if (terminal && terminal._resizeDisposable) { terminal._resizeDisposable.dispose(); terminal._resizeDisposable = null; }
        if (terminalWs) { terminalWs.close(); terminalWs = null; }
        return;
    }
    const session = terminalSessions[activeTerminalSession];
    if (session) {
        if (session.terminal && session.terminal._inputDisposable) { session.terminal._inputDisposable.dispose(); session.terminal._inputDisposable = null; }
        if (session.terminal && session.terminal._resizeDisposable) { session.terminal._resizeDisposable.dispose(); session.terminal._resizeDisposable = null; }
        if (session.ws) { session.ws.close(); session.ws = null; }
    }
    updateTerminalStatus('Disconnected', 'var(--danger)');
}

function openTerminal(vpsId) {
    if (!isOperator()) return;
    currentVPSId = vpsId;
    showVPSDetail(vpsId);
    // Small delay to let the detail page render, then switch to terminal tab and connect
    setTimeout(() => {
        switchTab('terminal');
    }, 300);
}

// ─── Multi-Session Terminal ────────────────────────────────
function createTerminalSession(vpsId) {
    const sessionsContainer = document.getElementById('terminalSessionsContainer');
    const defaultContainer = document.getElementById('terminalContainer');

    // Create a dedicated container for this session
    const containerEl = document.createElement('div');
    containerEl.id = `terminalContainer_${vpsId}`;
    containerEl.className = 'terminal-container active-session';
    sessionsContainer.appendChild(containerEl);

    // Hide the default container
    defaultContainer.style.display = 'none';
    // Show the sessions container
    sessionsContainer.style.display = 'block';

    // Init xterm in this container
    const term = initTerminal(vpsId);

    const vps = (allVPSList.length ? allVPSList : vpsList).find(v => v.id === vpsId);
    const vpsName = vps ? vps.name : vpsId.substring(0, 8);

    terminalSessions[vpsId] = {
        ws: null,
        terminal: term,
        active: false,
        containerEl: containerEl,
        name: vpsName,
    };

    // Add session tab
    renderSessionTabs();
    switchTerminalSession(vpsId);
}

function switchTerminalSession(vpsId) {
    if (!terminalSessions[vpsId]) return;

    // Deactivate all
    Object.keys(terminalSessions).forEach(id => {
        terminalSessions[id].active = false;
        if (terminalSessions[id].containerEl) {
            terminalSessions[id].containerEl.classList.remove('active-session');
        }
    });

    // Hide default container
    const defaultContainer = document.getElementById('terminalContainer');
    if (defaultContainer) defaultContainer.style.display = 'none';

    // Activate selected
    const session = terminalSessions[vpsId];
    session.active = true;
    activeTerminalSession = vpsId;
    if (session.containerEl) {
        session.containerEl.classList.add('active-session');
    }

    // Update status bar
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        updateTerminalStatus('Connected', 'var(--success)');
    } else {
        updateTerminalStatus('Disconnected', 'var(--danger)');
    }

    // Update tabs UI
    renderSessionTabs();

    // Focus and fit the active terminal
    setTimeout(() => {
        if (session.terminal) {
            if (session.terminal._fitAddon) session.terminal._fitAddon.fit();
            session.terminal.focus();
        }
    }, 100);
}

function closeTerminalSession(vpsId, event) {
    if (event) event.stopPropagation();
    const session = terminalSessions[vpsId];
    if (!session) return;

    // Close WebSocket
    if (session.ws) {
        if (session.terminal && session.terminal._inputDisposable) session.terminal._inputDisposable.dispose();
        if (session.terminal && session.terminal._resizeDisposable) session.terminal._resizeDisposable.dispose();
        session.ws.close();
    }

    // Dispose terminal
    if (session.terminal) {
        session.terminal.dispose();
    }

    // Remove container element
    if (session.containerEl) {
        session.containerEl.remove();
    }

    delete terminalSessions[vpsId];

    // If this was the active session, switch to another or show default
    if (activeTerminalSession === vpsId) {
        const remaining = Object.keys(terminalSessions);
        if (remaining.length > 0) {
            switchTerminalSession(remaining[0]);
        } else {
            activeTerminalSession = null;
            // Show default container again
            const defaultContainer = document.getElementById('terminalContainer');
            if (defaultContainer) defaultContainer.style.display = '';
            const sessionsContainer = document.getElementById('terminalSessionsContainer');
            if (sessionsContainer) sessionsContainer.style.display = 'none';
            updateTerminalStatus('Disconnected', 'var(--danger)');
        }
    }

    renderSessionTabs();
}

function renderSessionTabs() {
    const bar = document.getElementById('terminalSessionBar');
    if (!bar) return;

    const sessionIds = Object.keys(terminalSessions);
    if (sessionIds.length <= 1) {
        bar.classList.remove('has-sessions');
        bar.innerHTML = '';
        // Show single session name if there's one
        if (sessionIds.length === 1) {
            // Optionally show a single tab for clarity
            const s = terminalSessions[sessionIds[0]];
            bar.classList.add('has-sessions');
            bar.innerHTML = renderSessionTabHTML(sessionIds[0], s);
        }
        return;
    }

    bar.classList.add('has-sessions');
    bar.innerHTML = sessionIds.map(id => renderSessionTabHTML(id, terminalSessions[id])).join('');
}

function renderSessionTabHTML(vpsId, session) {
    const isActive = activeTerminalSession === vpsId;
    const isConnected = session.ws && session.ws.readyState === WebSocket.OPEN;
    const statusColor = isConnected ? 'var(--success)' : 'var(--text-muted)';
    return `<div class="terminal-session-tab ${isActive ? 'active' : ''}" onclick="switchTerminalSession('${vpsId}')">
        <span class="status-dot ${isConnected ? 'online' : 'offline'}" style="width:6px;height:6px"></span>
        ${esc(session.name)}
        <span class="close-tab" onclick="closeTerminalSession('${vpsId}', event)">×</span>
    </div>`;
}

function updateSessionTabStatus(vpsId, connected) {
    renderSessionTabs();
}

function updateTerminalStatus(text, color) {
    const el = document.getElementById('terminalStatus');
    if (el) {
        el.textContent = text;
        el.style.color = color;
    }
    // Also update fullscreen status if present
    const fsStatus = document.getElementById('fullscreenTerminalStatus');
    if (fsStatus) {
        fsStatus.textContent = text;
    }
}

// ─── Fullscreen Terminal ───────────────────────────────────
function toggleTerminalFullscreen() {
    const wrapper = document.querySelector('.terminal-wrapper');
    if (!wrapper) return;
    terminalFullscreen = !terminalFullscreen;

    if (terminalFullscreen) {
        // Store original parent
        wrapper._originalParent = wrapper.parentElement;
        wrapper._originalNextSibling = wrapper.nextElementSibling;

        // Create fullscreen overlay
        const overlay = document.createElement('div');
        overlay.id = 'terminalFullscreenOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#0d1117;display:flex;flex-direction:column;';

        // Top bar
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:#0F172A;border-bottom:1px solid #334155;';
        const statusText = document.getElementById('terminalStatus')?.textContent || 'Disconnected';
        bar.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="material-icons" style="color:#3B82F6;font-size:18px">terminal</span>
                <span id="fullscreenTerminalStatus" style="color:#94A3B8;font-size:13px;">${statusText}</span>
                <span style="color:#64748B;font-size:12px">·</span>
                <span style="color:#64748B;font-size:12px">${currentVPSId || ''}</span>
            </div>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-xs btn-primary" onclick="connectTerminal()">Connect</button>
                <button class="btn btn-xs" onclick="disconnectTerminal()">Disconnect</button>
                <button class="btn btn-xs" onclick="toggleTerminalFullscreen()">
                    <span class="material-icons" style="font-size:14px">fullscreen_exit</span>
                </button>
            </div>
        `;

        overlay.appendChild(bar);
        wrapper.style.cssText = 'flex:1;border:none;border-radius:0;';
        const container = wrapper.querySelector('.terminal-container.active-session') || wrapper.querySelector('.terminal-container');
        if (container) container.style.height = 'calc(100vh - 50px)';
        overlay.appendChild(wrapper);
        document.body.appendChild(overlay);

        // Refit terminal
        setTimeout(() => {
            fitActiveTerminal();
        }, 100);

        // ESC to exit fullscreen
        document.addEventListener('keydown', exitFullscreenOnEsc);
    } else {
        exitTerminalFullscreen();
    }
}

function exitFullscreenOnEsc(e) {
    if (e.key === 'Escape' && terminalFullscreen) {
        toggleTerminalFullscreen();
    }
}

function exitTerminalFullscreen() {
    const overlay = document.getElementById('terminalFullscreenOverlay');
    const wrapper = document.querySelector('.terminal-wrapper');
    if (overlay && wrapper && wrapper._originalParent) {
        wrapper.style.cssText = '';
        // Reset all terminal container heights
        wrapper.querySelectorAll('.terminal-container').forEach(c => c.style.height = '');
        wrapper._originalParent.insertBefore(wrapper, wrapper._originalNextSibling);
        overlay.remove();
    }
    terminalFullscreen = false;
    document.removeEventListener('keydown', exitFullscreenOnEsc);
    setTimeout(() => {
        fitActiveTerminal();
    }, 100);
}

function fitActiveTerminal() {
    if (activeTerminalSession && terminalSessions[activeTerminalSession]) {
        const t = terminalSessions[activeTerminalSession].terminal;
        if (t && t._fitAddon) t._fitAddon.fit();
    } else if (terminal && terminal._fitAddon) {
        terminal._fitAddon.fit();
    }
}

// ─── Quick Command ──────────────────────────────────────────
async function runQuickCmd(cmd) {
    if (!isOperator()) { showToast('Permission denied', 'error'); return; }
    if (!currentVPSId) return;
    cmd = cmd || document.getElementById('quickCmdInput').value;
    if (!cmd) return;
    document.getElementById('quickCmdInput').value = cmd;
    document.getElementById('quickCmdOutput').textContent = `$ ${cmd}\nRunning...`;
    try {
        const r = await api('POST', `/vps/${currentVPSId}/exec`, { command: cmd });
        let output = `$ ${cmd}\n`;
        if (r.stdout) output += r.stdout;
        if (r.stderr) output += `\n[STDERR]\n${r.stderr}`;
        if (!r.success && !r.stderr) output += `\nExit code: ${r.exit_code}`;
        document.getElementById('quickCmdOutput').textContent = output;
    } catch (err) {
        document.getElementById('quickCmdOutput').textContent = `Error: ${err.message}`;
    }
}

// ═══════════════════════════════════════════════════════════
// ─── User Management (Admin Only) ─────────────────────────
// ═══════════════════════════════════════════════════════════

let usersList = [];

async function loadUsersList() {
    if (!isAdmin()) return;
    try {
        const users = await api('GET', '/users');
        usersList = users;
        const tbody = document.getElementById('usersTableBody');
        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No users found.</td></tr>';
            return;
        }
        tbody.innerHTML = users.map(u => {
            // Add groups cell
            const groupNames = u.group_names || [];
            const groupBadges = groupNames.length 
                ? groupNames.map(n => `<span style="display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:3px;background:var(--warning);color:#000;font-size:10px;font-weight:600;margin:1px;"><span class="material-icons" style="font-size:10px">folder</span>${escHtml(n)}</span>`).join('')
                : '<span style="color:var(--text-muted);font-size:12px;">—</span>';
            return `<tr>
            <td><strong>${esc(u.username)}</strong></td>
            <td>${esc(u.display_name || '')}</td>
            <td><span class="tag">${esc(u.role)}</span></td>
            <td>${groupBadges}</td>
            <td>${u.role === 'admin'
                ? '<span style="color:var(--primary)">Full Access</span>'
                : (u.vps_access && u.vps_access.length > 0
                    ? u.vps_access.map(id => {
                        const vps = (allVPSList.length ? allVPSList : vpsList).find(v => v.id === id);
                        return `<span class="tag">${esc(vps ? vps.name : id)}</span>`;
                    }).join(' ')
                    : '<span style="color:var(--text-muted)">None</span>')}</td>
            <td>${u.active !== false
                ? '<span style="color:var(--success)">Active</span>'
                : '<span style="color:var(--danger)">Disabled</span>'}</td>
            <td class="action-btns">
                <button class="btn btn-xs" onclick="showEditUserModal('${u.id}')">Edit</button>
                <button class="btn btn-xs" onclick="showUserVPSAccessModal('${u.id}')" title="VPS Access">VPS Access</button>
                <button class="btn btn-xs" onclick="showGroupAccessModal('${u.id}','${escHtml(u.username)}')" title="Group Access">
                    <span class="material-icons" style="font-size:14px">folder</span>
                </button>
                ${u.username !== 'admin' ? `<button class="btn btn-xs btn-danger" onclick="deleteUser('${u.id}','${esc(u.username)}')">Delete</button>` : ''}
            </td>
        </tr>`;
        }).join('');
    } catch (err) {
        console.error('Users list error:', err);
    }
}

// Add User Modal
function showAddUserModal() {
    if (!isAdmin()) return;
    document.getElementById('userModalTitle').textContent = 'Add User';
    document.getElementById('userEditId').value = '';
    document.getElementById('userForm').reset();
    document.getElementById('userRole').value = 'viewer';
    document.getElementById('userModal').classList.remove('hidden');
}

// Edit User Modal
function showEditUserModal(userId) {
    if (!isAdmin()) return;
    const user = usersList.find(u => u.id === userId);
    if (!user) return;
    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userEditId').value = user.id;
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userDisplayName').value = user.display_name || '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = user.role;
    document.getElementById('userModal').classList.remove('hidden');
}

function closeUserModal() {
    document.getElementById('userModal').classList.add('hidden');
}

async function saveUser(e) {
    e.preventDefault();
    const editId = document.getElementById('userEditId').value;
    const data = {
        username: document.getElementById('userUsername').value,
        display_name: document.getElementById('userDisplayName').value || '',
        role: document.getElementById('userRole').value || 'viewer',
    };
    const password = document.getElementById('userPassword').value;
    if (password) data.password = password;

    try {
        if (editId) {
            await api('PUT', `/users/${editId}`, data);
        } else {
            if (!password) { showToast('Password is required for new users', 'warning'); return; }
            await api('POST', '/users', data);
        }
        closeUserModal();
        loadUsersList();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function deleteUser(userId, username) {
    if (!isAdmin()) return;
    showConfirm(`Delete user "${username}"? This cannot be undone.`, async () => {
        try {
            await api('DELETE', `/users/${userId}`);
            loadUsersList();
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });
}

// VPS Access Modal
function showUserVPSAccessModal(userId) {
    if (!isAdmin()) return;
    const user = usersList.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('vpsAccessUserId').value = user.id;
    document.getElementById('vpsAccessTitle').textContent = `VPS Access: ${user.username}`;

    const list = allVPSList.length ? allVPSList : vpsList;
    const userAccess = new Set(user.direct_vps_access || []);

    const container = document.getElementById('vpsAccessCheckboxes');
    if (list.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted)">No VPS available.</p>';
    } else {
        container.innerHTML = list.map(v => `
            <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">
                <input type="checkbox" value="${v.id}" ${userAccess.has(v.id) ? 'checked' : ''}>
                ${esc(v.name)} <code style="font-size:11px;color:var(--text-muted)">${esc(v.host)}</code>
            </label>
        `).join('');
    }

    document.getElementById('vpsAccessModal').classList.remove('hidden');

    // Show group-derived access info
    const groupNote = document.getElementById('vpsAccessGroupNote');
    if (user.group_names && user.group_names.length > 0) {
        groupNote.innerHTML = `<span class="material-icons" style="font-size:12px;vertical-align:middle;">folder</span> This user also has access to VPS via groups: <strong>${user.group_names.map(n => escHtml(n)).join(', ')}</strong>`;
        groupNote.style.display = '';
    } else {
        groupNote.style.display = 'none';
    }
}

function closeVPSAccessModal() {
    document.getElementById('vpsAccessModal').classList.add('hidden');
}

async function saveVPSAccess() {
    const userId = document.getElementById('vpsAccessUserId').value;
    const checkboxes = document.querySelectorAll('#vpsAccessCheckboxes input[type="checkbox"]');
    const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

    try {
        await api('PUT', `/users/${userId}`, { vps_access: selected });
        closeVPSAccessModal();
        loadUsersList();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════
// ─── Invite Member (Admin Only) ──────────────────────────
// ═══════════════════════════════════════════════════════════

function showInviteModal() {
    if (!isAdmin()) return;
    document.getElementById('inviteUsername').value = '';
    document.getElementById('inviteDisplayName').value = '';
    document.getElementById('inviteRole').value = 'viewer';
    document.getElementById('inviteResult').classList.add('hidden');
    document.getElementById('generateInviteBtn').disabled = false;
    document.getElementById('inviteModal').classList.remove('hidden');
}

function closeInviteModal() {
    document.getElementById('inviteModal').classList.add('hidden');
}

async function generateInvite() {
    const role = document.getElementById('inviteRole').value;
    const btn = document.getElementById('generateInviteBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons" style="font-size:16px;animation:spin 1s linear infinite">sync</span> Generating...';

    try {
        const result = await api('POST', '/users/invite', { role });
        const baseUrl = window.location.origin;
        const fullUrl = `${baseUrl}${result.url}`;
        document.getElementById('inviteLink').value = fullUrl;
        document.getElementById('inviteResult').classList.remove('hidden');
        btn.innerHTML = '<span class="material-icons" style="font-size:16px">link</span> Generate Invite Link';
        btn.disabled = false;
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
        btn.innerHTML = '<span class="material-icons" style="font-size:16px">link</span> Generate Invite Link';
        btn.disabled = false;
    }
}

function copyInviteLink() {
    const linkInput = document.getElementById('inviteLink');
    linkInput.select();
    linkInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(linkInput.value).then(() => {
        // Brief visual feedback
        const btn = event.target.closest('button');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<span class="material-icons" style="font-size:14px">check</span> Copied!';
        setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
    }).catch(() => {
        // Fallback
        document.execCommand('copy');
    });
}

// ═══════════════════════════════════════════════════════════
// ─── SSH Key Management ──────────────────────────────────

async function loadSSHKeys() {
    try {
        const keys = await api('GET', '/ssh-keys');
        const tbody = document.getElementById('sshKeysTableBody');
        if (!keys.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">No SSH keys added yet. <a href="#" onclick="showAddSSHKeyModal()">Add your first key</a></td></tr>';
            return;
        }
        tbody.innerHTML = keys.map(k => {
            const typeBadge = {
                'file': '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:var(--primary);color:white;">File</span>',
                'pasted': '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:var(--success);color:white;">Pasted</span>',
                'public_only': '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:var(--tertiary);color:var(--text);border:1px solid var(--border);">Public</span>',
                'both': '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:var(--warning);color:white;">Both</span>',
            }[k.key_type] || '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:var(--primary);color:white;">File</span>';
            return `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="material-icons" style="font-size:18px;color:var(--primary)">vpn_key</span>
                        <div>
                            <strong>${escHtml(k.name)}</strong>
                            <div style="margin-top:2px;">${typeBadge}</div>
                        </div>
                    </div>
                </td>
                <td><code style="font-size:12px;">${escHtml(k.key_file || '—')}</code></td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    <code style="font-size:11px;color:var(--text-muted);">${escHtml(k.public_key || '—')}</code>
                </td>
                <td style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text-muted);">
                    ${escHtml(k.fingerprint || '—')}
                </td>
                <td style="font-size:12px;color:var(--text-muted);">${new Date(k.created_at * 1000).toLocaleDateString()}</td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-xs" onclick="fetchKeyFingerprint('${k.id}')" title="Get Fingerprint">
                            <span class="material-icons" style="font-size:14px">fingerprint</span>
                        </button>
                        <button class="btn btn-xs" onclick="deleteSSHKey('${k.id}','${escHtml(k.name)}')" title="Delete">
                            <span class="material-icons" style="font-size:14px;color:var(--danger)">delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('');
    } catch (err) {
        console.error('Load SSH keys error:', err);
    }
}

let sshKeyInputMode = 'file'; // 'file', 'pasted', 'public_only'

function setSSHKeyType(mode) {
    sshKeyInputMode = mode;
    const fileBtn = document.getElementById('sshKeyTypeFile');
    const pastedBtn = document.getElementById('sshKeyTypePasted');
    const publicOnlyBtn = document.getElementById('sshKeyTypePublicOnly');
    const fileSection = document.getElementById('sshKeyFileSection');
    const pastedSection = document.getElementById('sshKeyPastedSection');
    const publicKeyLabel = document.getElementById('sshPublicKeyLabel');

    // Reset all buttons
    [fileBtn, pastedBtn, publicOnlyBtn].forEach(b => b.classList.remove('btn-primary'));
    
    // Show/hide sections
    fileSection.style.display = (mode === 'file') ? '' : 'none';
    pastedSection.style.display = (mode === 'pasted') ? '' : 'none';
    publicKeyLabel.textContent = mode === 'public_only' ? '*' : '(optional)';

    // Highlight active button
    if (mode === 'file') fileBtn.classList.add('btn-primary');
    else if (mode === 'pasted') pastedBtn.classList.add('btn-primary');
    else publicOnlyBtn.classList.add('btn-primary');
}

function showAddSSHKeyModal() {
    document.getElementById('sshKeyName').value = '';
    document.getElementById('sshKeyFile').value = '';
    document.getElementById('sshPrivateKey').value = '';
    document.getElementById('sshPublicKey').value = '';
    setSSHKeyType('file');
    document.getElementById('sshKeyModal').classList.remove('hidden');
}

function closeSSHKeyModal() {
    document.getElementById('sshKeyModal').classList.add('hidden');
}

async function saveSSHKey() {
    const name = document.getElementById('sshKeyName').value.trim();
    const keyFile = document.getElementById('sshKeyFile').value.trim();
    const privateKey = document.getElementById('sshPrivateKey').value.trim();
    const publicKey = document.getElementById('sshPublicKey').value.trim();
    
    if (!name) { showToast('Key name is required', 'warning'); return; }

    // Validate based on mode
    if (sshKeyInputMode === 'file' && !keyFile) {
        showToast('Private key file path is required', 'warning');
        return;
    }
    if (sshKeyInputMode === 'pasted' && !privateKey) {
        showToast('Private key content is required', 'warning');
        return;
    }
    if (sshKeyInputMode === 'public_only' && !publicKey) {
        showToast('Public key content is required', 'warning');
        return;
    }

    try {
        const payload = {
            name,
            key_type: sshKeyInputMode,
            key_file: keyFile || null,
            private_key: privateKey || null,
            public_key: publicKey || null,
        };
        const r = await api('POST', '/ssh-keys', payload);
        if (r.success) {
            closeSSHKeyModal();
            loadSSHKeys();
        }
    } catch (err) {
        showToast('Failed to save SSH key: ' + err.message, 'error');
    }
}

async function deleteSSHKey(keyId, keyName) {
    showConfirm(`Delete SSH key "${keyName}"? VPS instances using this key will need to be updated manually.`, async () => {
        try {
            await api('DELETE', `/ssh-keys/${keyId}`);
            loadSSHKeys();
        } catch (err) {
            showToast('Failed to delete SSH key: ' + err.message, 'error');
        }
    });
}

async function fetchKeyFingerprint(keyId) {
    try {
        const r = await api('POST', `/ssh-keys/${keyId}/fingerprint`);
        if (r.fingerprint) {
            loadSSHKeys();
        } else {
            showToast('Could not get fingerprint: ' + (r.error || 'Unknown error'), 'error');
        }
    } catch (err) {
        showToast('Failed to get fingerprint: ' + err.message, 'error');
    }
}

// ─── SSH Key Dropdown in VPS Wizard ──────────────────────

let savedSSHKeys = [];

async function loadSavedSSHKeys() {
    if (!isAdmin()) return;
    try {
        savedSSHKeys = await api('GET', '/ssh-keys');
        const select = document.getElementById('vpsKeySelect');
        if (!select) return;
        select.innerHTML = '<option value="">-- Select a saved key --</option>';
        savedSSHKeys.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k.key_file;
            opt.textContent = `${k.name} (${k.key_file})`;
            select.appendChild(opt);
        });
    } catch (err) {
        // Non-critical, just log
        console.warn('Could not load SSH keys for dropdown:', err);
    }
}

function onSSHKeySelected() {
    const select = document.getElementById('vpsKeySelect');
    const input = document.getElementById('vpsKeyFile');
    if (select && input && select.value) {
        input.value = select.value;
    }
}

// ─── Group Management ────────────────────────────────────

let allGroups = [];

async function loadGroups() {
    try {
        allGroups = await api('GET', '/groups');
        const tbody = document.getElementById('groupsTableBody');
        if (!allGroups.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:32px;">No groups yet. <a href="#" onclick="showCreateGroupModal()">Create your first group</a></td></tr>';
            return;
        }
        tbody.innerHTML = allGroups.map(g => `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="material-icons" style="font-size:18px;color:var(--warning)">folder</span>
                        <strong>${escHtml(g.name)}</strong>
                    </div>
                </td>
                <td style="color:var(--text-muted);font-size:13px;">${escHtml(g.description || '—')}</td>
                <td>
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;background:var(--primary);color:white;font-size:12px;font-weight:500;">
                        <span class="material-icons" style="font-size:13px">dns</span> ${g.vps_count}
                    </span>
                </td>
                <td>
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;background:var(--tertiary);color:var(--text);font-size:12px;">
                        <span class="material-icons" style="font-size:13px">people</span> ${g.member_count}
                    </span>
                </td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-xs btn-primary" onclick="showAddVPSToGroup('${g.id}','${escHtml(g.name)}')" title="Add VPS">
                            <span class="material-icons" style="font-size:14px">add</span>
                        </button>
                        <button class="btn btn-xs" onclick="showRemoveVPSFromGroup('${g.id}','${escHtml(g.name)}')" title="Remove VPS" ${g.vps_count === 0 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
                            <span class="material-icons" style="font-size:14px;color:var(--warning)">remove</span>
                        </button>
                        <button class="btn btn-xs" onclick="viewGroupDetail('${g.id}')" title="View Details">
                            <span class="material-icons" style="font-size:14px">visibility</span>
                        </button>
                        <button class="btn btn-xs" onclick="editGroup('${g.id}')" title="Edit">
                            <span class="material-icons" style="font-size:14px">edit</span>
                        </button>
                        <button class="btn btn-xs" onclick="deleteGroup('${g.id}','${escHtml(g.name)}')" title="Delete">
                            <span class="material-icons" style="font-size:14px;color:var(--danger)">delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Load groups error:', err);
    }
}

function showCreateGroupModal() {
    document.getElementById('groupEditId').value = '';
    document.getElementById('groupName').value = '';
    document.getElementById('groupDescription').value = '';
    document.getElementById('groupModalTitle').textContent = 'Create Group';
    document.getElementById('groupModal').classList.remove('hidden');
}

function editGroup(groupId) {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;
    document.getElementById('groupEditId').value = groupId;
    document.getElementById('groupName').value = group.name;
    document.getElementById('groupDescription').value = group.description || '';
    document.getElementById('groupModalTitle').textContent = 'Edit Group';
    document.getElementById('groupModal').classList.remove('hidden');
}

function closeGroupModal() {
    document.getElementById('groupModal').classList.add('hidden');
}

async function saveGroup() {
    const editId = document.getElementById('groupEditId').value;
    const name = document.getElementById('groupName').value.trim();
    const description = document.getElementById('groupDescription').value.trim();
    if (!name) { showToast('Group name is required', 'warning'); return; }
    try {
        if (editId) {
            await api('PUT', `/groups/${editId}`, { name, description });
        } else {
            await api('POST', '/groups', { name, description });
        }
        closeGroupModal();
        loadGroups();
    } catch (err) {
        showToast('Failed to save group: ' + err.message, 'error');
    }
}

async function deleteGroup(groupId, groupName) {
    showConfirm(`Delete group "${groupName}"? This will NOT delete the VPS instances, only the grouping.`, async () => {
        try {
            await api('DELETE', `/groups/${groupId}`);
            loadGroups();
        } catch (err) {
            showToast('Failed to delete group: ' + err.message, 'error');
        }
    });
}

// ─── Add VPS to Group ────────────────────────────────────

async function showAddVPSToGroup(groupId, groupName) {
    document.getElementById('addVPSGroupId').value = groupId;
    document.getElementById('addVPSToGroupTitle').textContent = `Add VPS to: ${groupName}`;
    const container = document.getElementById('addVPSToGroupCheckboxes');
    container.innerHTML = '<div class="loading">Loading VPS...</div>';
    document.getElementById('addVPSToGroupModal').classList.remove('hidden');
    
    try {
        // Get group details to know which VPS are already in it
        const group = await api('GET', `/groups/${groupId}`);
        const currentVPSIds = new Set((group.vps_list || []).map(v => v.id));
        
        // Get all VPS
        const allVPS = await api('GET', '/vps');
        
        if (!allVPS.length) {
            container.innerHTML = '<p style="color:var(--text-muted);padding:12px;">No VPS instances available.</p>';
            return;
        }
        
        container.innerHTML = allVPS.map(v => {
            const isInGroup = currentVPSIds.has(v.id);
            return `<label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;${isInGroup ? 'opacity:0.5;' : ''}">
                <input type="checkbox" value="${v.id}" ${isInGroup ? 'checked disabled' : ''}>
                <div>
                    <strong>${escHtml(v.name)}</strong>
                    <code style="font-size:11px;color:var(--text-muted)">${escHtml(v.host)}</code>
                    ${isInGroup ? '<span style="font-size:10px;color:var(--success);margin-left:4px;">● already in group</span>' : `<span style="font-size:10px;color:var(--text-muted);margin-left:4px;">current: ${escHtml(v.group || 'default')}</span>`}
                </div>
            </label>`;
        }).join('');
    } catch (err) {
        container.innerHTML = '<p style="color:var(--danger);">Failed to load VPS list</p>';
    }
}

function closeAddVPSToGroupModal() {
    document.getElementById('addVPSToGroupModal').classList.add('hidden');
}

async function saveVPSToGroup() {
    const groupId = document.getElementById('addVPSGroupId').value;
    const checkboxes = document.querySelectorAll('#addVPSToGroupCheckboxes input[type="checkbox"]:checked:not(:disabled)');
    const selectedVPSIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (!selectedVPSIds.length) {
        showToast('Please select at least one VPS', 'warning');
        return;
    }
    
    // Get group name
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;
    
    try {
        // Update each selected VPS to this group
        for (const vpsId of selectedVPSIds) {
            const vps = (allVPSList.length ? allVPSList : vpsList).find(v => v.id === vpsId);
            if (vps) {
                await api('PUT', `/vps/${vpsId}`, {
                    name: vps.name,
                    host: vps.host,
                    port: vps.port || 22,
                    username: vps.username || 'root',
                    password: null,
                    key_file: null,
                    tags: vps.tags || [],
                    group: group.name,
                });
            }
        }
        closeAddVPSToGroupModal();
        loadGroups(); // refresh group list
        loadVPSList(); // refresh VPS list
    } catch (err) {
        showToast('Failed to update VPS: ' + err.message, 'error');
    }
}

// ─── Remove VPS from Group ──────────────────────────────

async function showRemoveVPSFromGroup(groupId, groupName) {
    document.getElementById('removeVPSGroupId').value = groupId;
    document.getElementById('removeVPSFromGroupTitle').textContent = `Remove VPS from: ${groupName}`;
    const container = document.getElementById('removeVPSFromGroupCheckboxes');
    container.innerHTML = '<div class="loading">Loading VPS...</div>';
    document.getElementById('removeVPSFromGroupModal').classList.remove('hidden');
    
    try {
        // Get group details to know which VPS are in it
        const group = await api('GET', `/groups/${groupId}`);
        const groupVPS = group.vps_list || [];
        
        if (!groupVPS.length) {
            container.innerHTML = '<p style="color:var(--text-muted);padding:12px;">No VPS in this group.</p>';
            return;
        }
        
        container.innerHTML = groupVPS.map(v => `
            <label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;">
                <input type="checkbox" value="${v.id}">
                <div>
                    <strong>${escHtml(v.name)}</strong>
                    <code style="font-size:11px;color:var(--text-muted)">${escHtml(v.host)}</code>
                </div>
            </label>
        `).join('');
    } catch (err) {
        container.innerHTML = '<p style="color:var(--danger);">Failed to load group VPS</p>';
    }
}

function closeRemoveVPSFromGroupModal() {
    document.getElementById('removeVPSFromGroupModal').classList.add('hidden');
}

async function saveRemoveVPSFromGroup() {
    const groupId = document.getElementById('removeVPSGroupId').value;
    const checkboxes = document.querySelectorAll('#removeVPSFromGroupCheckboxes input[type="checkbox"]:checked');
    const selectedVPSIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (!selectedVPSIds.length) {
        showToast('Please select at least one VPS to remove', 'warning');
        return;
    }
    
    try {
        // Update each selected VPS back to 'default' group
        for (const vpsId of selectedVPSIds) {
            const vps = (allVPSList.length ? allVPSList : vpsList).find(v => v.id === vpsId);
            if (vps) {
                await api('PUT', `/vps/${vpsId}`, {
                    name: vps.name,
                    host: vps.host,
                    port: vps.port || 22,
                    username: vps.username || 'root',
                    password: null,
                    key_file: null,
                    tags: vps.tags || [],
                    group: 'default',
                });
            }
        }
        closeRemoveVPSFromGroupModal();
        loadGroups();
        loadVPSList();
    } catch (err) {
        showToast('Failed to remove VPS from group: ' + err.message, 'error');
    }
}

async function viewGroupDetail(groupId) {
    try {
        const g = await api('GET', `/groups/${groupId}`);
        document.getElementById('groupDetailTitle').textContent = `Group: ${escHtml(g.name)}`;
        
        let html = '';
        if (g.description) {
            html += `<p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">${escHtml(g.description)}</p>`;
        }
        
        // VPS section
        html += `<h4 style="margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span class="material-icons" style="font-size:16px;color:var(--primary)">dns</span>
            VPS Instances (${g.vps_count})
        </h4>`;
        if (g.vps_list.length) {
            html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">';
            g.vps_list.forEach(v => {
                html += `<div style="padding:6px 12px;border-radius:6px;background:var(--tertiary);border:1px solid var(--border);font-size:12px;">
                    <strong>${escHtml(v.name)}</strong> <span style="color:var(--text-muted);">${escHtml(v.host)}</span>
                </div>`;
            });
            html += '</div>';
        } else {
            html += '<p style="color:var(--text-muted);font-size:12px;margin-bottom:16px;">No VPS in this group. Assign VPS by setting their group name to "' + escHtml(g.name) + '".</p>';
        }
        
        // Members section
        html += `<h4 style="margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span class="material-icons" style="font-size:16px;color:var(--warning)">people</span>
            Members (${g.member_count})
        </h4>`;
        if (g.members.length) {
            html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
            g.members.forEach(m => {
                const roleColor = m.role === 'admin' ? 'var(--primary)' : m.role === 'operator' ? 'var(--warning)' : 'var(--neutral)';
                html += `<div style="padding:6px 12px;border-radius:6px;background:var(--tertiary);border:1px solid var(--border);font-size:12px;">
                    <strong>${escHtml(m.display_name || m.username)}</strong> 
                    <span style="color:${roleColor};font-size:11px;">${m.role}</span>
                </div>`;
            });
            html += '</div>';
        } else {
            html += '<p style="color:var(--text-muted);font-size:12px;">No members. Go to Users page to assign group access.</p>';
        }
        
        document.getElementById('groupDetailBody').innerHTML = html;
        document.getElementById('groupDetailModal').classList.remove('hidden');
    } catch (err) {
        showToast('Failed to load group: ' + err.message, 'error');
    }
}

function closeGroupDetailModal() {
    document.getElementById('groupDetailModal').classList.add('hidden');
}

// ─── Group Access for Users ──────────────────────────────

function showGroupAccessModal(userId, username) {
    document.getElementById('groupAccessUserId').value = userId;
    document.getElementById('groupAccessTitle').textContent = `Group Access: ${username}`;
    const container = document.getElementById('groupAccessCheckboxes');
    container.innerHTML = '<div class="loading">Loading groups...</div>';
    document.getElementById('groupAccessModal').classList.remove('hidden');
    loadGroupAccessCheckboxes(userId);
}

async function loadGroupAccessCheckboxes(userId) {
    const container = document.getElementById('groupAccessCheckboxes');
    try {
        const groups = await api('GET', '/groups');
        const users = await api('GET', '/users');
        const targetUser = users.find(u => u.id === userId);
        const userGroupIds = targetUser ? (targetUser.group_access || []) : [];
        
        if (!groups.length) {
            container.innerHTML = '<p style="color:var(--text-muted);padding:12px;">No groups available. <a href="#" onclick="closeGroupAccessModal();showPage(\'groups\');">Create a group first</a></p>';
            return;
        }
        
        container.innerHTML = groups.map(g => `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;">
                <input type="checkbox" value="${g.id}" ${userGroupIds.includes(g.id) ? 'checked' : ''} 
                    style="width:16px;height:16px;accent-color:var(--primary);">
                <div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span class="material-icons" style="font-size:16px;color:var(--warning)">folder</span>
                        <strong>${escHtml(g.name)}</strong>
                    </div>
                    <span style="font-size:11px;color:var(--text-muted);">${g.vps_count} VPS · ${g.member_count} members</span>
                    ${g.description ? `<span style="font-size:11px;color:var(--text-muted);"> — ${escHtml(g.description)}</span>` : ''}
                </div>
            </label>
        `).join('');
    } catch (err) {
        container.innerHTML = '<p style="color:var(--danger);">Failed to load groups</p>';
    }
}

function closeGroupAccessModal() {
    document.getElementById('groupAccessModal').classList.add('hidden');
}

async function saveGroupAccess() {
    const userId = document.getElementById('groupAccessUserId').value;
    const checkboxes = document.querySelectorAll('#groupAccessCheckboxes input[type="checkbox"]');
    const groupIds = [];
    checkboxes.forEach(cb => { if (cb.checked) groupIds.push(cb.value); });
    try {
        await api('PUT', `/users/${userId}/group-access`, { group_ids: groupIds });
        closeGroupAccessModal();
        loadUsersList(); // refresh user list
    } catch (err) {
        showToast('Failed to save group access: ' + err.message, 'error');
    }
}

async function loadGroupDropdown() {
    if (!isAdmin()) return;
    try {
        const groups = await api('GET', '/groups');
        const select = document.getElementById('vpsGroup');
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="default">default</option>';
        groups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.name;
            opt.textContent = g.name;
            select.appendChild(opt);
        });
        // Restore selection if it exists
        if (currentVal) select.value = currentVal;
    } catch (err) {
        console.warn('Could not load groups for dropdown:', err);
    }
}

// ─── Audit Logs (Admin Only) ──────────────────────────────
// ═══════════════════════════════════════════════════════════

let _auditFilterTimer = null;
function debounceAuditFilter() {
    clearTimeout(_auditFilterTimer);
    _auditFilterTimer = setTimeout(loadAuditLogs, 400);
}

function formatAuditAction(action) {
    const map = {
        'login': '🔵 Login',
        'logout': '⚪ Logout',
        'vps_create': '🟢 VPS Create',
        'vps_update': '🟡 VPS Update',
        'vps_delete': '🔴 VPS Delete',
        'container_start': '▶️ Container Start',
        'container_stop': '⏹️ Container Stop',
        'container_restart': '🔄 Container Restart',
        'user_create': '👤 User Create',
        'user_update': '✏️ User Update',
        'user_delete': '🗑️ User Delete',
        'exec_command': '⌨️ Exec Command',
        'terminal_connect': '💻 Terminal Connect',
    };
    return map[action] || action;
}

async function loadAuditLogs() {
    if (!isAdmin()) return;
    const filter = document.getElementById('auditActionFilter')?.value || '';
    const userFilter = document.getElementById('auditUserFilter')?.value || '';
    let url = `/audit-logs?limit=200`;
    if (filter) url += `&action=${encodeURIComponent(filter)}`;
    if (userFilter) url += `&user=${encodeURIComponent(userFilter)}`;

    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted)">Loading...</td></tr>';

    try {
        const data = await api('GET', url);
        const countEl = document.getElementById('auditTotalCount');
        if (countEl) countEl.textContent = `${data.total} log entries`;

        if (!data.logs || data.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">No audit logs found.</td></tr>';
            return;
        }

        tbody.innerHTML = data.logs.map(log => {
            const ts = log.timestamp ? new Date(log.timestamp).toLocaleString() : '-';
            const detailsFormatted = log.details ? Object.entries(log.details).map(([k,v]) => `${k}: ${v}`).join(' · ') : '';
            const resourceStr = log.resource_type ? `${esc(log.resource_type)}${log.resource_id ? ': ' + esc(log.resource_id.substring(0, 8)) : ''}` : '-';
            return `<tr>
                <td style="white-space:nowrap;font-size:12px;color:var(--text-muted);font-family:'JetBrains Mono',monospace">${esc(ts)}</td>
                <td><strong>${esc(log.username)}</strong></td>
                <td>${formatAuditAction(log.action)}</td>
                <td>${resourceStr}</td>
                <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;font-size:12px;color:var(--primary)" onclick="showAuditDetail(this)" data-log='${esc(JSON.stringify(log))}'>${esc(detailsFormatted)}</td>
                <td style="font-size:12px;color:var(--text-muted)">${esc(log.ip_address || '-')}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--danger)">Error: ${esc(err.message)}</td></tr>`;
    }
}

// ─── Helpers ────────────────────────────────────────────────
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Handle window resize for terminal
window.addEventListener('resize', () => {
    fitActiveTerminal();
});

// ─── Toast Notification System ─────────────────────────────
const toastIcons = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info'
};

function showToast(message, type = 'info') {
    type = type || 'info';
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="material-icons toast-icon">${toastIcons[type] || 'info'}</span>
        <span class="toast-message">${escHtml(message)}</span>
        <button class="toast-close" onclick="dismissToast(this.parentElement)">&times;</button>
    `;
    container.appendChild(toast);

    const duration = type === 'error' ? 6000 : 4000;
    const timer = setTimeout(() => dismissToast(toast), duration);
    toast._timer = timer;
}

function dismissToast(toast) {
    if (!toast || toast._dismissed) return;
    toast._dismissed = true;
    clearTimeout(toast._timer);
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 250);
}

// ─── Confirm Modal ─────────────────────────────────────────
let _confirmCallback = null;

function showConfirm(message, onConfirm) {
    document.getElementById('confirmMessage').textContent = message;
    _confirmCallback = onConfirm;
    document.getElementById('confirmModal').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    _confirmCallback = null;
}

function confirmOk() {
    const cb = _confirmCallback;
    closeConfirmModal();
    if (cb) cb();
}

// ─── Audit Detail Modal ────────────────────────────────────
function showAuditDetail(el) {
    const log = JSON.parse(el.dataset.log);
    const metaEl = document.getElementById('auditDetailMeta');
    const jsonEl = document.getElementById('auditDetailJson');

    const ts = log.timestamp ? new Date(log.timestamp).toLocaleString() : '-';
    const resourceStr = log.resource_type ? `${log.resource_type}${log.resource_id ? ': ' + log.resource_id.substring(0, 8) : ''}` : '-';

    metaEl.innerHTML = `
        <dt>Timestamp</dt><dd>${escHtml(ts)}</dd>
        <dt>User</dt><dd>${escHtml(log.username)}</dd>
        <dt>Action</dt><dd>${escHtml(log.action)}</dd>
        <dt>Resource</dt><dd>${escHtml(resourceStr)}</dd>
        <dt>IP</dt><dd>${escHtml(log.ip_address || '-')}</dd>
    `;

    if (log.details && typeof log.details === 'object') {
        jsonEl.innerHTML = syntaxHighlightJSON(JSON.stringify(log.details, null, 2));
    } else {
        jsonEl.textContent = 'No details available';
    }

    document.getElementById('auditDetailModal').classList.remove('hidden');
}

function closeAuditDetailModal() {
    document.getElementById('auditDetailModal').classList.add('hidden');
}

function syntaxHighlightJSON(json) {
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|\bnull\b)/g, function(match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-bool';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

// ─── GitHub Actions ─────────────────────────────────────────
let _ghTokensCache = [];

function toggleGitHubConfig() {
    const panel = document.getElementById('ghConfigPanel');
    const icon = document.getElementById('ghConfigToggleIcon');
    if (panel.style.display === 'none') {
        panel.style.display = '';
        icon.style.transform = 'rotate(180deg)';
    } else {
        panel.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function getStatusIcon(status, conclusion) {
    if (status === 'completed') {
        if (conclusion === 'success') return '✅';
        if (conclusion === 'failure') return '❌';
        if (conclusion === 'cancelled') return '⏹️';
        return '⚠️';
    }
    if (status === 'in_progress' || status === 'queued') return '🔄';
    return '⏳';
}

function getStatusColor(status, conclusion) {
    if (status === 'completed') {
        if (conclusion === 'success') return '#22C55E';
        if (conclusion === 'failure') return '#EF4444';
        return '#6B7280';
    }
    if (status === 'in_progress') return '#F59E0B';
    return '#6B7280';
}

async function loadGitHubActions() {
    // Load tokens, repos, and workflow runs in parallel
    loadGitHubTokens();
    loadGitHubRepos();
    try {
        const data = await api('GET', '/github/actions');
        renderGitHubActions(data);
    } catch (err) {
        console.error('GitHub actions error:', err);
        document.getElementById('ghWorkflowRuns').innerHTML =
            `<div class="empty-state"><span class="material-icons empty-icon" style="color:var(--danger);">error</span><p style="color:var(--danger);">Failed to load workflow runs: ${escHtml(err.message)}</p></div>`;
    }
}

function renderGitHubActions(data) {
    const repos = data.repos || [];
    let totalRuns = 0, successCount = 0, failedCount = 0, runningCount = 0;

    // Count across all repos
    repos.forEach(r => {
        const runs = r.runs || [];
        runs.forEach(run => {
            totalRuns++;
            if (run.status === 'completed' && run.conclusion === 'success') successCount++;
            else if (run.status === 'completed' && run.conclusion === 'failure') failedCount++;
            else if (run.status === 'in_progress' || run.status === 'queued') runningCount++;
        });
    });

    document.getElementById('ghTotalRepos').textContent = repos.length;
    document.getElementById('ghSuccessCount').textContent = successCount;
    document.getElementById('ghFailedCount').textContent = failedCount;
    document.getElementById('ghRunningCount').textContent = runningCount;

    const container = document.getElementById('ghWorkflowRuns');
    if (repos.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <span class="material-icons empty-icon" style="font-size:48px;color:var(--text-muted);">rocket_launch</span>
            <p style="color:var(--text-muted);">Add a token and repository to see workflow runs.</p>
        </div>`;
        return;
    }

    let html = '';
    for (const repo of repos) {
        if (repo.error) {
            html += `<div style="background:var(--card);border-radius:8px;padding:16px;margin-bottom:12px;border:1px solid var(--border);border-left:3px solid #EF4444;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <span class="material-icons" style="font-size:18px;">source</span>
                    <strong style="font-family:'JetBrains Mono',monospace;font-size:14px;">${escHtml(repo.repo)}</strong>
                    ${repo.branch ? `<span class="tag">${escHtml(repo.branch)}</span>` : ''}
                </div>
                <div style="color:var(--danger);font-size:13px;">⚠ ${escHtml(repo.error)}</div>
            </div>`;
            continue;
        }

        const runs = repo.runs || [];
        const lastRun = runs[0];
        let borderColor = '#6B7280';
        if (lastRun) borderColor = getStatusColor(lastRun.status, lastRun.conclusion);

        html += `<div style="background:var(--card);border-radius:8px;padding:16px;margin-bottom:12px;border:1px solid var(--border);border-left:3px solid ${borderColor};">`;
        html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="material-icons" style="font-size:18px;">source</span>
                <strong style="font-family:'JetBrains Mono',monospace;font-size:14px;">
                    <a href="https://github.com/${escHtml(repo.repo)}" target="_blank" style="color:var(--text);text-decoration:none;">${escHtml(repo.repo)}</a>
                </strong>
                ${repo.branch ? `<span class="tag">${escHtml(repo.branch)}</span>` : ''}
            </div>
            <span style="font-size:12px;color:var(--text-muted);">${runs.length} run${runs.length !== 1 ? 's' : ''}</span>
        </div>`;

        if (runs.length === 0) {
            html += `<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:12px;">No recent workflow runs found.</div>`;
        } else {
            for (const run of runs) {
                const icon = getStatusIcon(run.status, run.conclusion);
                const color = getStatusColor(run.status, run.conclusion);
                const msg = run.commit_message ? (run.commit_message.length > 60 ? run.commit_message.substring(0, 60) + '…' : run.commit_message) : '';
                html += `<a href="${escHtml(run.html_url || '#')}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:6px;margin-bottom:4px;text-decoration:none;color:var(--text);background:var(--secondary);transition:background 0.15s;" onmouseover="this.style.background='var(--tertiary)'" onmouseout="this.style.background='var(--secondary)'">
                    <span style="font-size:16px;">${icon}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                            <span style="font-weight:500;font-size:13px;">${escHtml(run.name || 'Workflow')}</span>
                            <span class="tag" style="font-size:11px;background:${color}20;color:${color};border-color:${color}40;">${escHtml(run.branch || '')}</span>
                            ${run.commit ? `<code style="font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;">${escHtml(run.commit)}</code>` : ''}
                        </div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${msg ? `${escHtml(msg)} · ` : ''}${escHtml(run.actor || '')} · ${timeAgo(run.started_at)}
                        </div>
                    </div>
                    <span class="material-icons" style="font-size:16px;color:var(--text-muted);">open_in_new</span>
                </a>`;
            }
        }
        html += `</div>`;
    }
    container.innerHTML = html;
}

async function loadGitHubTokens() {
    try {
        const tokens = await api('GET', '/github/tokens');
        _ghTokensCache = tokens;
        const tbody = document.getElementById('ghTokensTableBody');
        if (tokens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No tokens added</td></tr>';
            return;
        }
        tbody.innerHTML = tokens.map(t => `<tr>
            <td><strong>${escHtml(t.name)}</strong></td>
            <td><code style="font-family:'JetBrains Mono',monospace;font-size:12px;">${escHtml(t.token_masked)}</code></td>
            <td>${escHtml(t.github_user || '-')}</td>
            <td class="action-btns">
                <button class="btn btn-xs" onclick="testToken('${escHtml(t.id)}')" title="Test token">
                    <span class="material-icons" style="font-size:14px;">check_circle</span>
                </button>
                <button class="btn btn-xs btn-danger" onclick="deleteToken('${escHtml(t.id)}','${escHtml(t.name)}')">
                    <span class="material-icons" style="font-size:14px;">delete</span>
                </button>
            </td>
        </tr>`).join('');
    } catch (err) {
        console.error('Load tokens error:', err);
    }
}

async function loadGitHubRepos() {
    try {
        const repos = await api('GET', '/github/repos');
        const tbody = document.getElementById('ghReposTableBody');
        if (repos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No repos tracked</td></tr>';
            return;
        }
        tbody.innerHTML = repos.map(r => `<tr>
            <td>${r.is_public ? '<span style="color:var(--accent);font-weight:600;">🌐 Public</span>' : escHtml(r.token_name)}</td>
            <td><code style="font-family:'JetBrains Mono',monospace;">${escHtml(r.full_name)}</code></td>
            <td>${r.branch ? `<span class="tag">${escHtml(r.branch)}</span>` : '<span style="color:var(--text-muted);">All</span>'}</td>
            <td class="action-btns">
                <button class="btn btn-xs" style="background:var(--tertiary);color:var(--text);border:1px solid var(--border);" onclick="showEditRepoModal('${escHtml(r.id)}','${escHtml(r.full_name)}','${escHtml(r.branch || '')}',${r.is_public ? 'true' : 'false'},'${escHtml(r.token_id || '')}')" title="Edit branch">
                    <span class="material-icons" style="font-size:14px;">edit</span>
                </button>
                <button class="btn btn-xs btn-danger" onclick="deleteRepo('${escHtml(r.id)}','${escHtml(r.full_name)}')" title="Remove repo">
                    <span class="material-icons" style="font-size:14px;">delete</span>
                </button>
            </td>
        </tr>`).join('');
    } catch (err) {
        console.error('Load repos error:', err);
    }
}

function showAddTokenModal() {
    document.getElementById('ghTokenName').value = '';
    document.getElementById('ghTokenValue').value = '';
    document.getElementById('ghTokenUser').value = '';
    document.getElementById('addTokenModal').classList.remove('hidden');
}

function closeAddTokenModal() {
    document.getElementById('addTokenModal').classList.add('hidden');
}

async function saveToken() {
    const name = document.getElementById('ghTokenName').value.trim();
    const token = document.getElementById('ghTokenValue').value.trim();
    const githubUser = document.getElementById('ghTokenUser').value.trim();
    if (!name || !token) {
        showToast('Name and token are required', 'warning');
        return;
    }
    try {
        await api('POST', '/github/tokens', { name, token, github_user: githubUser });
        showToast('Token added successfully', 'success');
        closeAddTokenModal();
        loadGitHubTokens();
    } catch (err) {
        showToast('Failed to add token: ' + err.message, 'error');
    }
}

async function testToken(tokenId) {
    showToast('Testing token...', 'info');
    try {
        const result = await api('POST', `/github/tokens/${tokenId}/test`);
        if (result.valid) {
            showToast(`Token valid — @${result.username} (${result.name || 'no name'})`, 'success');
        } else {
            showToast(`Token invalid: ${result.detail || 'Unknown error'}`, 'error');
        }
    } catch (err) {
        showToast('Test failed: ' + err.message, 'error');
    }
}

function deleteToken(tokenId, name) {
    showConfirm(`Delete token "${name}"? This will also remove all repos using this token.`, async () => {
        try {
            await api('DELETE', `/github/tokens/${tokenId}`);
            showToast('Token deleted', 'success');
            loadGitHubTokens();
            loadGitHubRepos();
        } catch (err) {
            showToast('Failed to delete token: ' + err.message, 'error');
        }
    });
}

let _repoMode = 'token'; // 'token' or 'public'
let _publicRepoVerified = null; // cached public repo info

function setRepoMode(mode) {
    _repoMode = mode;
    _publicRepoVerified = null;
    const btnToken = document.getElementById('repoModeToken');
    const btnPublic = document.getElementById('repoModePublic');
    const tokenFields = document.getElementById('repoTokenFields');
    const publicFields = document.getElementById('repoPublicFields');
    const branchSel = document.getElementById('ghBranchSelect');

    if (mode === 'token') {
        btnToken.style.background = 'var(--accent)';
        btnToken.style.color = '#fff';
        btnToken.style.borderColor = 'var(--accent)';
        btnPublic.style.background = 'var(--tertiary)';
        btnPublic.style.color = 'var(--text-muted)';
        btnPublic.style.borderColor = 'var(--border)';
        tokenFields.style.display = '';
        publicFields.style.display = 'none';
    } else {
        btnPublic.style.background = 'var(--accent)';
        btnPublic.style.color = '#fff';
        btnPublic.style.borderColor = 'var(--accent)';
        btnToken.style.background = 'var(--tertiary)';
        btnToken.style.color = 'var(--text-muted)';
        btnToken.style.borderColor = 'var(--border)';
        tokenFields.style.display = 'none';
        publicFields.style.display = '';
    }
    // Reset branch
    branchSel.innerHTML = '<option value="">All branches</option>';
    branchSel.disabled = true;
}

let _publicRepoTimer = null;
async function onPublicRepoInput() {
    const input = document.getElementById('ghPublicRepoInput').value.trim();
    const status = document.getElementById('ghPublicRepoStatus');
    const info = document.getElementById('ghPublicRepoInfo');
    const branchSel = document.getElementById('ghBranchSelect');

    _publicRepoVerified = null;
    branchSel.innerHTML = '<option value="">All branches</option>';
    branchSel.disabled = true;
    info.style.display = 'none';

    if (_publicRepoTimer) clearTimeout(_publicRepoTimer);
    if (!input || input.indexOf('/') === -1 || input.indexOf('/') !== input.lastIndexOf('/')) {
        status.textContent = '';
        return;
    }

    status.textContent = '⏳';
    _publicRepoTimer = setTimeout(async () => {
        try {
            const parts = input.split('/');
            const data = await api('GET', `/github/public/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/info`);
            if (data.private) {
                status.textContent = '🔒';
                info.textContent = 'This is a private repo — use token mode instead.';
                info.style.display = '';
                info.style.color = '#ef4444';
                _publicRepoVerified = null;
                return;
            }
            status.textContent = '✅';
            info.innerHTML = `<span style="color:var(--accent);">${escHtml(data.full_name)}</span> · ⭐ ${data.stars} · default: <b>${escHtml(data.default_branch)}</b>` + (data.description ? ` · ${escHtml(data.description)}` : '');
            info.style.display = '';
            info.style.color = 'var(--text-muted)';
            _publicRepoVerified = data;

            // Load branches
            branchSel.innerHTML = '<option value="">Loading branches...</option>';
            try {
                const branches = await api('GET', `/github/public/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/branches`);
                branchSel.innerHTML = '<option value="">All branches</option>';
                branches.forEach(b => {
                    const marker = b.default ? ' ★' : '';
                    const sel = b.name === data.default_branch ? ' selected' : '';
                    branchSel.innerHTML += `<option value="${escHtml(b.name)}"${sel}>${escHtml(b.name)}${marker}</option>`;
                });
                branchSel.disabled = false;
            } catch (e) {
                branchSel.innerHTML = '<option value="">All branches</option>';
                branchSel.disabled = false;
            }
        } catch (err) {
            status.textContent = '❌';
            info.textContent = 'Repository not found or is private';
            info.style.display = '';
            info.style.color = '#ef4444';
            _publicRepoVerified = null;
        }
    }, 600); // debounce 600ms
}

function showAddRepoModal() {
    // Reset everything
    _repoMode = 'token';
    _publicRepoVerified = null;
    const tokenSel = document.getElementById('ghRepoTokenSelect');
    const repoSel = document.getElementById('ghRepoSelect');
    const branchSel = document.getElementById('ghBranchSelect');
    tokenSel.innerHTML = '<option value="">-- Select a token --</option>';
    repoSel.innerHTML = '<option value="">-- Select a token first --</option>';
    repoSel.disabled = true;
    branchSel.innerHTML = '<option value="">All branches</option>';
    branchSel.disabled = true;
    // Reset public fields
    document.getElementById('ghPublicRepoInput').value = '';
    document.getElementById('ghPublicRepoStatus').textContent = '';
    document.getElementById('ghPublicRepoInfo').style.display = 'none';
    // Populate token dropdown
    _ghTokensCache.forEach(t => {
        tokenSel.innerHTML += `<option value="${escHtml(t.id)}">${escHtml(t.name)} (${escHtml(t.github_user || 'unknown')})</option>`;
    });
    setRepoMode('token');
    document.getElementById('addRepoModal').classList.remove('hidden');
}

function closeAddRepoModal() {
    document.getElementById('addRepoModal').classList.add('hidden');
}

async function onRepoTokenChange() {
    const token_id = document.getElementById('ghRepoTokenSelect').value;
    const repoSel = document.getElementById('ghRepoSelect');
    const branchSel = document.getElementById('ghBranchSelect');
    // Reset downstream
    repoSel.innerHTML = '<option value="">-- Loading repos... --</option>';
    repoSel.disabled = true;
    branchSel.innerHTML = '<option value="">All branches</option>';
    branchSel.disabled = true;
    if (!token_id) {
        repoSel.innerHTML = '<option value="">-- Select a token first --</option>';
        return;
    }
    try {
        const repos = await api('GET', `/github/browse/${token_id}/repos`);
        if (repos.length === 0) {
            repoSel.innerHTML = '<option value="">No repositories found</option>';
            return;
        }
        repoSel.innerHTML = '<option value="">-- Select a repository --</option>';
        repos.forEach(r => {
            const priv = r.private ? ' 🔒' : '';
            repoSel.innerHTML += `<option value="${escHtml(r.full_name)}" data-default-branch="${escHtml(r.default_branch)}">${escHtml(r.full_name)}${priv}</option>`;
        });
        repoSel.disabled = false;
    } catch (err) {
        repoSel.innerHTML = '<option value="">Failed to load repos</option>';
        showToast('Failed to load repos: ' + err.message, 'error');
    }
}

async function onRepoSelectChange() {
    const token_id = document.getElementById('ghRepoTokenSelect').value;
    const repoSel = document.getElementById('ghRepoSelect');
    const branchSel = document.getElementById('ghBranchSelect');
    const full_name = repoSel.value;
    // Reset branch
    branchSel.innerHTML = '<option value="">Loading branches...</option>';
    branchSel.disabled = true;
    if (!full_name) {
        branchSel.innerHTML = '<option value="">All branches</option>';
        return;
    }
    // Get default branch from data attribute of selected option
    const selectedOpt = repoSel.options[repoSel.selectedIndex];
    const defaultBranch = selectedOpt ? selectedOpt.getAttribute('data-default-branch') : '';
    try {
        const branches = await api('GET', `/github/browse/${token_id}/repos/${encodeURIComponent(full_name)}/branches`);
        branchSel.innerHTML = '<option value="">All branches</option>';
        branches.forEach(b => {
            const marker = b.default || b.name === defaultBranch ? ' ★' : '';
            branchSel.innerHTML += `<option value="${escHtml(b.name)}"${b.name === defaultBranch ? ' selected' : ''}>${escHtml(b.name)}${marker}</option>`;
        });
        branchSel.disabled = false;
    } catch (err) {
        branchSel.innerHTML = '<option value="">All branches</option><option value="__manual">Type manually...</option>';
        branchSel.disabled = false;
        // Fallback: if branches fail (e.g. repo too large), user can still use "All branches"
    }
}

async function saveRepo() {
    const branch = document.getElementById('ghBranchSelect').value;

    if (_repoMode === 'public') {
        const full_name = document.getElementById('ghPublicRepoInput').value.trim();
        if (!full_name) {
            showToast('Please enter a repository name (owner/repo)', 'warning');
            return;
        }
        if (!_publicRepoVerified) {
            showToast('Please wait for repository verification', 'warning');
            return;
        }
        try {
            await api('POST', '/github/repos', { full_name, branch: branch || undefined, is_public: true });
            showToast('Public repository tracked successfully', 'success');
            closeAddRepoModal();
            loadGitHubRepos();
        } catch (err) {
            showToast('Failed to track repo: ' + err.message, 'error');
        }
        return;
    }

    // Token mode
    const token_id = document.getElementById('ghRepoTokenSelect').value;
    const full_name = document.getElementById('ghRepoSelect').value;
    if (!token_id) {
        showToast('Please select a token', 'warning');
        return;
    }
    if (!full_name) {
        showToast('Please select a repository', 'warning');
        return;
    }
    try {
        await api('POST', '/github/repos', { full_name, token_id, branch: branch || undefined });
        showToast('Repository tracked successfully', 'success');
        closeAddRepoModal();
        loadGitHubRepos();
    } catch (err) {
        showToast('Failed to track repo: ' + err.message, 'error');
    }
}

// ─── Edit Repo Branch ────────────────────────────────────────

let _editRepoId = null;
let _editRepoIsPublic = false;
let _editRepoTokenId = null;

function closeEditRepoModal() {
    document.getElementById('editRepoModal').classList.add('hidden');
    _editRepoId = null;
}

async function showEditRepoModal(repoId, fullName, currentBranch, isPublic, tokenId) {
    _editRepoId = repoId;
    _editRepoIsPublic = isPublic;
    _editRepoTokenId = tokenId || null;

    document.getElementById('editRepoName').textContent = fullName;
    const branchSel = document.getElementById('editRepoBranchSelect');
    branchSel.innerHTML = '<option value="">Loading branches...</option>';
    branchSel.disabled = true;
    document.getElementById('editRepoModal').classList.remove('hidden');

    // Load branches
    const parts = fullName.split('/');
    try {
        let branches;
        if (isPublic && !tokenId) {
            branches = await api('GET', `/github/public/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/branches`);
        } else {
            branches = await api('GET', `/github/browse/${tokenId}/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/branches`);
        }
        branchSel.innerHTML = '<option value="">All branches</option>';
        branches.forEach(b => {
            const marker = b.default ? ' ★' : '';
            const sel = b.name === currentBranch ? ' selected' : '';
            branchSel.innerHTML += `<option value="${escHtml(b.name)}"${sel}>${escHtml(b.name)}${marker}</option>`;
        });
        if (!currentBranch) branchSel.value = '';
        branchSel.disabled = false;
    } catch (err) {
        branchSel.innerHTML = '<option value="">All branches</option>';
        branchSel.disabled = false;
        console.error('Load branches for edit:', err);
    }
}

async function saveEditRepo() {
    if (!_editRepoId) return;
    const branch = document.getElementById('editRepoBranchSelect').value;
    try {
        await api('PATCH', `/github/repos/${_editRepoId}`, { branch: branch || null });
        showToast('Branch updated', 'success');
        closeEditRepoModal();
        loadGitHubRepos();
    } catch (err) {
        showToast('Failed to update branch: ' + err.message, 'error');
    }
}

function deleteRepo(repoId, name) {
    showConfirm(`Remove "${name}" from tracking?`, async () => {
        try {
            await api('DELETE', `/github/repos/${repoId}`);
            showToast('Repository removed', 'success');
            loadGitHubRepos();
        } catch (err) {
            showToast('Failed to remove repo: ' + err.message, 'error');
        }
    });
}

function refreshGitHubActions() {
    loadGitHubActions();
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ═══════════════════════════════════════════════════════════
// ─── Cost Tracking (Admin Only) ──────────────────────────

// ═══ Password Toggle ═══
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const icon = btn.querySelector('.material-icons');
    if (icon) icon.textContent = isPassword ? 'visibility' : 'visibility_off';
}

// ═══ Theme Toggle ═══
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = next === 'dark' ? 'dark_mode' : 'light_mode';
    localStorage.setItem('serversphere-theme', next);
}

// Load saved theme on startup
(function initTheme() {
    const saved = localStorage.getItem('serversphere-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = saved === 'dark' ? 'dark_mode' : 'light_mode';
})();

// ─── Init ───────────────────────────────────────────────────
checkAuth();
