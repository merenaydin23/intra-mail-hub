/**
 * @file main.js
 * @description Uygulamanın ana giriş noktasıdır. Kullanıcı giriş (Login) işlemlerini yönetir,
 * Firebase Authentication ile kimlik doğrulaması yapar ve Firestore'dan kullanıcı rolünü çekerek
 * ilgili portala/sayfaya yönlendirme sağlar.
 */

import { auth, db } from './firebase/config.js'; // Firebase konfigürasyon ve bağlantı nesneleri
import { signInWithEmailAndPassword, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"; // Giriş fonksiyonu
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; // Veritabanı okuma ve güncelleme fonksiyonları

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const messageDiv = document.getElementById('message');

// Password Toggle Logic
const togglePassword = document.getElementById('togglePassword');
if (togglePassword && passwordInput) {
  togglePassword.addEventListener('click', function() {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    this.classList.toggle('fa-eye');
    this.classList.toggle('fa-eye-slash');
  });
}

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
            window.location.href = '/pages/admin/yonetim.html';
          } else if (userData.role === 'factory') {
            window.location.href = '/pages/portals/fabrika.html';
          } else if (userData.role === 'regional') {
            window.location.href = '/pages/portals/bolge.html';
          } else if (userData.role === 'local') {
            window.location.href = '/pages/portals/yerel.html';
          } else {
            window.location.href = '/pages/portals/calisan.html';
          }
        }, 1200);
      } else {
        // Firestore kaydı eksik → repair sayfasına yönlendir
        messageDiv.innerHTML = `⚠️ Sistem kaydınız bulunamadı. Onarım sayfasına yönlendiriliyorsunuz...`;
        messageDiv.style.color = "#f59e0b";
        setTimeout(() => {
          window.location.href = `/repair.html?email=${encodeURIComponent(email)}`;
        }, 1500);
        return;
      }

    } catch (error) {
      let errorMsg = error.message;
      if (error.code === 'auth/invalid-credential') errorMsg = "E-posta veya şifre hatalı!";
      if (error.code === 'auth/user-not-found') errorMsg = "Böyle bir kullanıcı tanımlı değil!";
      if (error.code === 'auth/too-many-requests') errorMsg = "Çok fazla hatalı deneme yaptınız. Güvenliğiniz için hesabınız geçici olarak kilitlendi. Lütfen birkaç dakika sonra tekrar deneyin.";
      if (error.code === 'auth/network-request-failed') errorMsg = "İnternet bağlantınızı kontrol edin!";
      
      messageDiv.innerHTML = `❌ Hata: ${errorMsg}`;
      messageDiv.style.color = "var(--error)";
      console.error(error);
    }
  });
}

import { collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Forgot Password Modal Logic
const forgotPasswordLink = document.querySelector('.forgot-password');
const modal = document.getElementById('forgot-password-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const forgotForm = document.getElementById('forgot-password-form');
const forgotMessage = document.getElementById('forgot-message');
const forgotNameIn = document.getElementById('forgot-name');
const forgotSurnameIn = document.getElementById('forgot-surname');

if (forgotPasswordLink && modal) {
  forgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.add('show');
    if (forgotMessage) forgotMessage.innerHTML = '';
    forgotForm.reset();
  });
}

if (closeModalBtn && modal) {
  closeModalBtn.addEventListener('click', () => {
    modal.classList.remove('show');
  });
  
  // Close on outside click
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
    }
  });
}

