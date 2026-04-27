import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    orderBy,
    query,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

export async function getAllUsers() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createUserRecord(data) {
    return addDoc(collection(db, "users"), { ...data, createdAt: serverTimestamp() });
}

export async function removeUserRecord(userId) {
    return deleteDoc(doc(db, "users", userId));
}
