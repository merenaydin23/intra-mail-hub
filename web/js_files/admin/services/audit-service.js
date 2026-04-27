import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

export async function writeAuditLog({ actor, action, targetType, targetId, detail }) {
    try {
        await addDoc(collection(db, "auditLogs"), {
            actorUid: actor?.uid || "unknown",
            actorName: actor?.name || "Bilinmeyen kullanıcı",
            actorEmail: actor?.email || "-",
            action,
            targetType,
            targetId: targetId || "-",
            detail: detail || "",
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Audit log yazılamadı:", error);
    }
}

export async function getAuditLogs(max = 30) {
    const snap = await getDocs(query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(max)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
