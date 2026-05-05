import { getAuditLogs } from "../services/audit-service.js";
import { getAllMessages } from "../services/message-service.js";
import { sendBroadcast } from "../services/broadcast-service.js";
import { refineMessageWithAI } from "../../services/ai-service.js";
import { showToast } from "../ui/notifications.js";
import { collection, getDocs, doc, getDoc, orderBy, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

let allMessages = [];
let activeFilter = 'all';
let activeSearch = '';
let activeTab = 'today'; // 'today' | 'archive'

export async function initMessagesPage() {
    allMessages = await getAllMessages(200);
    await updateStats(allMessages);
    renderTodayList();
    initTabs();
    initSearch();
    initFilters();
    initExport();
    initBroadcast();
}

function initBroadcast() {
    const modal = document.getElementById('broadcastModal');
    const btnOpen = document.getElementById('btnOpenBroadcast');
    const btnClose = document.getElementById('btnCloseBroadcast');
    const btnAI = document.getElementById('btnBroadcastAI');
    const form = document.getElementById('broadcastForm');

    if (btnOpen) btnOpen.onclick = () => modal.style.display = 'flex';
    if (btnClose) btnClose.onclick = () => modal.style.display = 'none';
    
    // Close on backdrop click
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    if (btnAI) {
        btnAI.onclick = async () => {
            const bodyEl = document.getElementById('broadcastBody');
            const draft = bodyEl.value.trim();
            if (!draft) return showToast('Önce bir taslak metin yazmalısınız.', 'info');

            btnAI.disabled = true;
            btnAI.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Düzenleniyor...';

            try {
                // Bellona Özel Kurumsal Prompt
                const prompt = `Bu bir Bellona kurumsal duyurusudur. Metni şu kurallara göre düzenle:
                1. Başlangıç her zaman 'Sayın Bellona Ailesinin üyeleri' olmalıdır.
                2. Bitiş her zaman 'Saygılarımla, Bellona Genel Merkezi' olmalıdır.
                3. İçerik profesyonel, nazik, kurumsal ve güven veren bir dille yazılmalıdır.
                4. Gelen taslak metni bu formata sadık kalarak, anlamını bozmadan profesyonelleştir.
                Sadece düzenlenen metni döndür.`;
                
                const refined = await refineMessageWithAI(draft, prompt);
                bodyEl.value = refined;
                showToast('Metin kurumsal formata göre düzenlendi.', 'success');
            } catch (err) {
                showToast('AI Hatası: ' + err.message, 'error');
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

            const confirmMsg = `Bu duyuru seçilen gruba (${target}) gönderilecektir. Onaylıyor musunuz?`;
            if (!confirm(confirmMsg)) return;

            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gönderiliyor...';

            try {
                const sentCount = await sendBroadcast({ target, subject, body });
                showToast(`Duyuru başarıyla ${sentCount} kişiye gönderildi.`, 'success');
                setTimeout(() => location.reload(), 1500); // Refresh to see new messages
            } catch (err) {
                console.error('Broadcast error:', err);
                showToast('Hata: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Duyuruyu Gönder';
                modal.style.display = 'none';
                form.reset();
            }
        };
    }
}

// ─────────────────────────────────────────
// SEKME SİSTEMİ
// ─────────────────────────────────────────
function initTabs() {
    document.querySelectorAll('.hub-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('.hub-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            clearDetail();

            if (activeTab === 'today') {
                showPanel('todayPanel');
                renderTodayList();
            } else {
                showPanel('archivePanel');
                await renderArchiveList();
            }
        });
    });
}

function showPanel(id) {
    document.getElementById('todayPanel').style.display = id === 'todayPanel' ? 'contents' : 'none';
    document.getElementById('archivePanel').style.display = id === 'archivePanel' ? 'contents' : 'none';
}

// ─────────────────────────────────────────
// BUGÜN PANELİ
// ─────────────────────────────────────────
function initSearch() {
    document.getElementById('msgSearch')?.addEventListener('input', e => {
        activeSearch = e.target.value.trim().toLocaleLowerCase('tr-TR');
        renderTodayList();
    });
}

function initFilters() {
    document.querySelectorAll('.msg-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.msg-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            renderTodayList();
        });
    });
}

function getTodayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function getFilteredToday() {
    const today = getTodayStart();
    return allMessages.filter(m => {
        const ts = m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp || 0);
        if (ts < today) return false; // sadece bugün

        if (activeSearch) {
            const hay = [m.senderName, m.receiverName, m.subject, m.content].join(' ').toLocaleLowerCase('tr-TR');
            if (!hay.includes(activeSearch)) return false;
        }
        if (activeFilter === 'bulk') return m.subject?.startsWith('[TOPLU]');
        if (activeFilter === 'attach') return !!m.attachmentUrl;
        return true;
    });
}

