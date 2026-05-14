/**
 * repair_user.js
 * Firestore'da dokümanı eksik olan kullanıcı için kurtarma scripti.
 * 
 * KULLANIM:
 *   node repair_user.js
 */

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import readline from "readline";

const firebaseConfig = {
  apiKey: "AIzaSyCP6ywEHkZKzUb-QqDDMaubuffGznMeUc0",
  authDomain: "bellona-71bee.firebaseapp.com",
  projectId: "bellona-71bee",
  storageBucket: "bellona-71bee.firebasestorage.app",
  messagingSenderId: "622122795654",
  appId: "1:622122795654:web:9a42d0026d5df595f68707"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

async function main() {
  console.log("\n===== INTRAMAIL HUB — Kullanıcı Kurtarma Aracı =====\n");

  const email    = await ask("Etkilenen kullanıcının E-postası: ");
  const password = await ask("Şifresi (Auth'ta hâlâ geçerli): ");

  console.log("\nKimlik doğrulanıyor...");
  let uid;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    uid = cred.user.uid;
    console.log(`✅ Auth başarılı — UID: ${uid}`);
  } catch (e) {
    console.error("❌ Auth hatası:", e.message);
    rl.close();
    process.exit(1);
  }

  // Firestore kontrolü
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    console.log("ℹ️  Bu kullanıcının Firestore kaydı MEVCUT. Sorun başka bir yerde.");
    console.log("Mevcut veri:", JSON.stringify(snap.data(), null, 2));
    rl.close();
    return;
  }

  console.log("⚠️  Firestore kaydı YOK. Yeniden oluşturuluyor...\n");

  const name      = await ask("Ad: ");
  const surname   = await ask("Soyad: ");
  const role      = await ask("Rol (admin / factory / regional / local): ");
  const category  = await ask("Kategori (admin / factory / regional / local): ");
  const company   = await ask("Şirket adı: ");
  const region    = await ask("Bölge (örn: İç Anadolu): ");
  const city      = await ask("Şehir: ");
  const phone     = await ask("Telefon (boş bırakılabilir): ");

  const userData = {
    uid,
    name,
    surname,
    email,
    role,
    category,
    company,
    region,
    city,
    phone,
    dealerCode: role === "admin" ? "0000" : "",
    subRole: role === "admin" ? "manager" : "employee",
    isActive: true,
    createdAt: serverTimestamp(),
    repairedAt: serverTimestamp(),
    repairedBy: "repair_user.js"
  };

  try {
    await setDoc(doc(db, "users", uid), userData);
    console.log("\n✅ Firestore kaydı başarıyla oluşturuldu!");
    console.log("Kullanıcı artık sisteme giriş yapabilir.");
  } catch (e) {
    console.error("❌ Firestore yazma hatası:", e.message);
  }

  rl.close();
}

main();
