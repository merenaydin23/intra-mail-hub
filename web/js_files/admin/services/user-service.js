import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    orderBy,
    query,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { db, functions } from "../../firebase/config.js";

/**
 * Tüm kullanıcıları Firestore'dan çeker.
 */
export async function getAllUsers() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Yeni kullanıcı oluşturur.
 * Firebase Auth + Firestore'u atomik olarak oluşturan Cloud Function'ı çağırır.
 * Böylece kullanıcı hem admin panelde görünür hem de şifresiyle giriş yapabilir.
 */
export async function createUserRecord(data) {
    const createUserFn = httpsCallable(functions, "createUser");
    const result = await createUserFn(data);
    return result.data; // { success: true, uid, email }
}

/**
 * Kullanıcıyı Firestore'dan siler.
 * NOT: Firebase Auth kaydını silmek için ayrı bir Cloud Function gerekir (opsiyonel).
 */
export async function removeUserRecord(userId) {
    return deleteDoc(doc(db, "users", userId));
}
