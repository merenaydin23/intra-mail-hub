import { getAuditLogs } from "../services/audit-service.js";
import { getAllMessages } from "../services/message-service.js";
import { sendBroadcast } from "../services/broadcast-service.js";
import { refineMessageWithAI } from "../../services/ai-service.js";
import { showToast } from "../ui/notifications.js";
import { getSessionActor } from "../auth/session-service.js";
import { collection, getDocs, doc, getDoc, orderBy, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

export async function initMessagesPage() {
    initBroadcast();
    // Diğer mesaj listeleme mantıkları buraya gelebilir
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
            const draft = bodyEl.value.trim();
            
            if (!draft) return showToast('Önce bir taslak metin yazmalısınız.', 'info');

            const targetValue = targetEl.value;
            const targetNames = {
                'all': 'Bellona Ailesinin Üyeleri',
                'factory': 'Fabrika Çalışanlarımız',
                'regional': 'Bölge Bayilerimiz',
                'local': 'Yerel Bayilerimiz'
            };
            const selectedTarget = targetNames[targetValue] || 'Bellona Ailesi Üyeleri';

            btnAI.disabled = true;
            btnAI.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Düzenleniyor...';

            try {
                const actor = await getSessionActor();
                const senderName = actor ? `${actor.name} ${actor.surname}` : 'Bellona Genel Merkezi';

                // Bellona Dinamik Kurumsal Prompt
                const prompt = `Bu bir Bellona kurumsal duyurusudur. Metni şu kurallara göre düzenle:
                1. Başlangıç her zaman 'Sayın ${selectedTarget},' olmalıdır.
                2. Bitiş her zaman 'Saygılarımla, ${senderName} / Bellona Genel Merkezi' olmalıdır.
                3. İçerik profesyonel, nazik ve kurumsal bir dille yazılmalıdır.
                4. Taslak metni bu formata sadık kalarak, anlamını bozmadan resmi bir duyuruya çevir.
                Sadece düzenlenen metni döndür.`;
                
                const refined = await refineMessageWithAI(draft, prompt);
                bodyEl.value = refined;
                showToast(`Mesaj ${selectedTarget} için düzenlendi.`, 'success');
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

            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gönderiliyor...';

            try {
                const sentCount = await sendBroadcast({ target, subject, body });
                showToast(`Duyuru başarıyla ${sentCount} kişiye gönderildi.`, 'success');
                setTimeout(() => location.reload(), 1500);
            } catch (err) {
                showToast('Hata: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Duyuruyu Gönder';
            }
        };
    }
}
