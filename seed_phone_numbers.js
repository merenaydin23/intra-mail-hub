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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function randomDigits(count) {
    let result = "";
    for (let i = 0; i < count; i += 1) {
        result += Math.floor(Math.random() * 10).toString();
    }
    return result;
}

function generatePhone() {
    const operatorCodes = ["500", "501", "505", "506", "507", "530", "531", "532", "533", "534", "535", "536", "537", "538", "539", "540", "541", "542", "543", "544", "545", "546", "547", "548", "549", "550", "551", "552", "553", "554", "555", "559"];
    const code = operatorCodes[Math.floor(Math.random() * operatorCodes.length)];
    const rest = randomDigits(7);
    return `+90 ${code} ${rest.slice(0, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)}`;
}

async function seedPhones() {
    const usersRef = collection(db, "users");
    const snap = await getDocs(usersRef);

    if (snap.empty) {
        console.log("Users koleksiyonunda kayıt yok.");
        return;
    }

    let count = 0;
    for (const userDoc of snap.docs) {
        const phone = generatePhone();
        await updateDoc(doc(db, "users", userDoc.id), { phone });
        count += 1;
        console.log(`Guncellendi: ${userDoc.id} -> ${phone}`);
    }

    console.log(`Tamamlandi. Toplam ${count} kayda telefon numarasi eklendi.`);
}

seedPhones()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Telefon seed islemi hatasi:", err);
        process.exit(1);
    });
