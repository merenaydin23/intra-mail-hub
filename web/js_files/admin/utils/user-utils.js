import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

export function normalizeTr(text) {
    if (!text) return "";
    return text.trim().toLowerCase()
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .replace(/\s+/g, ".")
        .replace(/[^a-z0-9.]/g, "");
}

export function generateStrictPassword() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const nums = "0123456789";
    const syms = "!@#$%^&*";
    const pw = [];
    for (let i = 0; i < 6; i += 1) pw.push(chars[Math.floor(Math.random() * chars.length)]);
    for (let i = 0; i < 2; i += 1) pw.push(nums[Math.floor(Math.random() * nums.length)]);
    for (let i = 0; i < 2; i += 1) pw.push(syms[Math.floor(Math.random() * syms.length)]);
    return pw.sort(() => Math.random() - 0.5).join("");
}

export async function generateEnterpriseEmail(name, surname) {
    const base = `${normalizeTr(name)}.${normalizeTr(surname)}`;
    let email = `${base}@bellona.com.tr`;
    const usersRef = collection(db, "users");

    let snap = await getDocs(query(usersRef, where("email", "==", email)));
    if (snap.empty) return email;

    let i = 2;
    while (!snap.empty) {
        email = `${base}${i}@bellona.com.tr`;
        snap = await getDocs(query(usersRef, where("email", "==", email)));
        i += 1;
    }
    return email;
}
