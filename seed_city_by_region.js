import { initializeApp } from "firebase/app";
import { collection, doc, getDocs, getFirestore, updateDoc } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCP6ywEHkZKzUb-QqDDMaubuffGznMeUc0",
    authDomain: "bellona-71bee.firebaseapp.com",
    projectId: "bellona-71bee",
    storageBucket: "bellona-71bee.firebasestorage.app",
    messagingSenderId: "622122795654",
    appId: "1:622122795654:web:9a42d0026d5df595f68707"
};

const REGION_CITY_MAP = {
    Marmara: ["Istanbul", "Bursa", "Kocaeli", "Tekirdag", "Balikesir"],
    Ege: ["Izmir", "Manisa", "Aydin", "Denizli", "Mugla"],
    "İç Anadolu": ["Ankara", "Kayseri", "Konya", "Eskisehir", "Sivas"],
    Akdeniz: ["Antalya", "Adana", "Mersin", "Hatay", "Isparta"],
    Karadeniz: ["Samsun", "Trabzon", "Ordu", "Rize", "Zonguldak"],
    "Doğu Anadolu": ["Erzurum", "Malatya", "Van", "Elazig", "Kars"],
    "Güneydoğu Anadolu": ["Gaziantep", "Sanliurfa", "Diyarbakir", "Mardin", "Batman"]
};

function pickRandomCity(region) {
    const cities = REGION_CITY_MAP[region] || [];
    if (!cities.length) return "";
    return cities[Math.floor(Math.random() * cities.length)];
}

async function seedCities() {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const snap = await getDocs(collection(db, "users"));
    if (snap.empty) {
        console.log("Users koleksiyonu bos.");
        return;
    }

    let updated = 0;
    for (const row of snap.docs) {
        const user = row.data();
        let city = "";
        if (user.category === "factory") {
            city = "Kayseri";
        } else if (user.category === "regional" || user.category === "local") {
            city = pickRandomCity(user.region);
        }
        if (!city) continue;
        await updateDoc(doc(db, "users", row.id), { city });
        updated += 1;
        console.log(`Guncellendi: ${row.id} -> ${city}`);
    }

    console.log(`Tamamlandi. ${updated} kayda sehir eklendi.`);
}

seedCities()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Sehir seed hatasi:", err);
        process.exit(1);
    });