function renderTodayList() {
    const container = document.getElementById('msgListBody');
    if (!container) return;
    const filtered = getFilteredToday();
    window.__filteredMessages = filtered;

    if (!filtered.length) {
        container.innerHTML = `<div class="msg-empty"><i class="fa-regular fa-envelope-open"></i><p>${activeSearch ? 'Eşleşen mesaj yok.' : 'Bugün henüz mesaj yok.'}</p></div>`;
        return;
    }
    container.innerHTML = filtered.map((m, i) => buildMsgCard(m, i)).join('');
}

// ─────────────────────────────────────────
// ARŞİV PANELİ
// ─────────────────────────────────────────
async function renderArchiveList() {
    const container = document.getElementById('archiveDayList');
    if (!container) return;
    container.innerHTML = `<div class="msg-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Arşiv yükleniyor...</p></div>`;

    try {
        const archSnap = await getDocs(collection(db, 'message_archives'));

        if (archSnap.empty) {
            container.innerHTML = `<div class="msg-empty"><i class="fa-solid fa-box-archive"></i><p>Henüz arşivlenmiş gün yok.<br><small>Her gece 00:05'te dünün mesajları buraya taşınır.</small></p></div>`;
            return;
        }

        // Günleri tarihe göre ters sırala (en yeni üstte)
        const days = archSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => b.id.localeCompare(a.id));

        container.innerHTML = days.map(day => {
            const label = formatDateKey(day.id);
            return `
            <div class="archive-day-card" onclick="loadArchiveDay('${day.id}', this)">
                <div class="archive-day-icon"><i class="fa-solid fa-folder-open"></i></div>
                <div class="archive-day-info">
                    <div class="archive-day-label">${label}</div>
                    <div class="archive-day-count">${day.messageCount || '?'} mesaj</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="color:#cbd5e1; margin-left:auto;"></i>
            </div>`;
        }).join('');
    } catch (err) {
        console.error('Archive load error:', err);
        container.innerHTML = `<div class="msg-empty"><i class="fa-solid fa-circle-exclamation"></i><p>Arşiv yüklenemedi.</p></div>`;
    }
}

window.loadArchiveDay = async function(dateKey, el) {
    // Aktif kart stili
    document.querySelectorAll('.archive-day-card').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');

    const container = document.getElementById('archiveMsgList');
    container.innerHTML = `<div class="msg-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Yükleniyor...</p></div>`;
    clearDetail();

    try {
        const snap = await getDocs(collection(db, `message_archives/${dateKey}/messages`));
        if (snap.empty) {
            container.innerHTML = `<div class="msg-empty"><i class="fa-solid fa-inbox"></i><p>Bu güne ait mesaj bulunamadı.</p></div>`;
            return;
        }
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));

        window.__filteredMessages = msgs;
        container.innerHTML = msgs.map((m, i) => buildMsgCard(m, i, 'archive')).join('');
    } catch (err) {
        container.innerHTML = `<div class="msg-empty"><p>Yükleme hatası.</p></div>`;
    }
};

function formatDateKey(key) {
    const [y, mo, d] = key.split('-');
    const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    return `${parseInt(d)} ${months[parseInt(mo)-1]} ${y}`;
}

// ─────────────────────────────────────────
// ORTAK KART & DETAY
// ─────────────────────────────────────────
function buildMsgCard(m, i, context = 'today') {
    const isBulk = m.subject?.startsWith('[TOPLU]');
    const hasAttach = !!m.attachmentUrl;
    const preview = (m.content || '').replace(/✨\s?/, '').substring(0, 55);
    return `
    <div class="msg-card" onclick="selectMessage(${i})" id="msgCard_${context}_${i}">
        <div class="msg-card-top">
            <div class="msg-card-sender"><i class="fa-solid fa-user-circle" style="color:#007b7b; margin-right:4px; font-size:0.75rem;"></i>${m.senderName || 'Bilinmiyor'}</div>
            <div class="msg-card-time">${formatTime(m.timestamp)}</div>
        </div>
        <div class="msg-card-subject">${m.subject || 'Konu Yok'}</div>
        <div class="msg-card-preview"><span style="color:#007b7b; font-size:0.72rem; margin-right:4px;">→ ${m.receiverName || '?'}</span>${preview}...</div>
        <div style="margin-top:5px;">
            ${isBulk ? '<span class="tag-bulk"><i class="fa-solid fa-bullhorn"></i> TOPLU</span>' : ''}
            ${hasAttach ? '<span class="tag-attach"><i class="fa-solid fa-paperclip"></i> DOSYA</span>' : ''}
        </div>
    </div>`;
}

