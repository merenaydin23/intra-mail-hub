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
            
            // Kullanıcının istediği özel kitle eşleşmeleri
            const targetMapping = {
                'all': 'Sayın Bellona Ailesi Üyeleri,',
                'factory': 'Değerli Fabrika Çalışanlarımız,',
                'regional': 'Sayın Bölge Bayilerimiz,',
                'local': 'Değerli Yerel Bayilerimiz,',
                'management': 'Sayın Yönetim Ekibi,'
            };
            const autoGreeting = targetMapping[targetValue] || 'Sayın Bellona Ailesi Üyeleri,';

            btnAI.disabled = true;
            btnAI.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uzman Hazırlıyor...';

            try {
                // Bellona Üst Düzey Kurumsal İletişim Uzmanı Promptu
                const prompt = `Sen Bellona Genel Merkezi adına çalışan üst düzey bir kurumsal iletişim uzmanısın.
                
                Görevin:
                Seçilen hedef kitleye göre otomatik olarak DOĞRU hitap cümlesini belirleyip buna uygun profesyonel, yaratıcı ve kurumsal bir e-posta oluşturmak.
                
                HEDEF KİTLE: ${targetValue}
                OTOMATİK HİTAP: ${autoGreeting}
                KONU: ${subject || 'Kurumsal Duyuru'}
                TASLAK İÇERİK: ${draft}
                
                DAVRANIŞ KURALLARI:
                - Hitabı mutlaka '${autoGreeting}' olarak kullan.
                - Metin kurumsal, akıcı ve etkileyici olsun.
                - Samimi ama profesyonel bir ton kullan.
                - Marka gücü, birlik ve motivasyon vurgusu yap.
                - Gelecek vizyonu ve kurumsal öngörü ekleyerek zenginleştir.
                - Mail çok uzun olmasın (2-3 paragraf ideal).
                
                ÇIKTI FORMATI:
                - (Gerekliyse) Güçlü bir başlık
                - ${autoGreeting}
                - [Düzenlenmiş İçerik]
                - Kapanış: 'Saygılarımızla,' veya 'İyi çalışmalar dileriz,'
                - İmza: Bellona Genel Merkezi
                
                Sadece düzenlenen nihai metni döndür.`;
                
                const refined = await refineMessageWithAI(draft, prompt);
                bodyEl.value = refined;
                showToast('Kurumsal uzman metni hazırladı.', 'success');
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