if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!forgotMessage) return;

    forgotMessage.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kullanıcı sorgulanıyor...';
    forgotMessage.style.color = "var(--primary)";

    function toTurkishTitleCase(str) {
      return str.split(' ').map(word => {
        if (!word) return '';
        let first = word.charAt(0);
        if (first === 'i') first = 'İ';
        else if (first === 'ı') first = 'I';
        else first = first.toUpperCase();
        
        let rest = word.slice(1);
        rest = rest.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
        
        return first + rest;
      }).join(' ');
    }

    const nameVal = toTurkishTitleCase(forgotNameIn.value.trim());
    const surnameVal = toTurkishTitleCase(forgotSurnameIn.value.trim());

    try {
      const usersCol = collection(db, "users");
      const q = query(
        usersCol,
        where("surname", "==", surnameVal)
      );

      const querySnapshot = await getDocs(q);
      let matchedDoc = null;

      querySnapshot.forEach((doc) => {
        const dbName = (doc.data().name || '').trim();
        if (dbName.toLowerCase() === nameVal.toLowerCase()) {
          matchedDoc = doc;
        }
      });

      if (matchedDoc) {
        const userData = matchedDoc.data();
        const phone = userData.phone;

        if (phone) {
          // Mask phone: +90 532 123 45 67 -> +90 532 *** ** 67
          let maskedPhone = phone;
          if (phone.length > 6) {
            maskedPhone = phone.substring(0, phone.length - 7) + "*** ** " + phone.substring(phone.length - 2);
          }
          forgotMessage.innerHTML = `✅ Otomatik şifre gönderildi: <strong>${maskedPhone}</strong> numaralı telefona SMS olarak bildirim gönderilmiştir.`;
          forgotMessage.style.color = "var(--success)";
        } else {
          forgotMessage.innerHTML = `❌ Hata: Kullanıcı bulundu fakat tanımlı telefon numarası yok!`;
          forgotMessage.style.color = "var(--error)";
        }
      } else {
        forgotMessage.innerHTML = `❌ Hata: Bu isim ve soyisimle eşleşen kullanıcı bulunamadı!`;
        forgotMessage.style.color = "var(--error)";
      }
    } catch (err) {
      console.error(err);
      forgotMessage.innerHTML = `❌ Hata: ${err.message}`;
      forgotMessage.style.color = "var(--error)";
    }
  });
}

// Change Password Modal Logic
const changePasswordLink = document.querySelector('.change-password-link');
const changePasswordModal = document.getElementById('change-password-modal');
const closeChangePwBtn = document.getElementById('close-change-pw-btn');
const changePasswordForm = document.getElementById('change-password-form');
const changePwMessage = document.getElementById('change-pw-message');

if (changePasswordLink && changePasswordModal) {
  changePasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    changePasswordModal.classList.add('show');
    if (changePwMessage) changePwMessage.innerHTML = '';
    changePasswordForm.reset();
  });
}

if (closeChangePwBtn && changePasswordModal) {
  closeChangePwBtn.addEventListener('click', () => {
    changePasswordModal.classList.remove('show');
  });
  
  // Close on outside click
  window.addEventListener('click', (e) => {
    if (e.target === changePasswordModal) {
      changePasswordModal.classList.remove('show');
    }
  });
}

if (changePasswordForm) {
  changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!changePwMessage) return;

    const email = document.getElementById('change-email').value.trim();
    const currentPw = document.getElementById('change-current-pw').value;
    const newPw = document.getElementById('change-new-pw').value;
    const confirmPw = document.getElementById('change-confirm-pw').value;

    if (newPw !== confirmPw) {
      changePwMessage.innerHTML = "❌ Hata: Yeni şifreler uyuşmuyor!";
      changePwMessage.style.color = "var(--error)";
      return;
    }

    if (newPw.length < 6) {
      changePwMessage.innerHTML = "❌ Hata: Yeni şifre en az 6 karakter olmalıdır!";
      changePwMessage.style.color = "var(--error)";
      return;
    }

    changePwMessage.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Şifreniz güncelleniyor...';
    changePwMessage.style.color = "var(--primary)";

    try {
      // 1. Authenticate with current credentials
      const userCredential = await signInWithEmailAndPassword(auth, email, currentPw);
      const user = userCredential.user;

      if (user) {
        // 2. Update Auth password
        await updatePassword(user, newPw);

        // 3. Update Firestore password field
        const userDocRef = doc(db, "users", user.uid);
        await updateDoc(userDocRef, {
          password: newPw
        });

        // 4. Sign out
        await signOut(auth);

        changePwMessage.innerHTML = "✅ Şifreniz başarıyla güncellendi! Giriş yapabilirsiniz.";
        changePwMessage.style.color = "var(--success)";

        setTimeout(() => {
          changePasswordModal.classList.remove('show');
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      let errorMsg = err.message;
      if (err.code === 'auth/invalid-credential') errorMsg = "E-posta veya mevcut şifre hatalı!";
      changePwMessage.innerHTML = `❌ Hata: ${errorMsg}`;
      changePwMessage.style.color = "var(--error)";
    }
  });
}