window.selectMessage = function(index) {
    const msgs = window.__filteredMessages || [];
    const m = msgs[index];
    if (!m) return;

    document.querySelectorAll('.msg-card').forEach(c => c.classList.remove('active'));
    const cards = document.querySelectorAll(`[id^="msgCard_"]`);
    cards.forEach(c => { if (c.getAttribute('onclick') === `selectMessage(${index})`) c.classList.add('active'); });

    document.getElementById('msgPlaceholder').style.display = 'none';
    document.getElementById('msgDetailView').style.display = 'flex';

    document.getElementById('detSubject').textContent = m.subject || 'Konu Yok';
    document.getElementById('detSender').textContent = `Gönderen: ${m.senderName || '—'}`;
    document.getElementById('detReceiver').textContent = `Alıcı: ${m.receiverName || '—'}`;
    document.getElementById('detTime').textContent = formatFullDate(m.timestamp);
    document.getElementById('detStatus').textContent = m._archiveDate ? `📦 Arşiv: ${formatDateKey(m._archiveDate)}` : (m.status || 'Aktif');
    document.getElementById('detBody').textContent = (m.content || '').replace(/✨\s?/, '');

    const attachBox = document.getElementById('detAttachment');
    if (m.attachmentUrl) {
        document.getElementById('detAttachName').textContent = m.attachmentName || 'Ekli Dosya';
        document.getElementById('detAttachLink').href = m.attachmentUrl;
        attachBox.style.display = 'flex';
    } else {
        attachBox.style.display = 'none';
    }

    const repliesSection = document.getElementById('detReplies');
    const repliesBody = document.getElementById('detRepliesBody');
    if (m.replies && m.replies.length > 0) {
        repliesSection.style.display = 'block';
        repliesBody.innerHTML = m.replies.map(r => {
            const rDate = new Date(r.timestamp).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
            return `<div class="reply-item"><div class="reply-item-header"><span class="reply-item-author"><i class="fa-solid fa-reply"></i> ${r.authorName}</span><span class="reply-item-time">${rDate}</span></div><div class="reply-item-text">${r.text}</div></div>`;
        }).join('');
    } else {
        repliesSection.style.display = 'none';
    }
};

function clearDetail() {
    document.getElementById('msgPlaceholder').style.display = 'flex';
    document.getElementById('msgDetailView').style.display = 'none';
}

// ─────────────────────────────────────────
// İSTATİSTİKLER
// ─────────────────────────────────────────
async function updateStats(messages) {
    const today = getTodayStart();
    const todayMsgs = messages.filter(m => {
        const ts = m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp || 0);
        return ts >= today;
    });

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('todayCount', todayMsgs.length);
    setEl('totalCount', messages.length);

    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const userRegions = {};
        usersSnap.forEach(d => { userRegions[d.id] = d.data().region || 'Bilinmiyor'; });

        const regionCounts = {};
        messages.forEach(m => {
            const reg = userRegions[m.senderId] || 'Bilinmiyor';
            if (reg !== 'Bilinmiyor') regionCounts[reg] = (regionCounts[reg] || 0) + 1;
        });

        let topRegion = 'Veri Yok', maxCount = 0;
        for (const [reg, count] of Object.entries(regionCounts)) {
            if (count > maxCount) { maxCount = count; topRegion = reg; }
        }
        setEl('activeRegion', topRegion);

        const intensity = todayMsgs.length > 20 ? 'Yüksek 🔴' : todayMsgs.length > 5 ? 'Orta 🟡' : 'Düşük 🟢';
        setEl('liveIntensity', intensity);
    } catch (err) { console.error('Stats error:', err); }
}

// ─────────────────────────────────────────
// CSV EXPORT & YARDIMCILAR
// ─────────────────────────────────────────
function initExport() {
    document.getElementById('btnExportCSV')?.addEventListener('click', () => exportToCSV(allMessages));
}

function exportToCSV(messages) {
    const today = new Date().toLocaleDateString('tr-TR');
    let csv = '\uFEFFTarih;Gönderen;Alıcı;Konu;İçerik\n';
    messages.forEach(m => {
        const date = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleString('tr-TR') : '-';
        csv += `${date};${m.senderName||'-'};${m.receiverName||'-'};${(m.subject||'-').replace(/;/g,',')};${(m.content||'-').replace(/;/g,',').replace(/\n/g,' ')}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Bellona_Mesaj_Raporu_${today}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function formatTime(ts) {
    if (!ts) return '—';
    const dt = ts?.toDate ? ts.toDate() : new Date(ts);
    const today = new Date();
    if (dt.toDateString() === today.toDateString()) return dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return dt.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function formatFullDate(ts) {
    if (!ts) return '—';
    const dt = ts?.toDate ? ts.toDate() : new Date(ts);
    return dt.toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
