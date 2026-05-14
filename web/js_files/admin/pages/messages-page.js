import { sendBroadcast, sendDirectMessage } from "../services/broadcast-service.js";
import { refineMessageWithAI } from "../../services/ai-service.js";
import { showToast } from "../ui/notifications.js";
import { getSessionActor } from "../auth/session-service.js";
import { renderMessageFeed } from "../ui/renderers.js";
import { writeAuditLog } from "../services/audit-service.js";
import { getUserById, getAllUsers } from "../services/user-service.js";
import { uploadAttachment } from "../../services/storage-service.js";
import { collection, orderBy, query, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

let allMessages = [];
let activeFilter = 'all';
let activeTab = 'today'; // 'today' | 'archive'
let selectedArchiveDay = null;

export async function initMessagesPage() {
    initBroadcast();
    setupRealtimeMessages();
    setupFilterTabs();
    setupTabSwitching();
    setupMessageClickHandler();
    setupExportBtn();
}

// ── TAB SWITCHING ──────────────────────────────────────────────
function setupTabSwitching() {
    document.querySelectorAll('.hub-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.hub-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTab = btn.dataset.tab;

            const todayPanel = document.getElementById('todayPanel');
            const archivePanel = document.getElementById('archivePanel');

            if (activeTab === 'today') {
                if (todayPanel) todayPanel.style.display = 'flex';
                if (archivePanel) archivePanel.style.display = 'none';
                applyFilter();
            } else {
                if (todayPanel) todayPanel.style.display = 'none';
                if (archivePanel) archivePanel.style.display = 'flex';
                
                // Reset views
                const daysView = document.getElementById('archiveDaysView');
                const msgsView = document.getElementById('archiveMsgsView');
                if (daysView && msgsView) {
                    daysView.style.transform = 'translateX(0)';
                    msgsView.style.transform = 'translateX(100%)';
                }
                
                renderArchiveDays();
            }
        });
    });

    const btnBack = document.getElementById('btnArchiveBack');
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            const daysView = document.getElementById('archiveDaysView');
            const msgsView = document.getElementById('archiveMsgsView');
            if (daysView && msgsView) {
                daysView.style.transform = 'translateX(0)';
                msgsView.style.transform = 'translateX(100%)';
            }
        });
    }
}

// ── TYPE FILTER BUTTONS ────────────────────────────────────────
function setupFilterTabs() {
    document.querySelectorAll('.msg-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.msg-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter || 'all';
            applyFilter();
        });
    });

    const searchEl = document.getElementById('msgSearch');
    if (searchEl) searchEl.addEventListener('input', () => applyFilter());
}

// ── REALTIME LISTENER ──────────────────────────────────────────
let snapshotTimeout = null;
function setupRealtimeMessages() {
    // Arşiv ve güncel mesajlar için limiti artırdık (2000 mesaj)
    const q = query(collection(db, "messages"), orderBy("timestamp", "desc"), limit(2000));
    onSnapshot(q, (snapshot) => {
        // Debounce: Veri bombardımanında arayüzü koru
        if (snapshotTimeout) clearTimeout(snapshotTimeout);
        
        snapshotTimeout = setTimeout(() => {
            allMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Veri geldiğinde hangi tab açıksa ona göre render yap
            if (activeTab === 'today') applyFilter();
            else renderArchiveDays();
            
            updateCountBadges();
            computeAnalytics();
            console.log(`Realtime feed sync: ${allMessages.length} messages.`);
        }, 300);
    });
}

