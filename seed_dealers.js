import { db } from './web/js_files/firebase/config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const dealers = [
    { name: "Karavil", surname: "Group", email: "karavil.group@bellona.com.tr", password: "kRv!89pL12", company: "Karavil Group", category: "regional", subRole: "manager" },
    { name: "Atasaylar", surname: "Group", email: "atasaylar.group@bellona.com.tr", password: "aTs#44mK56", company: "Atasaylar Group", category: "regional", subRole: "manager" },
    { name: "Karavil", surname: "Marmara", email: "karavil.marmara@bellona.com.tr", password: "mRm*23zX90", company: "Karavil Marmara", category: "regional", subRole: "manager" },
    { name: "Horazan", surname: "Group", email: "horazan.group@bellona.com.tr", password: "hRz@11vB78", company: "Horazan Group", category: "regional", subRole: "manager" },
    { name: "Gümüşbaşlar", surname: "Birliği", email: "gumusbaslar.birligi@bellona.com.tr", password: "gMs$77nJ34", company: "Gümüşbaşlar Şirket Birliği", category: "regional", subRole: "manager" },
    { name: "Yılmaz", surname: "Group", email: "yilmaz.group@bellona.com.tr", password: "yLm%55dQ11", company: "Yılmaz Group", category: "regional", subRole: "manager" },
    { name: "Damla Mobilya", surname: "Group Ege", email: "damla.mobilya@bellona.com.tr", password: "dMl&66rW22", company: "Damla Mobilya Group Ege", category: "regional", subRole: "manager" }
];

async function seed() {
    console.log("Bölge Bayileri ekleniyor...");
    for (const d of dealers) {
        await addDoc(collection(db, "users"), {
            ...d,
            role: "user",
            isActive: true,
            region: "Belirtilmedi",
            department: "Yönetici / Patron",
            createdAt: serverTimestamp()
        });
        console.log(`✅ ${d.company} eklendi.`);
    }
    console.log("İşlem tamam!");
}

seed();
