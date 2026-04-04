import { auth, db } from './firebase/config.js';
import { signOut } from "firebase/auth";
import { 
  collection, getDocs, doc, getDoc, 
  query, orderBy, limit, updateDoc
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// =====================
// AUTH KONTROLÜ
// =====================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = './giris.html';
    return;
  }

  // Kullanıcı Firestore'dan oku
  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists() || userDoc.data().role !== 'admin') {
    alert("Bu sayfaya erişim yetkiniz yok!");
    window.location.href = './giris.html';
    return;
  }

  const userData = userDoc.data();
  
  // Admin bilgilerini göster
  document.getElementById('adminName').textContent = userData.name;
  const initials = userData.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('adminAvatar').textContent = initials;

  // Dashboard verilerini yükle
  loadDashboard();
  loadAllUsers();
  loadAllMessages();
});

// =====================
// TARİH
// =====================
const dateOptions = { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' };
document.getElementById('currentDate').textContent = new Date().toLocaleDateString('tr-TR', dateOptions);

// =====================
// NAVİGASYON
// =====================
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    goToSection(section);
  });
});

function goToSection(section) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

  const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (navItem) navItem.classList.add('active');
  
  const sectionEl = document.getElementById(`section-${section}`);
  if (sectionEl) sectionEl.classList.add('active');

  const titles = {
    'dashboard': 'Dashboard',
    'users': 'Kullanıcılar',
    'add-user': 'Kullanıcı Ekle',
    'messages': 'Mesajlar'
  };
  document.getElementById('pageTitle').textContent = titles[section] || section;
}
window.goToSection = goToSection;

function goToAddUser() {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelector('[data-section="add-user"]').classList.add('active');
  document.getElementById('section-add-user').classList.add('active');
  document.getElementById('pageTitle').textContent = 'Kullanıcı Ekle';
}
window.goToAddUser = goToAddUser;

// =====================
// ÇIKIŞ
// =====================
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = './giris.html';
});

// =====================
// DASHBOARD VERİLERİ
// =====================
async function loadDashboard() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const users = usersSnap.docs.map(d => d.data());

    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('activeUsers').textContent = users.filter(u => u.isActive).length;

    // Son kullanıcılar tablosu
    const tbody = document.getElementById('recentUsersTable');
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Henüz kullanıcı yok.</td></tr>';
    } else {
      tbody.innerHTML = users.slice(0, 5).map(u => `
        <tr>
          <td>${u.name}</td>
          <td>${u.email}</td>
          <td>${u.department}</td>
          <td><span class="badge badge-${u.role}">${roleLabel(u.role)}</span></td>
          <td><span class="badge ${u.isActive ? 'badge-active' : 'badge-inactive'}">${u.isActive ? 'Aktif' : 'Pasif'}</span></td>
        </tr>
      `).join('');
    }

    // Mesaj istatistikleri
    try {
      const msgSnap = await getDocs(collection(db, "messages"));
      const msgs = msgSnap.docs.map(d => d.data());
      document.getElementById('totalMessages').textContent = msgs.length;
      document.getElementById('spamMessages').textContent = msgs.filter(m => m.isSpam).length;
    } catch {
      document.getElementById('totalMessages').textContent = '0';
      document.getElementById('spamMessages').textContent = '0';
    }

  } catch (err) {
    console.error("Dashboard yüklenirken hata:", err);
  }
}

// =====================
// TÜM KULLANICILAR
// =====================
async function loadAllUsers() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const tbody = document.getElementById('allUsersTable');

    if (usersSnap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Henüz kullanıcı yok.</td></tr>';
      return;
    }

    tbody.innerHTML = usersSnap.docs.map(d => {
      const u = d.data();
      const uid = d.id;
      return `
        <tr>
          <td>${u.name}</td>
          <td>${u.email}</td>
          <td>${u.department}</td>
          <td><span class="badge badge-${u.role}">${roleLabel(u.role)}</span></td>
          <td><span class="badge ${u.isActive ? 'badge-active' : 'badge-inactive'}">${u.isActive ? 'Aktif' : 'Pasif'}</span></td>
          <td>
            <button class="btn-danger" onclick="toggleUserActive('${uid}', ${u.isActive})">
              ${u.isActive ? 'Devre Dışı Bırak' : 'Aktif Et'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error("Kullanıcılar yüklenirken hata:", err);
  }
}

// Kullanıcı aktif/pasif toggle
async function toggleUserActive(uid, currentStatus) {
  try {
    await updateDoc(doc(db, "users", uid), { isActive: !currentStatus });
    loadAllUsers();
    loadDashboard();
  } catch (err) {
    alert("İşlem sırasında hata: " + err.message);
  }
}
window.toggleUserActive = toggleUserActive;

// =====================
// TÜM MESAJLAR
// =====================
async function loadAllMessages() {
  try {
    const [msgSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, "messages")),
      getDocs(collection(db, "users"))
    ]);
    
    // Kullanıcı eşleme (ID -> İsim)
    const userMap = {};
    usersSnap.docs.forEach(d => userMap[d.id] = d.data().name);

    const tbody = document.getElementById('allMessagesTable');
    if (msgSnap.empty) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Sistemde henüz mesaj trafiği yok.</td></tr>';
      return;
    }

    tbody.innerHTML = msgSnap.docs.sort((a,b) => (b.data().timestamp?.toMillis() || 0) - (a.data().timestamp?.toMillis() || 0)).map(d => {
      const m = d.data();
      const senderName = userMap[m.senderId] || m.senderId;
      const receiverName = userMap[m.receiverId] || m.receiverId;
      
      return `
        <tr>
          <td><strong style="color:var(--primary);">${senderName}</strong></td>
          <td>${receiverName}</td>
          <td>${m.content?.substring(0, 45)}${m.content?.length > 45 ? '...' : ''}</td>
          <td><span class="badge ${m.isSpam ? 'badge-spam' : 'badge-clean'}">${m.isSpam ? '🚫 Spam' : '✅ Temiz'}</span></td>
          <td>${m.timestamp?.toDate ? m.timestamp.toDate().toLocaleDateString('tr-TR') : '-'}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error("Mesajlar yüklenemedi:", err);
    document.getElementById('allMessagesTable').innerHTML = 
      '<tr><td colspan="5" class="empty-row">Mesaj trafiğine şu an ulaşılamıyor.</td></tr>';
  }
}