// ── TODAY FILTER ───────────────────────────────────────────────
function applyFilter() {
    const today = new Date().toDateString();
    const searchTerm = (document.getElementById('msgSearch')?.value || '').toLocaleLowerCase('tr-TR');

    // Only today's messages
    let filtered = allMessages.filter(m => {
        const ts = m.timestamp?.toDate ? m.timestamp.toDate() : null;
        return ts && ts.toDateString() === today;
    });

    if (activeFilter === 'birthday') {
        filtered = filtered.filter(m => m.type === 'birthday_manual' || m.type === 'birthday_auto');
    } else if (activeFilter === 'broadcast') {
        filtered = filtered.filter(m => m.type === 'broadcast' || m.isBroadcast);
    } else if (activeFilter === 'direct') {
        filtered = filtered.filter(m => !m.type || m.type === 'direct');
    }

    if (searchTerm) {
        filtered = filtered.filter(m => {
            const h = `${m.subject} ${m.senderName} ${m.receiverName} ${m.content}`.toLocaleLowerCase('tr-TR');
            return h.includes(searchTerm);
        });
    }

    const listBody = document.getElementById('msgListBody');
    if (listBody) renderMessageFeed(listBody, filtered);
    updateCountBadges();
}

// ── ARCHIVE: GROUP BY DAY ──────────────────────────────────────
function renderArchiveDays() {
    const today = new Date().toDateString();

    const archived = allMessages.filter(m => {
        const ts = m.timestamp?.toDate ? m.timestamp.toDate() : null;
        return ts && ts.toDateString() !== today;
    });

    const groups = {};
    archived.forEach(m => {
        const d = m.timestamp.toDate();
        const key = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (!groups[key]) groups[key] = { date: d, msgs: [] };
        groups[key].msgs.push(m);
    });

    const sortedDays = Object.entries(groups).sort((a, b) => b[1].date - a[1].date);
    const dayList = document.getElementById('archiveDayList');
    const dayCountEl = document.getElementById('archiveDayCount');
    if (dayCountEl) dayCountEl.textContent = sortedDays.length;

    if (!dayList) return;

    if (!sortedDays.length) {
        dayList.innerHTML = '<div style="padding:3rem 1rem; text-align:center; color:var(--text-light); font-size:0.85rem;"><i class="fa-solid fa-box-open" style="font-size:2rem; opacity:0.2; display:block; margin-bottom:1rem;"></i>Arşivde mesaj yok.</div>';
        return;
    }

    const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

    dayList.innerHTML = sortedDays.map(([dateStr, { date, msgs }]) => {
        const dayName = dayNames[date.getDay()];
        const monthDay = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
        return `
        <div class="arch-day-item" data-day="${dateStr}" onclick="window.__selectArchiveDay('${dateStr}')">
            <div class="arch-day-cal">
                <span class="arch-day-num">${date.getDate()}</span>
                <span class="arch-day-mon">${date.toLocaleDateString('tr-TR', { month: 'short' })}</span>
            </div>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:0.85rem; color:var(--brand-ink);">${dayName}</div>
                <div style="font-size:0.72rem; color:var(--text-muted);">${monthDay} ${date.getFullYear()}</div>
            </div>
            <span style="background:var(--brand-soft); color:var(--brand); font-size:0.7rem; font-weight:800; padding:3px 9px; border-radius:8px; flex-shrink:0;">${msgs.length}</span>
        </div>`;
    }).join('');

    window.__archiveGroups = groups;
}

window.__selectArchiveDay = (dateStr) => {
    selectedArchiveDay = dateStr;

    document.querySelectorAll('.arch-day-item').forEach(c => c.classList.remove('active'));
    const card = document.querySelector(`.arch-day-item[data-day="${dateStr}"]`);
    if (card) card.classList.add('active');

    const groups = window.__archiveGroups || {};
    const dayMsgs = groups[dateStr]?.msgs || [];

    // Update title
    const titleEl = document.getElementById('archiveSelectedTitle');
    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-calendar-check" style="color:var(--brand); margin-right:6px;"></i> ${dateStr} · <strong>${dayMsgs.length}</strong> mesaj`;

    // Show export btn
    const exportBtn = document.getElementById('archiveExportBtn');
    if (exportBtn) {
        exportBtn.style.display = 'inline-flex';
        exportBtn.onclick = () => window.__exportDay(dateStr);
    }

    const archiveMsgList = document.getElementById('archiveMsgList');
    if (archiveMsgList) renderMessageFeed(archiveMsgList, dayMsgs);

    // Slide animation
    const daysView = document.getElementById('archiveDaysView');
    const msgsView = document.getElementById('archiveMsgsView');
    if (daysView && msgsView) {
        daysView.style.transform = 'translateX(-100%)';
        msgsView.style.transform = 'translateX(0)';
    }
};

