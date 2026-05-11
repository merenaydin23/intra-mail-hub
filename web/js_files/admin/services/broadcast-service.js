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
    
    if (users.length === 0) {
        throw new Error("Seçilen grupta aktif kullanıcı bulunamadı.");
    }

    const fullSubject = `[DUYURU] ${subject}`;

    // 2. Her kullanıcıya mesaj oluştur (Otomatik Kişiselleştirme)
    const promises = users.map(user => {
        const personalizedBody = `Sayın ${user.name} ${user.surname || ''},\n\n${body}\n\nSaygılarımla,\nBellona Fabrikası`;
        
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
