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
    window.location.href = '/index.html';
    return;
  }

  // Kullanıcı Firestore'dan oku
  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists() || userDoc.data().role !== 'admin') {
    alert("Bu sayfaya erişim yetkiniz yok!");
    window.location.href = '/index.html';
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

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    item.classList.add('active');
    document.getElementById(`section-${section}`).classList.add('active');

    const titles = {
      'dashboard': 'Dashboard',
      'users': 'Kullanıcılar',
      'add-user': 'Kullanıcı Ekle',
      'messages': 'Mesajlar'
    };
    document.getElementById('pageTitle').textContent = titles[section] || section;
  });
});

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
  window.location.href = '/index.html';
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
    const msgSnap = await getDocs(collection(db, "messages"));
    const tbody = document.getElementById('allMessagesTable');

    if (msgSnap.empty) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Henüz mesaj yok.</td></tr>';
      return;
    }

    tbody.innerHTML = msgSnap.docs.map(d => {
      const m = d.data();
      return `
        <tr>
          <td>${m.senderId?.substring(0,8)}...</td>
          <td>${m.receiverId?.substring(0,8)}...</td>
          <td>${m.content?.substring(0, 50)}${m.content?.length > 50 ? '...' : ''}</td>
          <td><span class="badge ${m.isSpam ? 'badge-spam' : 'badge-clean'}">${m.isSpam ? '🚫 Spam' : '✅ Temiz'}</span></td>
          <td>${m.timestamp?.toDate ? m.timestamp.toDate().toLocaleDateString('tr-TR') : '-'}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    document.getElementById('allMessagesTable').innerHTML = 
      '<tr><td colspan="5" class="empty-row">Mesajlar henüz yüklenmedi.</td></tr>';
  }
}

// =====================
// KULLANICI EKLE FORMU
// =====================

// Otomatik şifre üret
document.getElementById('generatePassBtn').addEventListener('click', () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pass = '';
  for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  document.getElementById('newUserPassword').type = 'text';
  document.getElementById('newUserPassword').value = pass;
});

// Form gönder
document.getElementById('addUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('newUserName').value.trim();
  const emailPrefix = document.getElementById('newUserEmailPrefix').value.trim();
  const department = document.getElementById('newUserDepartment').value;
  const role = document.getElementById('newUserRole').value;
  const password = document.getElementById('newUserPassword').value;

  const email = `${emailPrefix}@nexmail.io`;
  const btn = document.getElementById('addUserBtn');
  const msgDiv = document.getElementById('formMessage');

  btn.disabled = true;
  btn.textContent = 'Oluşturuluyor...';
  msgDiv.className = 'form-message hidden';

  try {
    // Cloud Function veya Admin SDK olmadan client-side ile kullanıcı oluşturmak
    // Firebase Auth'ta mevcut kullanıcı oturumu bozulur, bu yüzden
    // bu işlem için bir Cloud Function çağrısı gerekir.
    // Şimdilik kullanıcıya bilgi mesajı gösteriyoruz.
    
    showMessage(msgDiv, `⚠️ Kullanıcı oluşturmak için Cloud Functions gerekli. Şimdilik kullanıcıyı Firebase Console > Authentication > Add User ile ekleyin:\n\nEmail: ${email}\nŞifre: ${password}`, 'error');
    
  } catch (err) {
    showMessage(msgDiv, `Hata: ${err.message}`, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Kullanıcı Oluştur';
});

function showMessage(el, msg, type) {
  el.textContent = msg;
  el.className = `form-message ${type}`;
}

function roleLabel(role) {
  return { admin: 'Admin', manager: 'Müdür', employee: 'Çalışan' }[role] || role;
}
