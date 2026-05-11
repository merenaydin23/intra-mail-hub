import { sendBroadcast } from "../services/broadcast-service.js";
import { refineMessageWithAI } from "../../services/ai-service.js";
import { showToast } from "../ui/notifications.js";
import { getSessionActor } from "../auth/session-service.js";
import { renderMessageFeed } from "../ui/renderers.js";
import { collection, orderBy, query, onSnapshot, limit, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

let allMessages = [];
let activeFilter = 'all'; // 'all' | 'birthday' | 'broadcast'

export async function initMessagesPage() {
    initBroadcast();
    setupRealtimeMessages();
    setupFilterTabs();
    setupMessageClickHandler();
}

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
    if (searchEl) {
        searchEl.addEventListener('input', () => applyFilter());
    }
}

function applyFilter() {
    const searchTerm = (document.getElementById('msgSearch')?.value || '').toLocaleLowerCase('tr-TR');

    let filtered = allMessages;

    // Type filter
    if (activeFilter === 'birthday') {
        filtered = filtered.filter(m => m.type === 'birthday_manual' || m.type === 'birthday_auto');
    } else if (activeFilter === 'broadcast') {
        filtered = filtered.filter(m => m.type === 'broadcast' || m.isBroadcast);
    } else if (activeFilter === 'direct') {
        filtered = filtered.filter(m => !m.type || m.type === 'direct');
    }

    // Search filter
    if (searchTerm) {
        filtered = filtered.filter(m => {
            const haystack = `${m.subject} ${m.senderName} ${m.receiverName} ${m.content}`.toLocaleLowerCase('tr-TR');
            return haystack.includes(searchTerm);
        });
    }

    const listBody = document.getElementById('msgListBody');
    if (listBody) renderMessageFeed(listBody, filtered);

    // Update badge counts
    updateCountBadges();
}

function updateCountBadges() {
    const bdayCount = allMessages.filter(m => m.type === 'birthday_manual' || m.type === 'birthday_auto').length;
    const bdayBadgeEl = document.getElementById('bdayFilterCount');
    if (bdayBadgeEl) bdayBadgeEl.textContent = bdayCount;

    const totalEl = document.getElementById('totalCount');
    if (totalEl) totalEl.textContent = allMessages.length;

    const today = new Date().toDateString();
    const todayEl = document.getElementById('todayCount');
    if (todayEl) {
        const count = allMessages.filter(m => m.timestamp?.toDate().toDateString() === today).length;
        todayEl.textContent = count;
    }
}

function setupRealtimeMessages() {
    const listBody = document.getElementById('msgListBody');
    if (!listBody) return;

    const q = query(collection(db, "messages"), orderBy("timestamp", "desc"), limit(200));

    onSnapshot(q, (snapshot) => {
        allMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFilter();
        updateCountBadges();
        computeAnalytics();
    });
}

function computeAnalytics() {
    // En aktif gönderici bölgesi
    const senderMap = {};
    allMessages.forEach(m => {
        const key = m.senderName || 'Bilinmiyor';
        senderMap[key] = (senderMap[key] || 0) + 1;
    });
    const sorted = Object.entries(senderMap).sort((a, b) => b[1] - a[1]);
    const activeRegionEl = document.getElementById('activeRegion');
    if (activeRegionEl && sorted.length) activeRegionEl.textContent = sorted[0][0];

    // Yoğunluk (son 24 saat)
    const since24h = Date.now() - 86400000;
    const recent = allMessages.filter(m => {
        const ts = m.timestamp?.toDate ? m.timestamp.toDate().getTime() : 0;
        return ts > since24h;
    }).length;
    const intensityEl = document.getElementById('liveIntensity');
    if (intensityEl) intensityEl.textContent = `${recent} / 24sa`;
}

