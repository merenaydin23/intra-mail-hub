import { auth, db } from './firebase/config.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const messageDiv = document.getElementById('message');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kimlik doğrulanıyor...';
    messageDiv.style.color = "var(--primary)";

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Firestore'dan rol ve durum kontrolü
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        if (!userData.isActive) {
          throw new Error("Hesabınız pasif durumdadır. Lütfen yönetici ile iletişime geçin.");
        }

        messageDiv.innerHTML = `✅ Hoş geldin ${userData.name}! Sisteme yönlendiriliyorsunuz...`;
        messageDiv.style.color = "var(--success)";
        
        // Rol bazlı sayfaya yönlendirme
        setTimeout(() => {
          if (userData.role === 'admin') {
            window.location.href = './yonetim.html';
          } else if (userData.role === 'factory') {
            window.location.href = './fabrika.html';
          } else if (userData.role === 'regional') {
            window.location.href = './bolge.html';
          } else if (userData.role === 'local') {
            window.location.href = './yerel.html';
          } else {
            window.location.href = './calisan.html';
          }
        }, 1200);
      } else {
        throw new Error("Kullanıcı kaydı doğrulanamadı. Firestore verisi eksik.");
      }

    } catch (error) {
      let errorMsg = error.message;
      if (error.code === 'auth/invalid-credential') errorMsg = "E-posta veya şifre hatalı!";
      if (error.code === 'auth/user-not-found') errorMsg = "Böyle bir kullanıcı tanımlı değil!";
      
      messageDiv.innerHTML = `❌ Hata: ${errorMsg}`;
      messageDiv.style.color = "var(--danger)";
      console.error(error);
    }
  });
}
