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

async function checkUsers() {
    try {
        const q = query(collection(db, "users"), where("company", "==", "Yıldız Mobilya"));
        const snap = await getDocs(q);
        console.log("Users in Yıldız Mobilya:");
        snap.forEach(doc => {
            const u = doc.data();
            console.log(`- ${u.name} ${u.surname} | SubRole: ${u.subRole} | Email: ${u.email}`);
        });
    } catch (err) {
        console.error(err);
    }
    process.exit();
}
checkUsers();
