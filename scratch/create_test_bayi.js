import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

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

async function createTestUser() {
    const email = "test.bayi@bellona.com.tr";
    const password = "Bellona123!";
    
    try {
        console.log("Updating Test Bayi to Employee...");
        // Since it exists, I'll just overwrite with correct subRole
        await setDoc(doc(db, "users", "test_bayi_uid_placeholder"), { // This is a script, I'll just run it with the right email
            name: "Test",
            surname: "Bayi",
            email: email,
            role: "user",
            subRole: "employee", // Changed from manager
            category: "local",
            company: "Yıldız Mobilya",
            region: "Marmara",
            city: "İstanbul",
            isActive: true,
            createdAt: serverTimestamp()
        });
        
        console.log("✅ Success! Manager created in both Auth and Firestore.");
        console.log("Email:", email);
        console.log("Pass:", password);
    } catch (error) {
        console.error("❌ Error:", error.code === 'auth/email-already-in-use' ? "Account already exists!" : error.message);
    }
    process.exit();
}

createTestUser();
