import { db } from './web/js_files/firebase/config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const dealers = [
    { name: "Karavil", surname: "Group", email: "karavil.group.0007@bellona.com.tr", password: "kRv!89pL12", company: "Karavil Group", category: "regional", subRole: "manager", region: "Doğu Anadolu", dealerCode: "0007" },
    { name: "Atasaylar", surname: "Group", email: "atasaylar.group.0002@bellona.com.tr", password: "aTs#44mK56", company: "Atasaylar Group", category: "regional", subRole: "manager", region: "Ege", dealerCode: "0002" },
    { name: "Karavil", surname: "Marmara", email: "karavil.marmara.0001@bellona.com.tr", password: "mRm*23zX90", company: "Karavil Marmara", category: "regional", subRole: "manager", region: "Marmara", dealerCode: "0001" },
    { name: "Horazan", surname: "Group", email: "horazan.group.0003@bellona.com.tr", password: "hRz@11vB78", company: "Horazan Group", category: "regional", subRole: "manager", region: "İç Anadolu", dealerCode: "0003" },
    { name: "Gümüşbaşlar", surname: "Birliği", email: "gumusbaslar.birligi.0005@bellona.com.tr", password: "gMs$77nJ34", company: "Gümüşbaşlar Şirket Birliği", category: "regional", subRole: "manager", region: "Karadeniz", dealerCode: "0005" },
    { name: "Yılmaz", surname: "Group", email: "yilmaz.group.0004@bellona.com.tr", password: "yLm%55dQ11", company: "Yılmaz Group", category: "regional", subRole: "manager", region: "Akdeniz", dealerCode: "0004" },
    { name: "Damla Mobilya", surname: "Group Ege", email: "damla.mobilya.0002@bellona.com.tr", password: "dMl&66rW22", company: "Damla Mobilya Group Ege", category: "regional", subRole: "manager", region: "Ege", dealerCode: "0002" }
];

async function seed() {
    console.log("Bölge Bayileri ekleniyor...");
    for (const d of dealers) {
        await addDoc(collection(db, "users"), {
            ...d,
            role: "user",
            isActive: true,
            department: "Bölge Müdürü",
            createdAt: serverTimestamp()
        });
        console.log(`✅ ${d.company} eklendi.`);
    }
    console.log("İşlem tamam!");
}

seed();