window.__exportDay = (dateStr) => {
    const groups = window.__archiveGroups || {};
    const msgs = groups[dateStr]?.msgs || [];
    exportToCSV(msgs, `mesajlar_${dateStr.replace(/\./g, '-')}.csv`);
};

// ── CSV EXPORT ─────────────────────────────────────────────────
function exportToCSV(messages, filename = 'mesajlar.csv') {
    if (!messages.length) {
        showToast('Dışa aktarılacak mesaj bulunamadı.', 'info');
        return;
    }

    const headers = ['Tarih', 'Konu', 'Gönderen', 'Alıcı', 'Tip', 'İçerik'];
    const rows = messages.map(m => {
        const ts = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleString('tr-TR') : '-';
        const content = (m.content || '').replace(/"/g, '""').replace(/\n/g, ' ');
        return [
            `"${ts}"`,
            `"${m.subject || '-'}"`,
            `"${m.senderName || '-'}"`,
            `"${m.receiverName || '-'}"`,
            `"${m.type || 'direct'}"`,
            `"${content}"`
        ].join(',');
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n'); // BOM for Turkish chars
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${messages.length} mesaj Excel'e aktarıldı.`, 'success');
}

// ── EXPORT BUTTON (header) ─────────────────────────────────────
function setupExportBtn() {
    const btn = document.getElementById('btnExportCSV');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const today = new Date().toDateString();
        const todayMsgs = allMessages.filter(m => {
            const ts = m.timestamp?.toDate ? m.timestamp.toDate() : null;
            return ts && ts.toDateString() === today;
        });
        const dateStr = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
        exportToCSV(todayMsgs, `bugun_mesajlar_${dateStr}.csv`);
    });
}

// ── MESSAGE CLICK → DETAIL PANEL ──────────────────────────────
function setupMessageClickHandler() {
    ['msgListBody', 'archiveMsgList'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.addEventListener('click', (e) => {
            const card = e.target.closest('[data-msg-id]');
            if (!card) return;
            container.querySelectorAll('.msg-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const msg = allMessages.find(m => m.id === card.dataset.msgId);
            if (msg) showMessageDetail(msg);
        });
    });
}

function showMessageDetail(msg) {
    const placeholder = document.getElementById('msgPlaceholder');
    const detail = document.getElementById('msgDetailView');
    if (!detail) return;
    if (placeholder) placeholder.style.display = 'none';
    detail.style.display = 'flex';

    const fmt = (ts) => {
        if (!ts) return '-';
        const d = ts?.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
    };

    const isBday = msg.type === 'birthday_manual' || msg.type === 'birthday_auto';
    const subjectEl = document.getElementById('detSubject');
    if (subjectEl) subjectEl.innerHTML = isBday ? `🎂 ${msg.subject || 'Doğum Günü Tebriği'}` : (msg.subject || 'Konu Yok');

    const senderEl = document.getElementById('detSender');
    if (senderEl) senderEl.textContent = msg.senderName || '-';
    
    const receiverEl = document.getElementById('detReceiver');
    if (receiverEl) receiverEl.textContent = msg.receiverName || (msg.isBroadcast ? 'Toplu Gönderim' : '-');

    // Populate Info Cards
    const renderInfoCard = async (uid, cardId, defaultName) => {
        const card = document.getElementById(cardId);
        if (!card) return;

        // Özel Sistem Hesabı (İnsan Kaynakları vs.) Kontrolü
        const isSystem = (
            uid === 'system' || 
            uid === 'auto' || 
            (defaultName && (defaultName.includes('İnsan Kaynakları') || defaultName.includes('Insan') || defaultName.toLowerCase().includes('sistem')))
        );
        if (isSystem) {
            card.innerHTML = `
                <div class="info-card-header" style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%);">
                    <div class="info-card-avatar" style="background:rgba(255,255,255,0.15);"><i class="fa-solid fa-robot"></i></div>
                    <div>
                        <div class="info-card-title">Bellona İKA</div>
                        <div class="info-card-subtitle">Otomatik Sistem Merkezi</div>
                    </div>
                </div>
                <div class="info-card-body">
                    <div class="info-card-row"><i class="fa-solid fa-envelope"></i> <span>sistem@bellona.com.tr</span></div>
                    <div class="info-card-row"><i class="fa-solid fa-building"></i> <span>Bellona Merkez Fabrika</span></div>
                    <div class="info-card-row" style="color:var(--text-muted); font-size:0.7rem; margin-top:0.5rem;">
                        <i class="fa-solid fa-circle-info"></i> Bu hesap sistem tarafından yönetilir.
                    </div>
                </div>
            `;
            return;
        }

        if (!uid) {
            card.innerHTML = `<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.8rem;">Kullanıcı bilgisi bulunamadı.</div>`;
            return;
        }
        
        card.innerHTML = `<div style="padding:1rem; text-align:center;"><i class="fa-solid fa-spinner fa-spin" style="color:var(--brand);"></i></div>`;
        const user = await getUserById(uid);
        if (!user) {
            card.innerHTML = `<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.8rem;">${defaultName || 'Kullanıcı'} sistemde bulunamadı.</div>`;
            return;
        }
        const initial = (user.name || defaultName || '?').charAt(0).toUpperCase();
        
        let subtitle = 'Personel';
        if (user.role === 'admin') {
            subtitle = 'Sistem Yöneticisi';
        } else {
            const catMap = { factory: 'Fabrika', regional: 'Bölge Bayisi', local: 'Yerel Bayi' };
            const subMap = { manager: 'Patron / Yönetici', employee: 'Çalışan / Personel' };
            const catName = catMap[user.category] || '';
            const roleName = subMap[user.subRole] || 'Personeli';
            subtitle = catName ? `${catName} ${roleName}` : roleName;
        }

        card.innerHTML = `
            <div class="info-card-header">
                <div class="info-card-avatar">${initial}</div>
                <div>
                    <div class="info-card-title">${user.name || defaultName}</div>
                    <div class="info-card-subtitle">${subtitle}</div>
                </div>
            </div>
            <div class="info-card-body">
                <div class="info-card-row"><i class="fa-solid fa-envelope"></i> <span>${user.email || '-'}</span></div>
                <div class="info-card-row"><i class="fa-solid fa-building"></i> <span>${user.companyName || '-'}</span></div>
                <div class="info-card-row"><i class="fa-solid fa-map-location-dot"></i> <span>${user.region || '-'} / ${user.city || '-'}</span></div>
                <div class="info-card-row"><i class="fa-solid fa-phone"></i> <span>${user.phone || '-'}</span></div>
            </div>
        `;
    };

    renderInfoCard(msg.senderId, 'senderInfoCard', msg.senderName);
    if (!msg.isBroadcast) {
        renderInfoCard(msg.receiverId, 'receiverInfoCard', msg.receiverName);
    } else {
        const rCard = document.getElementById('receiverInfoCard');
        if (rCard) rCard.innerHTML = `<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.8rem;">Bu bir toplu gönderimdir. Alıcılar hedef kitleye göre belirlenmiştir.</div>`;
    }

    const timeEl = document.getElementById('detTime');
    if (timeEl) timeEl.textContent = fmt(msg.timestamp);
    const statusEl = document.getElementById('detStatus');
    if (statusEl) {
        if (isBday) statusEl.innerHTML = `<span style="background:#fdf2f8;color:#9333ea;padding:3px 10px;border-radius:6px;font-weight:700;font-size:0.8rem;">${msg.type === 'birthday_auto' ? '🤖 Otomatik' : '✋ Elle'}</span>`;
        else statusEl.textContent = msg.status || 'active';
    }
    const bodyEl = document.getElementById('detBody');
    if (bodyEl) bodyEl.textContent = msg.content || 'İçerik bulunamadı.';

    const attachEl = document.getElementById('detAttachment');
    if (attachEl) {
        attachEl.style.display = msg.attachmentUrl ? 'flex' : 'none';
        if (msg.attachmentUrl) {
            const nameEl = document.getElementById('detAttachName');
            const linkEl = document.getElementById('detAttachLink');
            if (nameEl) nameEl.textContent = msg.attachmentName || 'Ek Dosya';
            if (linkEl) linkEl.href = msg.attachmentUrl;
        }
    }
}

// ── BADGES & ANALYTICS ─────────────────────────────────────────
function updateCountBadges() {
    const today = new Date().toDateString();
    const bdayCount = allMessages.filter(m => m.type === 'birthday_manual' || m.type === 'birthday_auto').length;
    const bdayEl = document.getElementById('bdayFilterCount');
    if (bdayEl) bdayEl.textContent = bdayCount;
    const totalEl = document.getElementById('totalCount');
    if (totalEl) totalEl.textContent = allMessages.length;
    const todayEl = document.getElementById('todayCount');
    if (todayEl) todayEl.textContent = allMessages.filter(m => m.timestamp?.toDate().toDateString() === today).length;
}

function computeAnalytics() {
    const senderMap = {};
    allMessages.forEach(m => { const k = m.senderName || 'Bilinmiyor'; senderMap[k] = (senderMap[k] || 0) + 1; });
    const sorted = Object.entries(senderMap).sort((a, b) => b[1] - a[1]);
    const activeRegionEl = document.getElementById('activeRegion');
    if (activeRegionEl && sorted.length) activeRegionEl.textContent = sorted[0][0];
    const since24h = Date.now() - 86400000;
    const recent = allMessages.filter(m => { const ts = m.timestamp?.toDate ? m.timestamp.toDate().getTime() : 0; return ts > since24h; }).length;
    const intensityEl = document.getElementById('liveIntensity');
    if (intensityEl) intensityEl.textContent = `${recent} / 24sa`;
}

// ── BROADCAST MODAL ────────────────────────────────────────────
async function initBroadcast() {
    const modal = document.getElementById('broadcastModal');
    const btnOpen = document.getElementById('btnOpenBroadcast');
    const btnClose = document.getElementById('btnCloseBroadcast');
    const form = document.getElementById('broadcastForm');
    const btnAI = document.getElementById('btnBroadcastAI');
    
    // Toggles
    const toggleBroadcast = document.getElementById('toggleBroadcast');
    const toggleDirect = document.getElementById('toggleDirect');
    const broadcastFilters = document.getElementById('broadcastFilters');
    const directFilters = document.getElementById('directFilters');
    const modalTitle = document.getElementById('modalTitle');
    
    let messageMode = 'broadcast'; // 'broadcast' | 'direct'
    let selectedUser = null;

    if (btnOpen) btnOpen.onclick = () => { if (modal) modal.style.display = 'flex'; };
    if (btnClose) btnClose.onclick = () => { if (modal) modal.style.display = 'none'; };

    // Toggle Logic
    const switchMode = (mode) => {
        messageMode = mode;
        if (mode === 'broadcast') {
            toggleBroadcast.classList.add('active');
            toggleDirect.classList.remove('active');
            broadcastFilters.style.display = 'block';
            directFilters.style.display = 'none';
            modalTitle.innerHTML = '<i class="fa-solid fa-bullhorn" style="color:var(--brand); margin-right:0.5rem;"></i> Toplu Duyuru Yayınla';
        } else {
            toggleBroadcast.classList.remove('active');
            toggleDirect.classList.add('active');
            broadcastFilters.style.display = 'none';
            directFilters.style.display = 'block';
            modalTitle.innerHTML = '<i class="fa-solid fa-user-pen" style="color:var(--brand); margin-right:0.5rem;"></i> Bireysel Mesaj Gönder';
        }
    };

    if (toggleBroadcast) toggleBroadcast.onclick = () => switchMode('broadcast');
    if (toggleDirect) toggleDirect.onclick = () => switchMode('direct');

    // User Search Logic
    const searchInput = document.getElementById('userSearchInput');
    const resultsArea = document.getElementById('userSearchResults');
    const chipArea = document.getElementById('selectedUserChip');
    const nameSpan = document.getElementById('selectedUserName');
    const btnRemove = document.getElementById('btnRemoveSelectedUser');

    // File Attachment Logic
    const fileInput = document.getElementById('broadcastFile');
    const fileNameArea = document.getElementById('selectedFileName');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const btnRemoveFile = document.getElementById('btnRemoveFile');
    let selectedFile = null;

    if (fileInput) {
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 10 * 1024 * 1024) { // 10MB limit
                    showToast('Dosya boyutu 10MB\'dan büyük olamaz.', 'error');
                    fileInput.value = '';
                    return;
                }
                selectedFile = file;
                fileNameDisplay.textContent = file.name;
                fileNameArea.style.display = 'flex';
            }
        };
    }

    if (btnRemoveFile) {
        btnRemoveFile.onclick = () => {
            selectedFile = null;
            fileInput.value = '';
            fileNameArea.style.display = 'none';
        };
    }

    if (searchInput) {
        searchInput.oninput = async (e) => {
            const val = e.target.value.trim().toLowerCase();
            if (val.length < 2) {
                resultsArea.style.display = 'none';
                return;
            }

            const allUsers = await getAllUsers();
            const filterCat = document.getElementById('directSearchCategory')?.value || 'all';
            const filterReg = document.getElementById('directSearchRegion')?.value || 'all';

            const filtered = allUsers.filter(u => {
                if (u.role === 'admin') return false;
                
                // Kategori Filtresi
                if (filterCat !== 'all' && u.category !== filterCat) return false;
                
                // Bölge Filtresi
                if (filterReg !== 'all' && u.region !== filterReg) return false;

                const searchStr = `${u.name} ${u.surname} ${u.companyName} ${u.dealerCode} ${u.city} ${u.region} ${u.category}`.toLowerCase();
                return searchStr.includes(val);
            }).slice(0, 15);

            if (filtered.length > 0) {
                resultsArea.innerHTML = filtered.map(u => {
                    const catMap = { factory: 'Fabrika', regional: 'Bölge Bayi', local: 'Yerel Bayi' };
                    const catColor = { factory: '#ef4444', regional: '#3b82f6', local: '#10b981' };
                    const catName = catMap[u.category] || 'Personel';
                    const color = catColor[u.category] || 'var(--brand)';
                    
                    return `
                    <div class="user-search-item" style="padding:1rem; border-bottom:1px solid var(--border); cursor:pointer; display:flex; flex-direction:column; gap:6px; transition: background 0.2s;" 
                         onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'"
                         onclick="window.__selectUserForMsg('${u.id}', '${u.name} ${u.surname}')">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:800; font-size:0.95rem; color:var(--brand-ink);">${u.name} ${u.surname}</span>
                            <span style="background:${color}15; color:${color}; font-size:0.65rem; font-weight:800; padding:3px 10px; border-radius:100px; border: 1px solid ${color}30;">
                                ${catName.toUpperCase()}
                            </span>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                             <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; display:flex; align-items:center; gap:4px;">
                                <i class="fa-solid fa-building" style="opacity:0.6;"></i> ${u.companyName || '-'}
                            </div>
                            <div style="background:var(--brand-soft); color:var(--brand); font-size:0.65rem; font-weight:800; padding:2px 8px; border-radius:6px;">
                                #${u.dealerCode || '0000'}
                            </div>
                        </div>
                        <div style="font-size:0.7rem; color:var(--text-light); display:flex; align-items:center; gap:4px;">
                            <i class="fa-solid fa-map-location-dot" style="opacity:0.6;"></i> ${u.region || '-'} / ${u.city || '-'}
                        </div>
                    </div>
                `}).join('');
                resultsArea.style.display = 'block';
            } else {
                resultsArea.innerHTML = '<div style="padding:1rem; text-align:center; font-size:0.85rem; color:var(--text-muted);"><i class="fa-solid fa-magnifying-glass" style="display:block; margin-bottom:0.5rem; opacity:0.3; font-size:1.5rem;"></i>Sonuç bulunamadı.</div>';
                resultsArea.style.display = 'block';
            }
        };
    }

    window.__selectUserForMsg = (id, name) => {
        selectedUser = { id, name };
        nameSpan.textContent = name;
        chipArea.style.display = 'block';
        resultsArea.style.display = 'none';
        searchInput.value = '';
    };

    if (btnRemove) btnRemove.onclick = () => {
        selectedUser = null;
        chipArea.style.display = 'none';
    };

    // AI Button Logic
    if (btnAI) {
        btnAI.onclick = async () => {
            const bodyEl = document.getElementById('broadcastBody');
            const draft = bodyEl.value.trim();
            if (!draft) return showToast('Önce taslak yazın.', 'info');
            btnAI.disabled = true;
            btnAI.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Hazırlanıyor...';
            try {
                const prompt = `Sen Bellona Kurumsal İletişim Uzmanısın. Kullanıcının girdiği taslağı profesyonel bir duyuru metnine dönüştür.
                KURALLAR:
                1. En az 3-4 cümlelik, profesyonel ve vizyoner bir metin oluştur.
                2. Ürün gruplarını (Nadia vb.) kişi adı sanma.
                3. Giriş hitabı (Sayın...) ve kapanış imzasını (Saygılarımla...) KESİNLİKLE yazma, sistem otomatik ekleyecek.
                4. Sadece mesajın gövdesini yaz, konu başlığı üretme.`;
                const response = await refineMessageWithAI(draft, prompt);
                bodyEl.value = response.trim();
                showToast('Mesaj başarıyla düzenlendi.', 'success');
            } catch (err) {
                showToast('Hata: ' + err.message, 'error');
            } finally {
                btnAI.disabled = false;
                btnAI.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> AI İLE DÜZENLE';
            }
        };
    }

    // Submit Logic
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const subject = document.getElementById('broadcastSubject').value;
            const body = document.getElementById('broadcastBody').value;
            const btn = document.getElementById('btnSendFinal');
            
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşlem Yapılıyor...';
            
            try {
                let attachment = null;
                if (selectedFile) {
                    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up fa-bounce"></i> Dosya Yükleniyor...';
                    attachment = await uploadAttachment(selectedFile, 'attachments');
                }

                if (messageMode === 'broadcast') {
                    const target = document.getElementById('broadcastTarget').value;
                    const region = document.getElementById('broadcastRegion').value;
                    const subRole = document.getElementById('broadcastSubRole').value;
                    const sentCount = await sendBroadcast({ target, region, subRole, subject, body, attachment });
                    showToast(`${sentCount} kişiye duyuru gönderildi.`, 'success');
                } else {
                    if (!selectedUser) throw new Error("Lütfen bir alıcı seçin.");
                    await sendDirectMessage({ 
                        receiverId: selectedUser.id, 
                        receiverName: selectedUser.name, 
                        subject, 
                        body,
                        attachment
                    });
                    showToast('Bireysel mesaj gönderildi.', 'success');
                }
                form.reset();
                selectedUser = null;
                selectedFile = null;
                if (chipArea) chipArea.style.display = 'none';
                if (fileNameArea) fileNameArea.style.display = 'none';
                setTimeout(() => { if (modal) modal.style.display = 'none'; }, 1500);
            } catch (err) {
                showToast('Hata: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gönderimi Başlat';
            }
        };
    }
}
