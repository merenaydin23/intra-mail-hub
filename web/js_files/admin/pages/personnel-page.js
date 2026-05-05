import { getAllUsers, removeUserRecord } from "../services/user-service.js";
import { renderTableRows } from "../ui/renderers.js";
import { getSessionActor } from "../auth/session-service.js";
import { writeAuditLog } from "../services/audit-service.js";

let allUsers = [];

const state = {
    search: '', category: 'all', role: 'all',
    region: 'all', city: 'all', dealer: 'all', sort: 'name-asc',
};

export async function initPersonnelPage() {
    const users = await getAllUsers();
    allUsers = users.filter(u => u.role !== 'admin');
    setupListeners();
    applyFilters();
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

    // Gelişmiş filtreleri aç/kapat
    document.getElementById('btnToggleAdvanced')?.addEventListener('click', () => {
        const panel = document.getElementById('advancedFilters');
        const btn = document.getElementById('btnToggleAdvanced');
        const isShow = panel?.classList.toggle('show');
        btn?.classList.toggle('active', isShow);
        
        // Panel kapandığında içindeki özel filtreleri de sıfırlayabiliriz (isteğe bağlı)
        // ama kullanıcı deneyimi açısından açık kalması daha iyi olabilir.
    });

    document.getElementById('userTableBody')?.addEventListener('click', handleTableClick);
}

function bind(id, event, stateKey, prop) {
    document.getElementById(id)?.addEventListener(event, e => {
        state[stateKey] = e.target[prop];
        applyFilters();
    });
}

// ── Dinamik Dropdownlar ───────────────────────────────────
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

// ── Filtreleme ────────────────────────────────────────────
function applyFilters() {
    const term = state.search.toLocaleLowerCase('tr-TR');

    let filtered = allUsers.filter(u => {
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

    if (state.sort === 'name-asc')  filtered.sort((a,b) => (a.name||'').localeCompare(b.name||'','tr'));
    if (state.sort === 'name-desc') filtered.sort((a,b) => (b.name||'').localeCompare(a.name||'','tr'));

    renderTableRows(document.getElementById('userTableBody'), filtered);
    document.getElementById('totalPersonnelCount').textContent = filtered.length;

    // Sıfırla butonunu kırmızı yap
    const hasFilter = Object.entries(state).some(([k,v]) => k !== 'sort' && (v !== 'all' && v !== ''));
    document.getElementById('btnResetFilters')?.classList.toggle('has-filter', hasFilter);

    renderChips();
}

// ── Chips ─────────────────────────────────────────────────
const CHIP_LABELS = {
    search:   v => `"${v}"`,
    category: v => ({ factory:'Fabrika', regional:'Bölge Bayisi', local:'Yerel Bayi' }[v] || v),
    role:     v => v === 'manager' ? 'Patron/Müdür' : 'Çalışan',
    region:   v => v,
    city:     v => v,
    dealer:   v => v,
};
const CHIP_ICONS = { search:'fa-magnifying-glass', category:'fa-sitemap', role:'fa-user-shield', region:'fa-map', city:'fa-city', dealer:'fa-store' };

function renderChips() {
    const container = document.getElementById('activeChips');
    if (!container) return;
    const chips = Object.entries(state)
        .filter(([k,v]) => k !== 'sort' && v !== 'all' && v !== '')
        .map(([k,v]) => `<span class="chip" data-key="${k}"><i class="fa-solid ${CHIP_ICONS[k]}"></i> ${CHIP_LABELS[k](v)} <i class="fa-solid fa-xmark"></i></span>`);

    container.innerHTML = chips.join('');
    container.querySelectorAll('.chip').forEach(c => {
        c.addEventListener('click', () => {
            const k = c.dataset.key;
            state[k] = k === 'search' ? '' : 'all';
            if (k === 'region') { state.city='all'; state.dealer='all'; refreshCities(); refreshDealers(); }
            if (k === 'city')   { state.dealer='all'; refreshDealers(); }
            syncUI();
            applyFilters();
        });
    });
}

// ── Reset ─────────────────────────────────────────────────
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

// ── Tablo Etkileşimleri ───────────────────────────────────
async function handleTableClick(event) {
    const row = event.target.closest('.personnel-main-row');
    if (row) {
        const id = row.dataset.userId;
        const detail = document.querySelector(`.personnel-detail-row[data-detail-id="${id}"]`);
        const chevron = row.querySelector('.detail-chevron');
        if (detail) {
            const open = !detail.hasAttribute('hidden');
            detail.toggleAttribute('hidden', open);
            chevron?.classList.toggle('is-open', !open);
        }
        return;
    }

    const btn = event.target.closest("[data-action='delete-user']");
    if (!btn) return;
    const userId = btn.dataset.userId;
    const user = allUsers.find(x => x.id === userId);
    if (!user || !confirm(`${user.name} ${user.surname} silinsin mi?`)) return;

    try {
        await removeUserRecord(userId);
        const actor = await getSessionActor();
        await writeAuditLog({ actor, action:'PERSONEL_SILME', targetType:'users', targetId:userId, detail:`${user.name} ${user.surname} silindi.` });
        allUsers = allUsers.filter(x => x.id !== userId);
        applyFilters();
        alert('Personel silindi.');
    } catch { alert('Hata: Kayıt silinemedi.'); }
}
