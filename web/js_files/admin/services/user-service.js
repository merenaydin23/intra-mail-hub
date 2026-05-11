import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    orderBy,
    query,
    updateDoc,
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

import { getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Belirli bir kullanıcıyı ID ile çeker.
 */
export async function getUserById(userId) {
    if (!userId) return null;
    try {
        const d = await getDoc(doc(db, "users", userId));
        return d.exists() ? { id: d.id, ...d.data() } : null;
    } catch (e) {
        console.error("getUserById hatası:", e);
        return null;
    }
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "../../firebase/config.js";

/**
 * Yeni kullanıcı oluşturur (Cloud Function yerine Frontend üzerinden).
 * Admin'in oturumunun düşmemesi için ikincil bir Firebase App kullanır.
 */
export async function createUserRecord(data) {
    try {
        // İkincil bir Firebase uygulaması başlat (Ana admin oturumu bozulmasın)
        const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp" + Date.now());
        const secondaryAuth = getAuth(secondaryApp);

        // 1. Auth üzerinde kullanıcı oluştur
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.password);
        const newUid = userCred.user.uid;

        // 2. İkincil hesaptan hemen çıkış yap
        await secondaryAuth.signOut();

        // 3. Firestore'a kullanıcı verilerini yaz
        const { password, ...firestoreData } = data;
        await setDoc(doc(db, "users", newUid), {
            ...firestoreData,
            uid: newUid,
            createdAt: serverTimestamp(),
        });

        console.log(`[createUserLocal] Başarıyla eklendi: ${data.email}`);
        return { success: true, uid: newUid, email: data.email };

    } catch (error) {
        console.error("Local Create User Hatası:", error);
        if (error.code === 'auth/email-already-in-use') {
            throw new Error("Bu e-posta adresi zaten kullanımda!");
        }
        throw new Error(error.message);
    }
}

/**
 * Kullanıcıyı Firestore'dan siler.
 */
export async function removeUserRecord(userId) {
    return deleteDoc(doc(db, "users", userId));
}

/**
 * Kullanıcının aktiflik durumunu günceller.
 */
export async function updateUserStatus(userId, isActive) {
    return updateDoc(doc(db, "users", userId), {
        isActive: isActive,
        updatedAt: serverTimestamp()
    });
}
