import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

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

const REGION_CITY_MAP = {
    "Marmara": ["İstanbul", "Edirne", "Kırklareli", "Tekirdağ", "Kocaeli", "Sakarya", "Yalova", "Bursa", "Balıkesir", "Çanakkale", "Bilecik"],
    "Ege": ["İzmir", "Manisa", "Aydın", "Denizli", "Muğla", "Kütahya", "Uşak", "Afyonkarahisar"],
    "Akdeniz": ["Antalya", "Adana", "Mersin", "Hatay", "Isparta", "Burdur", "Kahramanmaraş", "Osmaniye"],
    "İç Anadolu": ["Ankara", "Konya", "Kayseri", "Eskişehir", "Sivas", "Yozgat", "Kırıkkale", "Aksaray", "Niğde", "Kırşehir", "Nevşehir", "Karaman", "Çankırı"],
    "Karadeniz": ["Samsun", "Trabzon", "Ordu", "Giresun", "Rize", "Artvin", "Gümüşhane", "Bayburt", "Amasya", "Tokat", "Çorum", "Sinop", "Kastamonu", "Bartın", "Karabük", "Zonguldak", "Düzce", "Bolu"],
    "Doğu Anadolu": ["Erzurum", "Erzincan", "Kars", "Ağrı", "Iğdır", "Ardahan", "Malatya", "Elazığ", "Bingöl", "Tunceli", "Van", "Muş", "Bitlis", "Hakkari"],
    "Güneydoğu Anadolu": ["Gaziantep", "Şanlıurfa", "Diyarbakır", "Mardin", "Batman", "Siirt", "Şırnak", "Kilis", "Adıyaman"]
};

const allCities = Object.values(REGION_CITY_MAP).flat();

function normalizeForMatch(text) {
    if (!text) return "";
    return text.trim().toLowerCase()
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .replace(/[^a-z0-9]/g, "");
}

async function fixCityNames() {
    console.log("Fetching all users to fix city names...");
    const snap = await getDocs(collection(db, "users"));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    let updateCount = 0;
    for (const u of users) {
        if (!u.city) continue;

        const currentCity = u.city;
        const normalizedCurrent = normalizeForMatch(currentCity);
        
        // Find the correct city from the map
        const correctCity = allCities.find(c => normalizeForMatch(c) === normalizedCurrent);

        if (correctCity && correctCity !== currentCity) {
            console.log(`Fixing city for ${u.name} ${u.surname}: ${currentCity} -> ${correctCity}`);
            await updateDoc(doc(db, "users", u.id), {
                city: correctCity
            });
            updateCount++;
        }
    }

    console.log(`Done! Fixed ${updateCount} city names.`);
    process.exit();
}

fixCityNames().catch(console.error);
