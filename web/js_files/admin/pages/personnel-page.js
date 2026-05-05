import { removeUserRecord, updateUserStatus } from "../services/user-service.js";
import { renderTableRows } from "../ui/renderers.js";
import { getSessionActor } from "../auth/session-service.js";
import { writeAuditLog } from "../services/audit-service.js";
import { collection, query, onSnapshot, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

let allUsers = [];

const state = {
    search: '', category: 'all', role: 'all',
    region: 'all', city: 'all', dealer: 'all', sort: 'name-asc',
};

export async function initPersonnelPage() {
    setupRealtimeListener();
    setupListeners();
}

/**
 * FIREBASE REAL-TIME LISTENER
 */
function setupRealtimeListener() {
    const q = query(collection(db, "users"), where("role", "!=", "admin"));
    
    // Unsubscribe previous if any (though not strictly needed here)
    onSnapshot(q, (snapshot) => {
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFilters();
    }, (error) => {
        console.error("Firestore Listener Error:", error);
    });
}

// ── Event Listeners ──────────────────────────────────────
function setupListeners() {
    bind('searchUser',    'input',  'search',   'value');
    bind('filterCategory','change', 'category', 'value');
    bind('filterRole',    'change', 'role',     'value');
    bind('sortUser',      'change', 'sort',     'value');

    document.getElementById('filterRegion')?.addEventListener('change', e => {
        state.region = e.target.value;
        state.city   = 'all';
        state.dealer = 'all';
        refreshCities();
        refreshDealers();
        applyFilters();
    });

    document.getElementById('filterCity')?.addEventListener('change', e => {
        state.city   = e.target.value;
        state.dealer = 'all';
        refreshDealers();
        applyFilters();
    });

    document.getElementById('filterDealer')?.addEventListener('change', e => {
        state.dealer = e.target.value;
        applyFilters();
    });

    document.getElementById('btnResetFilters')?.addEventListener('click', resetAll);

    document.getElementById('btnToggleAdvanced')?.addEventListener('click', () => {
        const panel = document.getElementById('advancedFilters');
        const btn = document.getElementById('btnToggleAdvanced');
        const isShow = panel?.classList.toggle('show');
        btn?.classList.toggle('active', isShow);
    });

    document.getElementById('userTableBody')?.addEventListener('click', handleTableClick);
    document.getElementById('passiveUserList')?.addEventListener('click', handleTableClick); // Side panel click support
    document.getElementById('btnCloseDrawer')?.addEventListener('click', closeDrawer);
    document.getElementById('userDrawerOverlay')?.addEventListener('click', closeDrawer);
}

function closeDrawer() {
    const drawer = document.getElementById('userDrawer');
    if (drawer) drawer.style.right = '-450px';
    const overlay = document.getElementById('userDrawerOverlay');
    if (overlay) overlay.style.display = 'none';
}

function openDrawer(user) {
    const drawer = document.getElementById('userDrawer');
    const overlay = document.getElementById('userDrawerOverlay');

    const fullName = `${user.name} ${user.surname || ''}`;
    document.getElementById('drawName').textContent = fullName;
    document.getElementById('drawAvatar').textContent = fullName.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
    document.getElementById('drawEmail').textContent = user.email || '-';
    document.getElementById('drawPhone').textContent = user.phone || '-';
    document.getElementById('drawCategory').textContent = { factory:'Fabrika', regional:'Bölge Bayisi', local:'Yerel Bayi' }[user.category] || user.category;
    document.getElementById('drawCompany').textContent = user.company || 'Bellona Merkez';
    document.getElementById('drawSubRole').textContent = user.subRole === 'manager' ? 'Yönetici / Patron' : 'Personel';
    document.getElementById('drawLocation').textContent = `${user.region || '-'} / ${user.city || '-'}`;
    document.getElementById('drawBirthDate').textContent = user.birthDate || '-';

    const statusEl = document.getElementById('drawStatus');
    const isActive = user.isActive !== false;
    statusEl.textContent = isActive ? 'AKTİF' : 'PASİF';
    statusEl.style.background = isActive ? '#ecfdf5' : '#fef2f2';
    statusEl.style.color = isActive ? '#059669' : '#dc2626';

    const btnToggle = document.getElementById('btnToggleStatus');
    btnToggle.innerHTML = isActive ? '<i class="fa-solid fa-ban"></i> Pasife Al' : '<i class="fa-solid fa-check-circle"></i> Aktif Et';
    btnToggle.onclick = () => toggleUserStatus(user.id, !isActive);

    const btnDelete = document.getElementById('btnEditUser');
    btnDelete.innerHTML = '<i class="fa-solid fa-trash"></i> Kaydı Sil';
    btnDelete.style.color = '#ef4444';
    btnDelete.onclick = () => deleteUser(user.id);

    overlay.style.display = 'block';
    setTimeout(() => { drawer.style.right = '0'; }, 10);
}

async function toggleUserStatus(userId, newStatus) {
    const user = allUsers.find(x => x.id === userId);
    if (!user) return;

    try {
        await updateUserStatus(userId, newStatus);
        const actor = await getSessionActor();
        await writeAuditLog({ 
            actor, 
            action: newStatus ? 'PERSONEL_AKTIF_ETME' : 'PERSONEL_PASIFE_ALMA', 
            targetType:'users', 
            targetId:userId, 
            detail:`${user.name} ${user.surname} durumu ${newStatus ? 'Aktif' : 'Pasif'} olarak güncellendi.` 
        });
        // We don't need to manually update user.isActive here because the Realtime Listener will catch it
        closeDrawer();
    } catch (err) {
        alert('Hata: Durum güncellenemedi.');
    }
}

async function deleteUser(userId) {
    const user = allUsers.find(x => x.id === userId);
    if (!user || !confirm(`${user.name} ${user.surname} silinsin mi?`)) return;

    try {
        await removeUserRecord(userId);
        const actor = await getSessionActor();
        await writeAuditLog({ actor, action:'PERSONEL_SILME', targetType:'users', targetId:userId, detail:`${user.name} ${user.surname} silindi.` });
        closeDrawer();
    } catch { alert('Hata: Kayıt silinemedi.'); }
}

function bind(id, event, stateKey, prop) {
    document.getElementById(id)?.addEventListener(event, e => {
        state[stateKey] = e.target[prop];
        applyFilters();
    });
}

function refreshCities() {
    const el = document.getElementById('filterCity');
    if (!el) return;
    if (state.region === 'all') {
        el.innerHTML = '<option value="all">Önce bölge seçin</option>';
        el.disabled = true; return;
    }
    const cities = unique(allUsers.filter(u => u.region === state.region).map(u => u.city)).filter(Boolean).sort((a,b)=>a.localeCompare(b,'tr'));
    el.innerHTML = `<option value="all">Tüm Şehirler (${cities.length})</option>` + cities.map(c=>`<option value="${c}">${c}</option>`).join('');
    el.disabled = false;
    el.value = 'all';
}

function refreshDealers() {
    const el = document.getElementById('filterDealer');
    if (!el) return;
    if (state.city === 'all') {
        el.innerHTML = '<option value="all">Önce şehir seçin</option>';
        el.disabled = true; return;
    }
    const dealerMap = new Map();
    allUsers.filter(u => u.city === state.city && u.category === 'local' && u.company).forEach(u => {
        dealerMap.set(u.company, u.dealerCode || '0000');
    });
    const dealers = Array.from(dealerMap.keys()).sort((a,b)=>a.localeCompare(b,'tr'));
    
    if (!dealers.length) {
        el.innerHTML = '<option value="all">Kayıtlı bayi yok</option>';
        el.disabled = true; return;
    }
    el.innerHTML = `<option value="all">Tüm Bayiler (${dealers.length})</option>` + dealers.map(d=>`<option value="${d}">${d} — #${dealerMap.get(d)}</option>`).join('');
    el.disabled = false;
    el.value = 'all';
}

function unique(arr) { return [...new Set(arr)]; }

function applyFilters() {
    const term = state.search.toLocaleLowerCase('tr-TR');

    // 1. Split Active and Passive
    const activePool = allUsers.filter(u => u.isActive !== false);
    const passivePool = allUsers.filter(u => u.isActive === false);

    // 2. Filter Active List
    let filteredActive = activePool.filter(u => {
        const txt = `${u.name} ${u.surname} ${u.company} ${u.dealerCode} ${u.email}`.toLocaleLowerCase('tr-TR');
        return (
            (!term || txt.includes(term)) &&
            (state.category === 'all' || u.category === state.category) &&
            (state.role     === 'all' || u.subRole  === state.role) &&
            (state.region   === 'all' || u.region   === state.region) &&
            (state.city     === 'all' || u.city     === state.city) &&
            (state.dealer   === 'all' || u.company  === state.dealer)
        );
    });

    if (state.sort === 'name-asc')  filteredActive.sort((a,b) => (a.name||'').localeCompare(b.name||'','tr'));
    if (state.sort === 'name-desc') filteredActive.sort((a,b) => (b.name||'').localeCompare(a.name||'','tr'));

    renderTableRows(document.getElementById('userTableBody'), filteredActive);
    document.getElementById('totalPersonnelCount').textContent = filteredActive.length;

    // 3. Render Passive List (Always Updated Real-time)
    renderPassiveList(passivePool);

    const hasFilter = Object.entries(state).some(([k,v]) => k !== 'sort' && (v !== 'all' && v !== ''));
    document.getElementById('btnResetFilters')?.classList.toggle('has-filter', hasFilter);
}

function renderPassiveList(users) {
    const container = document.getElementById('passiveUserList');
    const badge = document.getElementById('passiveCountBadge');
    if (!container || !badge) return;

    badge.textContent = users.length;

    if (!users.length) {
        container.innerHTML = '<div class="side-empty-state">Pasif personel yok.</div>';
        return;
    }

    container.innerHTML = users.map(u => `
        <div class="side-user-item personnel-main-row" data-user-id="${u.id}">
            <div class="side-user-name">${u.name} ${u.surname}</div>
            <div class="side-user-meta">${u.company || 'Birim Yok'} · ${u.city || '-'}</div>
        </div>
    `).join('');
}

function resetAll() {
    Object.assign(state, { search:'', category:'all', role:'all', region:'all', city:'all', dealer:'all', sort:'name-asc' });
    refreshCities();
    refreshDealers();
    syncUI();
    applyFilters();
}

function syncUI() {
    const map = { searchUser:'search', filterCategory:'category', filterRole:'role', filterRegion:'region', filterCity:'city', filterDealer:'dealer', sortUser:'sort' };
    for (const [id, key] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) el.value = state[key];
    }
}

function handleTableClick(event) {
    const row = event.target.closest('.personnel-main-row');
    if (row) {
        const id = row.dataset.userId;
        const user = allUsers.find(u => u.id === id);
        if (user) openDrawer(user);
    }
}
