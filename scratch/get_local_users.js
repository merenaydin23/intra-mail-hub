import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, limit } from "firebase/firestore";

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

async function getLocalUsers() {
    const q = query(collection(db, "users"), where("category", "==", "local"), limit(5));
    const snap = await getDocs(q);
    snap.forEach(doc => {
        const data = doc.data();
        console.log(`Email: ${data.email} | Password: ${data.password || 'Bellona123!'} | Name: ${data.name} ${data.surname}`);
    });
    process.exit();
}

getLocalUsers();
