import { sendBroadcast } from "../services/broadcast-service.js";
import { refineMessageWithAI } from "../../services/ai-service.js";
import { showToast } from "../ui/notifications.js";
import { getSessionActor } from "../auth/session-service.js";
import { renderMessageFeed } from "../ui/renderers.js";
import { writeAuditLog } from "../services/audit-service.js";
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
function setupRealtimeMessages() {
    const q = query(collection(db, "messages"), orderBy("timestamp", "desc"), limit(500));
    onSnapshot(q, (snapshot) => {
        allMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (activeTab === 'today') applyFilter();
        else renderArchiveDays();
        updateCountBadges();
        computeAnalytics();
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

    if (btnOpen) btnOpen.onclick = () => { if (modal) modal.style.display = 'flex'; };
    if (btnClose) btnClose.onclick = () => { if (modal) modal.style.display = 'none'; };

    if (btnAI) {
        btnAI.onclick = async () => {
            const bodyEl = document.getElementById('broadcastBody');
            const targetEl = document.getElementById('broadcastTarget');
            const draft = bodyEl.value.trim();
            if (!draft) return showToast('Önce taslak yazın.', 'info');
            const tMap = { all:'Sayın Bellona Ailesi Üyeleri,', factory:'Değerli Fabrika Çalışanlarımız,', regional:'Sayın Bölge Bayilerimiz,', local:'Değerli Yerel Bayilerimiz,' };
            const greeting = tMap[targetEl.value] || tMap.all;
            btnAI.disabled = true;
            btnAI.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Hazırlanıyor...';
            try {
                const prompt = `Sen Bellona İletişim Uzmanısın. Taslağı profesyonel duyuruya çevir. Hitap: ${greeting} İmza: Saygılarımızla, Bellona Genel Merkezi`;
                const refined = await refineMessageWithAI(draft, prompt);
                bodyEl.value = refined;
                showToast('Mesaj hazırlandı.', 'success');
            } catch (err) {
                showToast('Hata: ' + err.message, 'error');
            } finally {
                btnAI.disabled = false;
                btnAI.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> AI İLE DÜZENLE';
            }
        };
    }

    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const target = document.getElementById('broadcastTarget').value;
            const subject = document.getElementById('broadcastSubject').value;
            const body = document.getElementById('broadcastBody').value;
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gönderiliyor...';
            try {
                const sentCount = await sendBroadcast({ target, subject, body });
                showToast(`Duyuru ${sentCount} kişiye gönderildi.`, 'success');
                form.reset();
                setTimeout(() => { if (modal) modal.style.display = 'none'; }, 1500);
            } catch (err) {
                showToast('Hata: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Duyuruyu Gönder';
            }
        };
    }
}
