import { auth, db } from './firebase/config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  collection, getDocs, doc, getDoc, 
  query, orderBy, limit, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// =====================
// DİNAMİK FORM KONTROLÜ
// =====================
const categoryEl = document.getElementById('newUserCategory');
const companyGroup = document.getElementById('companyGroup');
const deptGroup = document.getElementById('deptGroup');
const subRoleEl = document.getElementById('newUserSubRole');

if (categoryEl) {
  categoryEl.addEventListener('change', () => {
    const category = categoryEl.value;
    const companyLabel = document.getElementById('companyLabel');
    
    // Reset inputs
    document.getElementById('newUserCompany').value = '';
    document.getElementById('newUserDepartment').value = '';

    const subRoleManagerOpt = subRoleEl.querySelector('option[value="manager"]');

    if (category === 'factory') {
      companyGroup.classList.add('hidden');
      deptGroup.classList.remove('hidden');
      document.getElementById('newUserCompany').value = 'Bellona';
      subRoleManagerOpt.textContent = 'Yönetici / Birim Sorumlusu';
    } else if (category === 'regional') {
      companyGroup.classList.add('hidden');
      deptGroup.classList.remove('hidden');
      document.getElementById('newUserCompany').value = 'Karavil';
      subRoleManagerOpt.textContent = 'Bölge Yöneticisi / Müdür';
    } else if (category === 'local') {
      companyGroup.classList.remove('hidden');
      deptGroup.classList.add('hidden');
      companyLabel.textContent = 'Bayi Adı';
      subRoleManagerOpt.textContent = 'Yönetici / Bayi Sahibi';
    }
    generateCredentials();
  });
}

// =====================
// KİMLİK VE ŞİFRE ÜRETİCİ
// =====================
function generateCredentials() {
  const nameEl = document.getElementById('newUserName');
  const companyEl = document.getElementById('newUserCompany');
  const categoryEl = document.getElementById('newUserCategory');
  const subRoleEl = document.getElementById('newUserSubRole');
  const deptEl = document.getElementById('newUserDepartment');
  
  if (!nameEl || !categoryEl) return;

  const rawName = nameEl.value.trim().toLowerCase();
  const rawCompany = companyEl.value.trim().toLowerCase();
  const rawDept = deptEl.value.trim().toLowerCase();
  const category = categoryEl.value;
  const subRole = subRoleEl.value;

  const trMap = {'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u',' ':'','-':''};
  const safeName = rawName.replace(/[çğıöşü\s\-]/g, m => trMap.hasOwnProperty(m) ? trMap[m] : m);
  const safeCompany = rawCompany.replace(/[çğıöşü\s\-]/g, m => trMap.hasOwnProperty(m) ? trMap[m] : m);
  const safeDept = rawDept.replace(/[çğıöşü\s\-]/g, m => trMap.hasOwnProperty(m) ? trMap[m] : m);

  if (!category) return;

  let emailPrefix = '';
  
  if (category === 'local') {
    if (subRole === 'manager') {
      // Yerel Bayi Yönetici: manager + bayi + bayi
      emailPrefix = "manager" + safeCompany + safeCompany;
    } else {
      // Yerel Bayi Çalışan: ad + soyad + bayi
      emailPrefix = safeName + safeCompany;
    }
  } else if (category === 'regional') {
    // Bölge Bayi: ad + soyad + departman + karavil
    emailPrefix = safeName + safeDept + "karavil";
  } else if (category === 'factory') {
    // Fabrika: ad + soyad + departman + bellona
    emailPrefix = safeName + safeDept + "bellona";
  }

  if (emailPrefix) {
    document.getElementById('newUserEmail').value = `${emailPrefix}@gmail.com.tr`;
  }

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
document.getElementById('newUserSubRole').addEventListener('change', generateCredentials);
document.getElementById('newUserDepartment').addEventListener('input', generateCredentials);

// =====================
// KULLANICI KAYIT (AUTH + FIRESTORE)
// =====================
document.getElementById('addUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('newUserName').value.trim();
  const tcNo = document.getElementById('newUserTc').value.trim();
  const birthDate = document.getElementById('newUserBirth').value;
  const category = document.getElementById('newUserCategory').value;
  const company = document.getElementById('newUserCompany').value.trim();
  const department = document.getElementById('newUserDepartment').value.trim();
  const subRole = document.getElementById('newUserSubRole').value;
  
  const email = document.getElementById('newUserEmail').value;
  const password = document.getElementById('newUserPassword').value;

  const btn = document.getElementById('addUserBtn');
  const msgDiv = document.getElementById('formMessage');

  btn.disabled = true;
  btn.textContent = 'Oluşturuluyor...';
  msgDiv.className = 'form-message hidden';

  try {
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
    if (data.error) throw new Error(data.error.message);

    const newUid = data.localId;

    // Rol Belirleme (Sistemin beklediği roller: admin, factory, regional, local, local_employee)
    let finalRole = category;
    if (category === 'local' && subRole === 'employee') finalRole = 'local_employee';

    const { setDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"); 
    await setDoc(fsDoc(db, "users", newUid), {
      name,
      tcNo,
      birthDate,
      company,
      department,
      email,
      role: finalRole,
      subRole: subRole,
      category: category,
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
    const messages = { 'EMAIL_EXISTS': 'Bu email zaten kullanımda!' };
    showMessage(msgDiv, `❌ Hata: ${messages[err.message] || err.message}`, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Hesabı Tanımla';
});

function showMessage(el, msg, type) {
  el.textContent = msg;
  el.className = `form-message ${type}`;
}

function roleLabel(role) {
  return { 
    admin: 'Sistem Yöneticisi', 
    factory: 'Fabrika', 
    regional: 'Bölge Bayisi',
    local: 'Yerel Bayi',
    local_employee: 'Yerel Bayi Çalışanı'
  }[role] || role;
}
