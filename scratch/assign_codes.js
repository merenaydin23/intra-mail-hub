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

function normalizeTr(text) {
    if (!text) return "";
    return text.toString()
        .replace(/İ/g, "i")
        .replace(/I/g, "i")
        .replace(/Ş/g, "s")
        .replace(/Ğ/g, "g")
        .replace(/Ü/g, "u")
        .replace(/Ö/g, "o")
        .replace(/Ç/g, "c")
        .replace(/ı/g, "i")
        .replace(/ş/g, "s")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .toLowerCase();
}

async function assignDealerCodes() {
    console.log("Fetching all users...");
    const snap = await getDocs(collection(db, "users"));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const dealerCodes = {
        "Bellona Genel Müdürlük": "0000",
        "Ay-Ka": "2145"
    };

    const usedCodes = new Set(Object.values(dealerCodes));

    const getUniqueCode = () => {
        let code;
        do {
            code = Math.floor(1000 + Math.random() * 9000).toString();
        } while (usedCodes.has(code));
        usedCodes.add(code);
        return code;
    };

    console.log("Assigning codes and updating emails...");
    let updateCount = 0;
    for (const u of users) {
        if (!u.company) continue;
        
        let code = dealerCodes[u.company];
        if (!code) {
            code = getUniqueCode();
            dealerCodes[u.company] = code;
        }

        const newEmail = `${normalizeTr(u.name)}.${normalizeTr(u.surname)}.${code}@bellona.com.tr`;
        
        console.log(`Updating ${u.name} ${u.surname} (${u.company}) -> Code: ${code}, Email: ${newEmail}`);
        await updateDoc(doc(db, "users", u.id), {
            dealerCode: code,
            email: newEmail
        });
        updateCount++;
    }

    console.log(`Done! Updated ${updateCount} user records.`);
    process.exit();
}

assignDealerCodes().catch(err => {
    console.error(err);
    process.exit(1);
});
