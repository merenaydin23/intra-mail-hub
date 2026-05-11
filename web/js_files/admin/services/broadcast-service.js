import { collection, getDocs, query, where, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";
import { getSessionActor } from "../auth/session-service.js";
import { writeAuditLog } from "./audit-service.js";

export async function sendBroadcast({ target, region, subRole, subject, body }) {
    const actor = await getSessionActor();
    
    // 1. Kullanıcıları çek ve filtrele
    const snap = await getDocs(query(collection(db, "users"), where("isActive", "==", true)));
    let users = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== 'admin');

    // Granüler Filtreleme
    if (target !== 'all') users = users.filter(u => u.category === target);
    if (region !== 'all') users = users.filter(u => u.region === region);
    if (subRole !== 'all') users = users.filter(u => u.subRole === subRole);

    if (users.length === 0) throw new Error("Kriterlere uygun alıcı bulunamadı.");
    
    const { cleanSubject, cleanBody } = prepareMessage(subject, body);
    const fullSubject = `[DUYURU] ${cleanSubject}`;

    // 2. Batch Chunking ile Gönder
    const CHUNK_SIZE = 500;
    for (let i = 0; i < users.length; i += CHUNK_SIZE) {
        const chunk = users.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(user => {
            batch.set(doc(collection(db, "messages")), {
                senderId: actor.uid,
                senderName: "BELLONA MERKEZ",
                receiverId: user.id,
                receiverName: `${user.name} ${user.surname || ''}`,
                subject: fullSubject,
                content: `Sayın ${user.name} ${user.surname || ''},\n\n${cleanBody}\n\nSaygılarımla,\nBellona Fabrikası`,
                status: "active",
                isRead: false,
                timestamp: serverTimestamp(),
                type: "announcement"
            });
        });
        await batch.commit();
    }

    await writeAuditLog({
        actor,
        action: "TOPLU_DUYURU",
        targetType: "broadcast",
        targetId: `${target}/${region}/${subRole}`,
        detail: `"${subject}" konulu duyuru ${users.length} kişiye gönderildi.`
    });

    return users.length;
}

export async function sendDirectMessage({ receiverId, receiverName, subject, body }) {
    const actor = await getSessionActor();
    const { cleanSubject, cleanBody } = prepareMessage(subject, body);
    
    const msgData = {
        senderId: actor.uid,
        senderName: "BELLONA MERKEZ",
        receiverId,
        receiverName,
        subject: cleanSubject,
        content: `Sayın ${receiverName},\n\n${cleanBody}\n\nSaygılarımla,\nBellona Fabrikası`,
        status: "active",
        isRead: false,
        timestamp: serverTimestamp(),
        type: "direct"
    };

    const docRef = await addDoc(collection(db, "messages"), msgData);

    await writeAuditLog({
        actor,
        action: "BIREYSEL_MESAJ",
        targetType: "user",
        targetId: receiverId,
        detail: `"${subject}" konulu bireysel mesaj gönderildi.`
    });

    return docRef.id;
}

function prepareMessage(subject, body) {
    const cleanSubject = subject
        .replace(/\[DUYURU\]/gi, '')
        .replace(/Sayın\s*\[.*?\][.,\s]*/gi, '')
        .replace(/\[Alıcı Adı\][.,\s]*/gi, '')
        .trim();

    const cleanBody = body
        .replace(/Sayın\s*\[.*?\][.,\s]*/gi, '')
        .replace(/\[Alıcı Adı\][.,\s]*/gi, '')
        .replace(/\[Gönderen Adı\]\s*\/\s*\[Şirket Adı\]/gi, '')
        .replace(/Saygılarımla,/gi, '')
        .replace(/Bellona Fabrikası/gi, '')
        .replace(/Bilgilerinize sunar, iyi çalışmalar dilerim\./gi, '')
        .replace(/Bilgilerinize sunar/gi, '')
        .replace(/^\s*[,.;:]\s*/, '')
        .trim();

    return { cleanSubject, cleanBody };
}
