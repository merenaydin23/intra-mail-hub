import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCP6ywEHkZKzUb-QqDDMaubuffGznMeUc0",
  authDomain: "bellona-71bee.firebaseapp.com",
  projectId: "bellona-71bee",
  storageBucket: "bellona-71bee.firebasestorage.app",
  messagingSenderId: "622122795654",
  appId: "1:622122795654:web:9a42d0026d5df595f68707",
  measurementId: "G-PQEHCR2RKW"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function listUsers() {
  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    console.log("Registered Users in DB:");
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`- Email: ${data.email} | Name: "${data.name}" | Surname: "${data.surname}" | Phone: "${data.phone || 'N/A'}"`);
    });
  } catch (e) {
    console.error("Error reading users:", e);
  }
}

listUsers();
