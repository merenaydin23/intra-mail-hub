import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";

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
const auth = getAuth(app);

const REGION_CITY_MAP = {
    "Marmara": ["İstanbul", "Edirne", "Kırklareli", "Tekirdağ", "Kocaeli", "Sakarya", "Yalova", "Bursa", "Balıkesir", "Çanakkale", "Bilecik"],
    "Ege": ["İzmir", "Manisa", "Aydın", "Denizli", "Muğla", "Kütahya", "Uşak", "Afyonkarahisar"],
    "Akdeniz": ["Antalya", "Adana", "Mersin", "Hatay", "Isparta", "Burdur", "Kahramanmaraş", "Osmaniye"],
    "İç Anadolu": ["Ankara", "Konya", "Kayseri", "Eskişehir", "Sivas", "Yozgat", "Kırıkkale", "Aksaray", "Niğde", "Kırşehir", "Nevşehir", "Karaman", "Çankırı"],
    "Karadeniz": ["Samsun", "Trabzon", "Ordu", "Giresun", "Rize", "Artvin", "Gümüşhane", "Bayburt", "Amasya", "Tokat", "Çorum", "Sinop", "Kastamonu", "Bartın", "Karabük", "Zonguldak", "Düzce", "Bolu"],
    "Doğu Anadolu": ["Erzurum", "Erzincan", "Kars", "Ağrı", "Iğdır", "Ardahan", "Malatya", "Elazığ", "Bingöl", "Tunceli", "Van", "Muş", "Bitlis", "Hakkari"],
    "Güneydoğu Anadolu": ["Gaziantep", "Şanlıurfa", "Diyarbakır", "Mardin", "Batman", "Siirt", "Şırnak", "Kilis", "Adıyaman"]
};

const NAMES = ["Ahmet", "Mehmet", "Ali", "Hasan", "Hüseyin", "Fatma", "Ayşe", "Emine", "Hatice", "Zeynep", "Burak", "Can", "Murat", "Hakan", "Elif", "Selin", "Gizem", "Cem", "Deniz", "Ege"];
const SURNAMES = ["Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Yıldız", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara", "Koç", "Kurt", "Bulut", "Korkmaz", "Erdoğan"];

function normalizeTr(str) {
    return str.replace(/İ/g, "i").replace(/I/g, "i").toLowerCase()
        .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ö/g, "o")
        .replace(/ş/g, "s").replace(/ü/g, "u").replace(/ı/g, "i").replace(/\s+/g, "");
}

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randPhone() { return `+90 5${Math.floor(10+Math.random()*40)} ${Math.floor(100+Math.random()*899)} ${Math.floor(10+Math.random()*89)} ${Math.floor(10+Math.random()*89)}`; }
function randDate() { 
    const year = Math.floor(1970 + Math.random() * 30);
    const month = String(Math.floor(1 + Math.random() * 12)).padStart(2, '0');
    const day = String(Math.floor(1 + Math.random() * 28)).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function seedData() {
    let results = [];
    console.log("Seeding started. This may take a few minutes...");

    for (const [region, cities] of Object.entries(REGION_CITY_MAP)) {
        for (const city of cities) {
            const companyName = `${city} Ticaret`;
            const dealerCode = String(Math.floor(1000 + Math.random() * 9000));
            
            // 1 Manager, 1 Employee per city
            const roles = ["manager", "employee"];
            
            for (const subRole of roles) {
                const name = rand(NAMES);
                const surname = rand(SURNAMES);
                const email = `${normalizeTr(name)}.${normalizeTr(surname)}.${dealerCode}@bellona.com.tr`;
                const password = "Bellona123!";
                
                try {
                    const userCred = await createUserWithEmailAndPassword(auth, email, password);
                    const uid = userCred.user.uid;
                    await signOut(auth);

                    const data = {
                        name,
                        surname,
                        birthDate: randDate(),
                        phone: randPhone(),
                        city,
                        category: "local",
                        region,
                        company: companyName,
                        dealerCode,
                        subRole,
                        email,
                        department: subRole === "manager" ? "Bayi Sahibi" : "Mağaza Satış Temsilcisi",
                        password,
                        role: "user",
                        isActive: true,
                        uid,
                        createdAt: serverTimestamp()
                    };

                    await setDoc(doc(db, "users", uid), data);
                    console.log(`+ ${city} -> ${email} (${subRole})`);
                    results.push(`${city} | ${companyName} #${dealerCode} | ${email} | Pw: ${password} | Rol: ${subRole}`);
                } catch (err) {
                    if (err.code === "auth/email-already-in-use") {
                        console.log(`- Skiping ${email} (already exists)`);
                    } else {
                        console.error(`! Error creating ${email}:`, err.message);
                    }
                }
            }
        }
    }
    
    console.log("\n=== SEEDING COMPLETED ===");
    console.log(`Generated ${results.length} users.`);
    
    import('fs').then(fs => {
        fs.writeFileSync('scratch/generated_users.txt', results.join('\n'));
        console.log("Saved list to scratch/generated_users.txt");
        process.exit(0);
    });
}

seedData();
