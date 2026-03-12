import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDR28h-ns4E70SN8QXw5iuCyEjJcFNv0Is",
  authDomain: "intra-mail-hub.firebaseapp.com",
  projectId: "intra-mail-hub",
  storageBucket: "intra-mail-hub.firebasestorage.app",
  messagingSenderId: "1082646812541",
  appId: "1:1082646812541:web:99d7fd4d0adb8a18281e14",
  measurementId: "G-QH2SG4N9D6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
