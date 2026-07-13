import { collection, getDocs, deleteDoc, doc, limit, orderBy, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

export async function getAllMessages(max = 50) {
    try {
        const q = query(collection(db, "messages"), orderBy("timestamp", "desc"), limit(max));
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.error("Mesajlar yüklenemedi:", error);
        return [];
    }
}

export async function deleteMessage(messageId) {
    try {
        await deleteDoc(doc(db, "messages", messageId));
    } catch (error) {
        console.error("Mesaj silinemedi:", error);
        throw error;
    }
}
