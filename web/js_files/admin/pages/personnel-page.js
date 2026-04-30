import { getAllUsers, removeUserRecord } from "../services/user-service.js";
import { renderTableRows } from "../ui/renderers.js";
import { getSessionActor } from "../auth/session-service.js";
import { writeAuditLog } from "../services/audit-service.js";

let allUsers = [];

// ── Filtre State ──────────────────────────────────────────
const state = {
    search: '',
    category: 'all',
    role: 'all',
    region: 'all',
    city: 'all',
    dealer: 'all',
    letter: 'all',
    sort: 'name-asc',
};

export async function initPersonnelPage() {
    const users = await getAllUsers();
    allUsers = users.filter(u => u.role !== 'admin');

    buildAlphabet();
    setupListeners();
    applyFilters();
}

// ── Alfabe ───────────────────────────────────────────────
function buildAlphabet() {
    const container = document.getElementById('alphabetFilter');
    if (!container) return;
    const letters = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.split('');
    letters.forEach(l => {
        const btn = document.createElement('button');
        btn.className = 'alpha-btn';
        btn.textContent = l;
        btn.dataset.letter = l;
        container.appendChild(btn);
    });

    container.addEventListener('click', e => {
        const btn = e.target.closest('.alpha-btn');
        if (!btn) return;
        container.querySelectorAll('.alpha-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.letter = btn.dataset.letter;
        applyFilters();
    });
}

// ── Event Listeners ──────────────────────────────────────
function setupListeners() {
    // Temel filtreler
    document.getElementById('searchUser')?.addEventListener('input', e => { state.search = e.target.value; applyFilters(); });
    document.getElementById('filterCategory')?.addEventListener('change', e => { state.category = e.target.value; applyFilters(); });
    document.getElementById('filterRole')?.addEventListener('change', e => { state.role = e.target.value; applyFilters(); });
    document.getElementById('sortUser')?.addEventListener('change', e => { state.sort = e.target.value; applyFilters(); });

    // Bölge seçimi → Şehir listesini güncelle
    document.getElementById('filterRegion')?.addEventListener('change', e => {
        state.region = e.target.value;
        state.city = 'all';
        state.dealer = 'all';
        updateCityDropdown();
        updateDealerDropdown();
        applyFilters();
    });

    // Şehir seçimi → Bayi listesini güncelle
    document.getElementById('filterCity')?.addEventListener('change', e => {
        state.city = e.target.value;
        state.dealer = 'all';
        updateDealerDropdown();
        applyFilters();
    });

    // Bayi seçimi
    document.getElementById('filterDealer')?.addEventListener('change', e => {
        state.dealer = e.target.value;
        applyFilters();
    });

    // Sıfırla butonu
    document.getElementById('btnResetFilters')?.addEventListener('click', resetFilters);

    // Tablo satır click ve silme
    document.getElementById('userTableBody')?.addEventListener('click', async event => {
        const clickedRow = event.target.closest('.personnel-main-row');
        if (clickedRow) {
            const userId = clickedRow.getAttribute('data-user-id');
            const detailRow = document.querySelector(`.personnel-detail-row[data-detail-id="${userId}"]`);
            const chevron = clickedRow.querySelector('.detail-chevron');
            if (detailRow) {
                const isOpen = !detailRow.hasAttribute('hidden');
                detailRow.toggleAttribute('hidden', isOpen);
                chevron?.classList.toggle('is-open', !isOpen);
            }
            return;
        }

        const btn = event.target.closest("[data-action='delete-user']");
        if (btn) {
            const userId = btn.getAttribute('data-user-id');
            const user = allUsers.find(x => x.id === userId);
            if (!user || !confirm(`${user.name} ${user.surname} kaydı silinsin mi?`)) return;
            try {
                await removeUserRecord(userId);
                const actor = await getSessionActor();
                await writeAuditLog({ actor, action: 'PERSONEL_SILME', targetType: 'users', targetId: userId, detail: `${user.name} ${user.surname} kaydı silindi.` });
                allUsers = allUsers.filter(x => x.id !== userId);
                applyFilters();
                alert('Personel başarıyla silindi.');
            } catch (err) {
                console.error('Silme hatası:', err);
                alert('Hata: Kayıt silinemedi.');
            }
        }
    });
}

// ── Dinamik Dropdown Güncellemeleri ──────────────────────
function updateCityDropdown() {
    const citySelect = document.getElementById('filterCity');
    if (!citySelect) return;

    if (state.region === 'all') {
        citySelect.innerHTML = '<option value="all">Önce bölge seçin</option>';
        citySelect.disabled = true;
        return;
    }

    // O bölgedeki benzersiz şehirleri al
    const cities = [...new Set(
        allUsers
            .filter(u => u.region === state.region && u.city)
            .map(u => u.city)
    )].sort((a, b) => a.localeCompare(b, 'tr-TR'));

    citySelect.innerHTML = `<option value="all">Tüm Şehirler (${cities.length})</option>`;
    cities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        citySelect.appendChild(opt);
    });
    citySelect.disabled = false;
    citySelect.value = 'all';
}

