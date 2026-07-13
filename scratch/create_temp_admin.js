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

async function createAdmin() {
  const email = "tempadmin@intramail.corp";
  const password = "Bellona123!";
  
  try {
    console.log("Creating user in Auth...");
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;
    console.log(`Auth user created successfully with UID: ${uid}`);

    console.log("Creating user document in Firestore...");
    await setDoc(doc(db, "users", uid), {
      uid: uid,
      name: "Temp",
      surname: "Admin",
      email: email,
      role: "admin",
      subRole: "admin",
      category: "admin",
      isActive: true,
      createdAt: new Date()
    });
    console.log("Firestore user document created with admin role successfully!");
  } catch (err) {
    console.error("Error creating admin:", err);
  }
  process.exit(0);
}

createAdmin();
