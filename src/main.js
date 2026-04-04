import { auth, db } from './firebase/config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

// GEÇİCİ ADMİN OLUŞTURUCU (Sayfa yüklenince 1 defa otomatik çalışır)
async function createAdminEren() {
  try {
    const cred = await createUserWithEmailAndPassword(auth, "eren@intramail.corp", "123456");
    await setDoc(doc(db, "users", cred.user.uid), {
      name: "Eren Aydın",
      email: "eren@intramail.corp",
      role: "admin",
      department: "Yönetim",
      isActive: true,
      createdAt: new Date().toISOString()
    });
    console.log("🔥 Admin hesabı (Eren Aydın) başarıyla db'ye işlendi! Login olabilirsiniz.");
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log("Admin hesabı zaten kayıtlı, giriş yapabilirsiniz.");
    } else {
      console.error("Admin kayıt hatası:", err);
    }
  }
}
// createAdminEren(); // Admin zaten oluştursa yoruma alabiliriz ya da her seferinde kontrol edebilir.

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

    // Uzantı kontrolü (@intramail.corp)
    if (!email.endsWith('@intramail.corp')) {
      throw new Error("Sadece @intramail.corp uzantılı hesaplar giriş yapabilir.");
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
      
      // Rol bazlı yönlendirme (Sadece Admin yetkilidir)
      setTimeout(() => {
        if (userData.role === 'admin') {
          window.location.href = '/admin.html';
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