function updateDealerDropdown() {
    const dealerSelect = document.getElementById('filterDealer');
    if (!dealerSelect) return;

    if (state.city === 'all') {
        dealerSelect.innerHTML = '<option value="all">Önce şehir seçin</option>';
        dealerSelect.disabled = true;
        return;
    }

    // O şehirdeki benzersiz bayileri al
    const dealers = [...new Map(
        allUsers
            .filter(u => u.city === state.city && u.company && u.category === 'local')
            .map(u => [u.company, { name: u.company, code: u.dealerCode || '0000' }])
    ).values()].sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));

    if (dealers.length === 0) {
        dealerSelect.innerHTML = '<option value="all">Bu şehirde kayıtlı bayi yok</option>';
        dealerSelect.disabled = true;
        return;
    }

    dealerSelect.innerHTML = `<option value="all">Tüm Bayiler (${dealers.length})</option>`;
    dealers.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.name;
        opt.textContent = `${d.name}  —  #${d.code}`;
        dealerSelect.appendChild(opt);
    });
    dealerSelect.disabled = false;
    dealerSelect.value = 'all';
}

// ── Filtreleme Motoru ─────────────────────────────────────
function applyFilters() {
    const term = state.search.toLocaleLowerCase('tr-TR');

    let filtered = allUsers.filter(u => {
        const fullText = `${u.name} ${u.surname} ${u.company} ${u.dealerCode} ${u.email}`.toLocaleLowerCase('tr-TR');
        const firstChar = (u.name || '').charAt(0).toLocaleUpperCase('tr-TR');

        return (
            (term === '' || fullText.includes(term)) &&
            (state.category === 'all' || u.category === state.category) &&
            (state.role === 'all' || u.subRole === state.role) &&
            (state.region === 'all' || u.region === state.region) &&
            (state.city === 'all' || u.city === state.city) &&
            (state.dealer === 'all' || u.company === state.dealer) &&
            (state.letter === 'all' || firstChar === state.letter)
        );
    });

    // Sıralama
    if (state.sort === 'name-asc') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
    else if (state.sort === 'name-desc') filtered.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'tr'));

    // Sonuçları render et
    const tbody = document.getElementById('userTableBody');
    renderTableRows(tbody, filtered);

    // Sayac
    const countEl = document.getElementById('totalPersonnelCount');
    if (countEl) countEl.textContent = filtered.length;

    // Aktif chip'leri güncelle
    renderChips();

    // Özet
    const summaryEl = document.getElementById('filterSummary');
    const activeCount = Object.entries(state).filter(([k, v]) => k !== 'sort' && v !== 'all' && v !== '').length;
    if (summaryEl) summaryEl.textContent = activeCount > 0 ? `${activeCount} aktif filtre` : '';
}

// ── Aktif Filtre Chips ─────────────────────────────────────
function renderChips() {
    const container = document.getElementById('activeChips');
    if (!container) return;

    const chips = [];
    if (state.search) chips.push({ label: `"${state.search}"`, key: 'search', icon: 'fa-magnifying-glass' });
    if (state.category !== 'all') chips.push({ label: { factory: 'Fabrika', regional: 'Bölge Bayisi', local: 'Yerel Bayi' }[state.category], key: 'category', icon: 'fa-sitemap' });
    if (state.role !== 'all') chips.push({ label: state.role === 'manager' ? 'Patron/Müdür' : 'Çalışan', key: 'role', icon: 'fa-user-shield' });
    if (state.region !== 'all') chips.push({ label: state.region, key: 'region', icon: 'fa-map' });
    if (state.city !== 'all') chips.push({ label: state.city, key: 'city', icon: 'fa-city' });
    if (state.dealer !== 'all') chips.push({ label: state.dealer, key: 'dealer', icon: 'fa-store' });
    if (state.letter !== 'all') chips.push({ label: `"${state.letter}" ile başlayanlar`, key: 'letter', icon: 'fa-font' });

    container.innerHTML = chips.map(c => `
        <span class="filter-chip" data-chip-key="${c.key}">
            <i class="fa-solid ${c.icon}"></i> ${c.label}
            <i class="fa-solid fa-xmark"></i>
        </span>`
    ).join('');

    container.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const key = chip.dataset.chipKey;
            clearFilter(key);
        });
    });
}

function clearFilter(key) {
    state[key] = key === 'search' ? '' : 'all';

    // Bağımlılıkları temizle
    if (key === 'region') { state.city = 'all'; state.dealer = 'all'; updateCityDropdown(); updateDealerDropdown(); }
    if (key === 'city') { state.dealer = 'all'; updateDealerDropdown(); }

    // UI'yi senkronize et
    syncSelectsToState();
    applyFilters();
}

function resetFilters() {
    Object.assign(state, { search: '', category: 'all', role: 'all', region: 'all', city: 'all', dealer: 'all', letter: 'all', sort: 'name-asc' });
    syncSelectsToState();
    updateCityDropdown();
    updateDealerDropdown();

    // Alfabe sıfırla
    document.querySelectorAll('.alpha-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.alpha-btn[data-letter="all"]')?.classList.add('active');

    applyFilters();
}

function syncSelectsToState() {
    const ids = { searchUser: 'search', filterCategory: 'category', filterRole: 'role', filterRegion: 'region', filterCity: 'city', filterDealer: 'dealer', sortUser: 'sort' };
    for (const [id, key] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.tagName === 'INPUT') el.value = state[key];
        else el.value = state[key];
    }
}
