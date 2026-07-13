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

async function listAllUsers() {
    try {
        const snap = await getDocs(collection(db, "users"));
        console.log(`Total users: ${snap.size}`);
        snap.forEach(doc => {
            const data = doc.data();
            console.log(`- ${data.email} | Role: ${data.role} | Pw: ${data.password || "N/A"}`);
        });
    } catch (err) {
        console.error(err);
    }
    process.exit();
}

listAllUsers();
