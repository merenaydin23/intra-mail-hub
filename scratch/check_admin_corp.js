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

async function checkAdmin() {
    try {
        const q = query(collection(db, "users"), where("email", "==", "admin@intramail.corp"));
        const snap = await getDocs(q);
        if (snap.empty) {
            console.log("admin@intramail.corp NOT FOUND.");
        } else {
            snap.forEach(doc => {
                console.log("admin@intramail.corp FOUND.");
                console.log(doc.data());
            });
        }
    } catch (err) {
        console.error(err);
    }
    process.exit();
}

checkAdmin();