// =====================
// KULLANICI EKLE FORMU
// =====================

// Otomatik Kimlik ve Şifre Üreticisi
function generateCredentials() {
  const nameEl = document.getElementById('newUserName');
  const companyEl = document.getElementById('newUserCompany');
  const roleEl = document.getElementById('newUserRole');
  if (!nameEl || !companyEl || !roleEl) return;

  const name = nameEl.value.trim().toLowerCase().replace(/\s+/g, '');
  const company = companyEl.value.trim().toLowerCase().replace(/\s+/g, '');
  const role = roleEl.value;

  if (!name || !company || !role) return;

  const trMap = {'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u'};
  const safeName = name.replace(/[çğıöşü]/g, m => trMap[m]);
  const safeCompany = company.replace(/[çğıöşü]/g, m => trMap[m]);

  let emailPrefix = '';
  if (role === 'local' || role === 'regional' || role === 'factory') {
    // Kurum hesapları genelde şirket adına olur
    emailPrefix = safeName + safeCompany; 
    if (role === 'local' && name.length === 0) emailPrefix = safeCompany; 
  } else {
    // Çalışan hesapları
    emailPrefix = safeName + safeCompany;
  }

  document.getElementById('newUserEmail').value = `${emailPrefix}@intramail.corp`;

  const passEl = document.getElementById('newUserPassword');
  if (!passEl.value) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let pass = '';
    for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)];
    passEl.value = pass;
  }
}

document.getElementById('newUserName').addEventListener('input', generateCredentials);
document.getElementById('newUserCompany').addEventListener('input', generateCredentials);
document.getElementById('newUserRole').addEventListener('change', generateCredentials);

// Form gönder
document.getElementById('addUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('newUserName').value.trim();
  const tcNo = document.getElementById('newUserTc').value.trim();
  const birthDate = document.getElementById('newUserBirth').value;
  const company = document.getElementById('newUserCompany').value.trim();
  const role = document.getElementById('newUserRole').value;
  
  const email = document.getElementById('newUserEmail').value;
  const password = document.getElementById('newUserPassword').value;

  const btn = document.getElementById('addUserBtn');
  const msgDiv = document.getElementById('formMessage');

  btn.disabled = true;
  btn.textContent = 'Oluşturuluyor...';
  msgDiv.className = 'form-message hidden';

  try {
    // Firebase REST API ile kullanıcı oluştur (admin oturumunu bozmaz)
    const apiKey = "AIzaSyDR28h-ns4E70SN8QXw5iuCyEjJcFNv0Is";
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false })
      }
    );

    const data = await res.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const newUid = data.localId;

    // Firestore'a kullanıcı profilini yaz
    const { setDoc, doc: fsDoc } = await import("firebase/firestore"); 
    await setDoc(fsDoc(db, "users", newUid), {
      name,
      tcNo,
      birthDate,
      company,
      email,
      role,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: auth.currentUser.uid
    });

    showMessage(msgDiv, `✅ Kullanıcı başarıyla oluşturuldu!\n📧 Email: ${email}\n🔑 Şifre: ${password}`, 'success');
    document.getElementById('addUserForm').reset();
    loadAllUsers();
    loadDashboard();

  } catch (err) {
    const messages = {
      'EMAIL_EXISTS': 'Bu email zaten kullanımda!',
      'WEAK_PASSWORD : Password should be at least 6 characters': 'Şifre en az 6 karakter olmalı!',
    };
    showMessage(msgDiv, `❌ Hata: ${messages[err.message] || err.message}`, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Kullanıcı Oluştur';
});

function showMessage(el, msg, type) {
  el.textContent = msg;
  el.className = `form-message ${type}`;
}

function roleLabel(role) {
  return { 
    admin: 'Sistem Yöneticisi', 
    factory: 'Fabrika Yöneticisi/Çalışanı', 
    regional: 'Bölge Bayisi',
    local: 'Yerel Bayi',
    local_employee: 'Yerel Bayi Çalışanı'
  }[role] || role;
}
