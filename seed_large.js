import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCP6ywEHkZKzUb-QqDDMaubuffGznMeUc0",
    authDomain: "bellona-71bee.firebaseapp.com",
    projectId: "bellona-71bee",
    storageBucket: "bellona-71bee.firebasestorage.app",
    messagingSenderId: "622122795654",
    appId: "1:622122795654:web:9a42d0026d5df595f68707"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const names = ["Ahmet", "Mehmet", "Ayşe", "Fatma", "Mustafa", "Zeynep", "Ali", "Hüseyin", "Elif", "Emine", "Murat", "Selin", "Burak", "Derya", "Can", "Merve", "Hakan", "Esra", "Serkan", "Özlem"];
const surnames = ["Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Yıldız", "Aydın", "Öztürk", "Arslan", "Doğan", "Kılıç", "Bulut", "Korkmaz", "Erdoğan", "Güneş"];
const regions = ["Marmara", "Ege", "İç Anadolu", "Akdeniz", "Karadeniz", "Doğu Anadolu", "Güneydoğu Anadolu"];
const localDepts = ["Mağaza Satış Temsilcisi", "Mağaza Muhasebe", "Mağaza Teknik Servis", "Mağaza Depo Sorumlusu"];
const regionalDepts = ["Bölge Pazarlama Sorumlusu", "Bölge Muhasebe Müdürü", "Bölge Sevkiyat Koordinatörü", "Bölge Satış Yönetimi"];

async function seed() {
    try {
        console.log("🚀 Seeding starting...");

        // 1. REGIONAL DEALER (1 instance with 25 employees)
        const regName = "Karavil Group (Abdulkadir Karavil)";
        const regRegion = "İç Anadolu";
        console.log(`Creating Regional Dealer: ${regName} with 25 employees...`);
        
        for (let i = 0; i < 25; i++) {
            const name = names[Math.floor(Math.random() * names.length)];
            const surname = surnames[Math.floor(Math.random() * surnames.length)];
            const email = `${name.toLowerCase()}.${surname.toLowerCase()}.${Math.floor(Math.random()*1000)}@bellona.com.tr`;
            
            await addDoc(collection(db, "users"), {
                name: name,
                surname: surname,
                email: email,
                password: "Bellona123!",
                role: "user",
                subRole: i === 0 ? "manager" : "employee",
                category: "regional",
                region: regRegion,
                company: regName,
                department: i === 0 ? "Bölge Koordinatörü" : regionalDepts[Math.floor(Math.random() * regionalDepts.length)],
                isActive: true,
                birthDate: `19${Math.floor(Math.random() * 40) + 60}-0${Math.floor(Math.random() * 9) + 1}-0${Math.floor(Math.random() * 9) + 1}`,
                createdAt: serverTimestamp()
            });
        }

        // 2. LOCAL DEALERS (5 instances with 8 employees each)
        const localCompanies = ["Yıldız Mobilya", "Kaya Concept", "Demir Palace", "Arslan Ev Gereçleri", "Öztürk Bellona"];
        
        for (const company of localCompanies) {
            const region = regions[Math.floor(Math.random() * regions.length)];
            console.log(`Creating Local Dealer: ${company} with 8 employees in ${region}...`);
            
            for (let i = 0; i < 8; i++) {
                const name = names[Math.floor(Math.random() * names.length)];
                const surname = surnames[Math.floor(Math.random() * surnames.length)];
                const email = `${name.toLowerCase()}.${surname.toLowerCase()}.${Math.floor(Math.random()*1000)}@bellona.com.tr`;
                
                await addDoc(collection(db, "users"), {
                    name: name,
                    surname: surname,
                    email: email,
                    password: "Bellona123!",
                    role: "user",
                    subRole: i === 0 ? "manager" : "employee",
                    category: "local",
                    region: region,
                    company: company,
                    department: i === 0 ? "Mağaza Sahibi / Patron" : localDepts[Math.floor(Math.random() * localDepts.length)],
                    isActive: true,
                    birthDate: `19${Math.floor(Math.random() * 40) + 60}-0${Math.floor(Math.random() * 9) + 1}-0${Math.floor(Math.random() * 9) + 1}`,
                    createdAt: serverTimestamp()
                });
            }
        }

        console.log("✅ Seeding completed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding failed:", error);
        process.exit(1);
    }
}

seed();
