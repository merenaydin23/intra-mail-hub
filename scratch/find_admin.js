import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

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

async function findAdmin() {
    try {
        const q = query(collection(db, "users"), where("role", "==", "admin"));
        const snap = await getDocs(q);
        if (snap.empty) {
            console.log("No admin found in Firestore.");
        } else {
            snap.forEach(doc => {
                const data = doc.data();
                console.log("Admin Found:");
                console.log(`Email: ${data.email}`);
                console.log(`Password in DB: ${data.password || "NOT SAVED IN DB"}`);
                console.log("-------------------");
            });
        }
    } catch (err) {
        console.error("Error:", err);
    }
    process.exit();
}

findAdmin();
