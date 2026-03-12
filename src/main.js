import { auth, db } from './firebase/config.js';
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const messageDiv = document.getElementById('message');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  messageDiv.innerHTML = "Giriş yapılıyor...";

  const email = emailInput.value;
  const password = passwordInput.value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Uzantı kontrolü (@nexmail.io)
    if (!email.endsWith('@nexmail.io')) {
      throw new Error("Sadece @nexmail.io uzantılı hesaplar giriş yapabilir.");
    }

    // Firestore'dan rol ve departman kontrolü
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      
      if (!userData.isActive) {
        throw new Error("Hesabınız aktif değil. Lütfen admin ile iletişime geçin.");
      }

      messageDiv.innerHTML = `Hoş geldin ${userData.name}! Yönlendiriliyorsunuz...`;
      
      // Rol bazlı yönlendirme
      setTimeout(() => {
        if (userData.role === 'admin') {
          window.location.href = '/admin.html';
        } else if (userData.role === 'manager') {
          window.location.href = '/manager.html';
        } else {
          window.location.href = '/inbox.html';
        }
      }, 1000);
    } else {
      throw new Error("Kullanıcı veritabanında bulunamadı.");
    }

  } catch (error) {
    messageDiv.innerHTML = `Hata: ${error.message}`;
    console.error(error);
  }
});