function setupMessageClickHandler() {
    const listBody = document.getElementById('msgListBody');
    if (!listBody) return;

    listBody.addEventListener('click', (e) => {
        const card = e.target.closest('[data-msg-id]');
        if (!card) return;

        // Remove active from all
        listBody.querySelectorAll('.msg-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        const msgId = card.dataset.msgId;
        const msg = allMessages.find(m => m.id === msgId);
        if (msg) showMessageDetail(msg);
    });
}

function showMessageDetail(msg) {
    const placeholder = document.getElementById('msgPlaceholder');
    const detail = document.getElementById('msgDetailView');
    if (!detail) return;

    if (placeholder) placeholder.style.display = 'none';
    detail.style.display = 'flex';

    const formatDate = (ts) => {
        if (!ts) return '-';
        const d = ts?.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
    };

    const subjectEl = document.getElementById('detSubject');
    if (subjectEl) {
        const isBday = msg.type === 'birthday_manual' || msg.type === 'birthday_auto';
        subjectEl.innerHTML = isBday
            ? `🎂 ${msg.subject || 'Doğum Günü Tebriği'}`
            : (msg.subject || 'Konu Yok');
    }

    const senderEl = document.getElementById('detSender');
    if (senderEl) senderEl.textContent = msg.senderName || '-';

    const receiverEl = document.getElementById('detReceiver');
    if (receiverEl) receiverEl.textContent = msg.receiverName || (msg.isBroadcast ? 'Toplu Gönderim' : '-');

    const timeEl = document.getElementById('detTime');
    if (timeEl) timeEl.textContent = formatDate(msg.timestamp);

    const statusEl = document.getElementById('detStatus');
    if (statusEl) {
        const isBday = msg.type === 'birthday_manual' || msg.type === 'birthday_auto';
        if (isBday) {
            statusEl.innerHTML = `<span style="background:#fdf2f8; color:#9333ea; padding:3px 10px; border-radius:6px; font-weight:700; font-size:0.8rem;">${msg.type === 'birthday_auto' ? '🤖 Otomatik Tebrik' : '✋ Elle Gönderildi'}</span>`;
        } else {
            statusEl.textContent = msg.status || 'active';
        }
    }

    const bodyEl = document.getElementById('detBody');
    if (bodyEl) bodyEl.textContent = msg.content || 'İçerik bulunamadı.';

    // Attachment
    const attachEl = document.getElementById('detAttachment');
    if (attachEl) {
        if (msg.attachmentUrl) {
            attachEl.style.display = 'flex';
            const nameEl = document.getElementById('detAttachName');
            const linkEl = document.getElementById('detAttachLink');
            if (nameEl) nameEl.textContent = msg.attachmentName || 'Ek Dosya';
            if (linkEl) linkEl.href = msg.attachmentUrl;
        } else {
            attachEl.style.display = 'none';
        }
    }
}

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
            const subjectEl = document.getElementById('broadcastSubject');
            const draft = bodyEl.value.trim();

            if (!draft) return showToast('Önce bir taslak metin yazmalısınız.', 'info');

            const targetValue = targetEl.value;
            const targetMapping = {
                'all': 'Sayın Bellona Ailesi Üyeleri,',
                'factory': 'Değerli Fabrika Çalışanlarımız,',
                'regional': 'Sayın Bölge Bayilerimiz,',
                'local': 'Değerli Yerel Bayilerimiz,',
                'management': 'Sayın Yönetim Ekibi,'
            };
            const autoGreeting = targetMapping[targetValue] || 'Sayın Bellona Ailesi Üyeleri,';

            btnAI.disabled = true;
            btnAI.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Hazırlanıyor...';

            try {
                const actor = await getSessionActor();
                const senderName = actor ? `${actor.name} ${actor.surname}` : 'Bellona Genel Merkezi';

                const prompt = `Sen Bellona Genel Merkezi Kurumsal İletişim Uzmanısın.
                GÖREVİN: Aşağıdaki taslağı profesyonel bir duyuruya dönüştürmek.
                Hitap olarak SADECE şunu kullan: ${autoGreeting}
                İmza olarak SADECE şunu kullan: Saygılarımızla, Bellona Genel Merkezi`;

                const refined = await refineMessageWithAI(draft, prompt);
                bodyEl.value = refined;
                showToast('Mesaj başarıyla hazırlandı.', 'success');
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
                showToast(`Duyuru başarıyla ${sentCount} kişiye gönderildi.`, 'success');
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
