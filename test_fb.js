import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCP6ywEHkZKzUb-QqDDMaubuffGznMeUc0",
    authDomain: "bellona-71bee.firebaseapp.com",
    projectId: "bellona-71bee",
    storageBucket: "bellona-71bee.firebasestorage.app",
    messagingSenderId: "622122795654",
    appId: "1:622122795654:web:9a42d0026d5df595f68707"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
    try {
        console.log("Creating user...");
        // Use a random email to avoid collision
        const rand = Math.floor(Math.random() * 100000);
        const email = `test_admin_${rand}@bellona.com.tr`;
        const cred = await createUserWithEmailAndPassword(auth, email, "aB3!cD4#ef");
        console.log("User created:", cred.user.uid);
        
        console.log("Writing to Firestore...");
        await setDoc(doc(db, "users", cred.user.uid), {
            name: "Test Admin",
            email: email,
            role: "admin",
            isActive: true,
            company: "Bellona Kurumsal",
            createdAt: new Date()
        });
        console.log("Firestore write successful!");
    } catch (e) {
        console.error("ERROR CAUGHT:");
        console.error(e);
    }
    process.exit();
}

test();
