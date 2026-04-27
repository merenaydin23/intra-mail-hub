import { auth, db } from "../../firebase/config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function getSessionActor() {
    const user = auth.currentUser;
    if (!user) {
        return { uid: "anonymous", name: "Anonim Oturum", email: "unknown@local" };
    }

    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) {
            return { uid: user.uid, name: user.displayName || "Bilinmeyen Kullanıcı", email: user.email || "-" };
        }
        const data = snap.data();
        return {
            uid: user.uid,
            name: `${data.name || ""} ${data.surname || ""}`.trim() || data.email || "Bilinmeyen Kullanıcı",
            email: data.email || user.email || "-"
        };
    } catch (error) {
        console.error("Actor okunamadı:", error);
        return { uid: user.uid, name: user.displayName || "Bilinmeyen Kullanıcı", email: user.email || "-" };
    }
}
