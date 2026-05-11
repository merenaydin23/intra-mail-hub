import { getAuditLogs } from "../services/audit-service.js";
import { getAllMessages } from "../services/message-service.js";
import { sendBroadcast } from "../services/broadcast-service.js";
import { refineMessageWithAI } from "../../services/ai-service.js";
import { showToast } from "../ui/notifications.js";
import { getSessionActor } from "../auth/session-service.js";
import { renderMessageFeed } from "../ui/renderers.js";
import { collection, getDocs, doc, getDoc, orderBy, query, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

export async function initMessagesPage() {
    initBroadcast();
    setupRealtimeMessages();
}

function setupRealtimeMessages() {
    const listBody = document.getElementById('msgListBody');
    if (!listBody) return;

    // Listen for ALL messages in real-time
    const q = query(collection(db, "messages"), orderBy("timestamp", "desc"), limit(100));
    
    onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMessageFeed(listBody, messages);
        
        // Update stats
        const totalCount = document.getElementById('totalCount');
        if (totalCount) totalCount.textContent = messages.length;
        
        const todayCount = document.getElementById('todayCount');
        if (todayCount) {
            const today = new Date().toDateString();
            const count = messages.filter(m => m.timestamp?.toDate().toDateString() === today).length;
            todayCount.textContent = count;
        }
    });
}

async function initBroadcast() {
    const modal = document.getElementById('broadcastModal');
    const btnOpen = document.getElementById('btnOpenBroadcast');
    const btnClose = document.getElementById('btnCloseBroadcast');
    const form = document.getElementById('broadcastForm');
    const btnAI = document.getElementById('btnBroadcastAI');

    if (btnOpen) btnOpen.onclick = () => modal.style.display = 'block';
    if (btnClose) btnClose.onclick = () => modal.style.display = 'none';

    if (btnAI) {
        btnAI.onclick = async () => {
            const bodyEl = document.getElementById('broadcastBody');
            const targetEl = document.getElementById('broadcastTarget');
            const subjectEl = document.getElementById('broadcastSubject');
            const draft = bodyEl.value.trim();
            const subject = subjectEl.value.trim();
            
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
                setTimeout(() => modal.style.display = 'none', 1500);
            } catch (err) {
                showToast('Hata: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Duyuruyu Gönder';
            }
        };
    }
}
