import { getAuditLogs } from "../services/audit-service.js";
import { getAllMessages } from "../services/message-service.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

let allMessages = [];
let activeFilter = 'all';
let activeSearch = '';

export async function initMessagesPage() {
    // Mesajları yükle
    allMessages = await getAllMessages(200);

    // İstatistikleri güncelle
    await updateStats(allMessages);

    // Listeyi ilk defa çiz
    renderList();

    // Arama
    const searchInput = document.getElementById('msgSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            activeSearch = e.target.value.trim().toLocaleLowerCase('tr-TR');
            renderList();
        });
    }

    // Filtre butonları
    document.querySelectorAll('.msg-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.msg-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            renderList();
        });
    });

    // CSV Export
    const exportBtn = document.getElementById('btnExportCSV');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportToCSV(allMessages));
    }
}

function getFilteredMessages() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allMessages.filter(m => {
        // Arama filtresi
        if (activeSearch) {
            const haystack = [m.senderName, m.receiverName, m.subject, m.content]
                .join(' ').toLocaleLowerCase('tr-TR');
            if (!haystack.includes(activeSearch)) return false;
        }

        // Tür filtresi
        if (activeFilter === 'bulk') return m.subject?.startsWith('[TOPLU]');
        if (activeFilter === 'attach') return !!m.attachmentUrl;
        if (activeFilter === 'today') {
            const ts = m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp || 0);
            return ts >= today;
        }

        return true;
    });
}

function formatTime(ts) {
    if (!ts) return '—';
    const dt = ts?.toDate ? ts.toDate() : new Date(ts);
    const today = new Date();
    if (dt.toDateString() === today.toDateString()) {
        return dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    return dt.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function formatFullDate(ts) {
    if (!ts) return '—';
    const dt = ts?.toDate ? ts.toDate() : new Date(ts);
    return dt.toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderList() {
    const container = document.getElementById('msgListBody');
    if (!container) return;

    const filtered = getFilteredMessages();

    if (!filtered.length) {
        container.innerHTML = `
            <div class="msg-empty">
                <i class="fa-regular fa-envelope-open"></i>
                <p>${activeSearch ? 'Aramayla eşleşen mesaj bulunamadı.' : 'Bu kategoride mesaj yok.'}</p>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map((m, i) => {
        const isBulk = m.subject?.startsWith('[TOPLU]');
        const hasAttach = !!m.attachmentUrl;
        const preview = (m.content || '').replace(/✨\s?/, '').substring(0, 60);

        return `
        <div class="msg-card" onclick="selectMessage(${i})" id="msgCard_${i}">
            <div class="msg-card-top">
                <div class="msg-card-sender">
                    <i class="fa-solid fa-user-circle" style="color:#007b7b; margin-right:4px; font-size:0.75rem;"></i>
                    ${m.senderName || 'Bilinmiyor'}
                </div>
                <div class="msg-card-time">${formatTime(m.timestamp)}</div>
            </div>
            <div class="msg-card-subject">${m.subject || 'Konu Yok'}</div>
            <div class="msg-card-preview">
                <span style="color:#007b7b; font-size:0.72rem; margin-right:4px;">→ ${m.receiverName || '?'}</span>
                ${preview}...
            </div>
            <div style="margin-top:5px;">
                ${isBulk ? '<span class="tag-bulk"><i class="fa-solid fa-bullhorn"></i> TOPLU</span>' : ''}
                ${hasAttach ? '<span class="tag-attach"><i class="fa-solid fa-paperclip"></i> DOSYA</span>' : ''}
            </div>
        </div>`;
    }).join('');

    // window'a bağla ki onclick çalışsın
    window.__filteredMessages = filtered;
}

window.selectMessage = function(index) {
    const msgs = window.__filteredMessages || [];
    const m = msgs[index];
    if (!m) return;

    // Kart aktif stilini güncelle
    document.querySelectorAll('.msg-card').forEach(c => c.classList.remove('active'));
    const card = document.getElementById(`msgCard_${index}`);
    if (card) card.classList.add('active');

    // Placeholder gizle, detay göster
    document.getElementById('msgPlaceholder').style.display = 'none';
    document.getElementById('msgDetailView').style.display = 'flex';

    // Alanları doldur
    document.getElementById('detSubject').textContent = m.subject || 'Konu Yok';
    document.getElementById('detSender').textContent = m.senderName || '—';
    document.getElementById('detReceiver').textContent = m.receiverName || '—';
    document.getElementById('detTime').textContent = formatFullDate(m.timestamp);
    document.getElementById('detStatus').textContent = m.status || 'active';
    document.getElementById('detBody').textContent = (m.content || '').replace(/✨\s?/, '');

    // Ek dosya
    const attachBox = document.getElementById('detAttachment');
    if (m.attachmentUrl) {
        document.getElementById('detAttachName').textContent = m.attachmentName || 'Ekli Dosya';
        document.getElementById('detAttachLink').href = m.attachmentUrl;
        attachBox.style.display = 'flex';
    } else {
        attachBox.style.display = 'none';
    }

    // Yanıtlar
    const repliesSection = document.getElementById('detReplies');
    const repliesBody = document.getElementById('detRepliesBody');
    if (m.replies && m.replies.length > 0) {
        repliesSection.style.display = 'block';
        repliesBody.innerHTML = m.replies.map(r => {
            const rDate = new Date(r.timestamp).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
            return `
            <div class="reply-item">
                <div class="reply-item-header">
                    <span class="reply-item-author"><i class="fa-solid fa-reply"></i> ${r.authorName}</span>
                    <span class="reply-item-time">${rDate}</span>
                </div>
                <div class="reply-item-text">${r.text}</div>
            </div>`;
        }).join('');
    } else {
        repliesSection.style.display = 'none';
    }
};

async function updateStats(messages) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMsgs = messages.filter(m => {
        const ts = m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp || 0);
        return ts >= today;
    });

    const todayEl = document.getElementById('todayCount');
    const totalEl = document.getElementById('totalCount');
    if (todayEl) todayEl.textContent = todayMsgs.length;
    if (totalEl) totalEl.textContent = messages.length;

    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const userRegions = {};
        usersSnap.forEach(doc => { userRegions[doc.id] = doc.data().region || 'Bilinmiyor'; });

        const regionCounts = {};
        messages.forEach(m => {
            const reg = userRegions[m.senderId] || 'Bilinmiyor';
            if (reg !== 'Bilinmiyor') regionCounts[reg] = (regionCounts[reg] || 0) + 1;
        });

        let topRegion = 'Veri Yok', maxCount = 0;
        for (const [reg, count] of Object.entries(regionCounts)) {
            if (count > maxCount) { maxCount = count; topRegion = reg; }
        }

        const regionEl = document.getElementById('activeRegion');
        if (regionEl) regionEl.textContent = topRegion;

        const intensityEl = document.getElementById('liveIntensity');
        if (intensityEl) {
            if (todayMsgs.length > 20) { intensityEl.textContent = 'Yüksek 🔴'; }
            else if (todayMsgs.length > 5) { intensityEl.textContent = 'Orta 🟡'; }
            else { intensityEl.textContent = 'Düşük 🟢'; }
        }
    } catch (err) { console.error('Stats error:', err); }
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
