import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase yapılandırma ayarlarınız - Firebase Console'dan alacağınız bilgilerle değiştirin
const firebaseConfig = {
  apiKey: "SENIN_API_KEY",
  authDomain: "projen.firebaseapp.com",
  projectId: "projen",
  storageBucket: "projen.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
