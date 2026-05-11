import { collection, getDocs, query, where, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";
import { getSessionActor } from "../auth/session-service.js";
import { writeAuditLog } from "./audit-service.js";

export async function sendBroadcast({ target, subject, body }) {
    const actor = await getSessionActor();
    
    // 1. Hedef kitleye göre kullanıcıları çek
    let userQuery = query(collection(db, "users"), where("isActive", "==", true));
    if (target !== 'all') {
        userQuery = query(collection(db, "users"), where("category", "==", target), where("isActive", "==", true));
    }
    
    const snap = await getDocs(userQuery);
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== 'admin');
    
    // Konu Temizliği
    const cleanSubject = subject
        .replace(/\[DUYURU\]/gi, '')
        .replace(/Sayın\s*\[.*?\][.,\s]*/gi, '')
        .replace(/\[Alıcı Adı\][.,\s]*/gi, '')
        .trim();

    const fullSubject = `[DUYURU] ${cleanSubject}`;

    // Temizlik: Kullanıcının girdiği metinden gereksiz placeholder ve eski usul kalıpları temizle
    const cleanBody = body
        .replace(/Sayın\s*\[.*?\][.,\s]*/gi, '') // "Sayın [Alıcı Adı]," kalıbını ve peşindeki virgülü sil
        .replace(/\[Alıcı Adı\][.,\s]*/gi, '')
        .replace(/\[Gönderen Adı\]\s*\/\s*\[Şirket Adı\]/gi, '')
        .replace(/Saygılarımla,/gi, '')
        .replace(/Bellona Fabrikası/gi, '')
        .replace(/Bilgilerinize sunar, iyi çalışmalar dilerim\./gi, '')
        .replace(/Bilgilerinize sunar/gi, '')
        .replace(/^\s*[,.;:]\s*/, '') // Başta kalan başıboş noktalama işaretlerini temizle
        .trim();

    // 2. Her kullanıcıya mesaj oluştur (Otomatik Kişiselleştirme)
    const promises = users.map(user => {
        const personalizedBody = `Sayın ${user.name} ${user.surname || ''},\n\n${cleanBody}\n\nSaygılarımla,\nBellona Fabrikası`;
        
        return addDoc(collection(db, "messages"), {
            senderId: actor.uid,
            senderName: "BELLONA MERKEZ",
            receiverId: user.id,
            receiverName: `${user.name} ${user.surname || ''}`,
            subject: fullSubject,
            content: personalizedBody,
            status: "active",
            isRead: false,
            timestamp: serverTimestamp(),
            type: "announcement"
        });
    });

    await Promise.all(promises);

    // 3. Audit log yaz
    await writeAuditLog({
        actor,
        action: "TOPLU_DUYURU",
        targetType: "broadcast",
        targetId: target,
        detail: `"${subject}" konulu duyuru ${users.length} kişiye gönderildi.`
    });

    return users.length;
}
