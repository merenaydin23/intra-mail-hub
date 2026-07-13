import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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

async function listAdmins() {
    try {
        const snap = await getDocs(collection(db, "users"));
        snap.forEach(doc => {
            const data = doc.data();
            if (data.role === "admin") {
                console.log(`Email: ${data.email} | Password: ${data.password || "N/A"}`);
            }
        });
    } catch (err) {
        console.error(err);
    }
    process.exit();
}

listAdmins();
