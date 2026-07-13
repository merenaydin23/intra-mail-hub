import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, limit, getDocs } from "firebase/firestore";

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

async function inspectMessages() {
    const q = query(collection(db, "messages"), limit(3));
    const snap = await getDocs(q);
    snap.forEach(doc => {
        console.log("ID:", doc.id);
        console.log("Data:", JSON.stringify(doc.data(), null, 2));
        console.log("-------------------");
    });
    process.exit();
}

inspectMessages();
