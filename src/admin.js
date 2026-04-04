import { auth, db } from './firebase/config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  collection, getDocs, doc, getDoc, 
  query, orderBy, limit, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// =====================
// AUTH VE YETKİ KONTROLÜ
// =====================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = './giris.html';
    return;
  }

  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists() || userDoc.data().role !== 'admin') {
    alert("Bu sayfaya erişim yetkiniz yok!");
    window.location.href = './giris.html';
    return;
  }

  const userData = userDoc.data();
  document.getElementById('adminName').textContent = userData.name;
  const initials = userData.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('adminAvatar').textContent = initials;

  loadDashboard();
  loadAllUsers();
  loadAllMessages();
});

// =====================
// DASHBOARD VE TARİH
// =====================
const dateOptions = { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' };
if(document.getElementById('currentDate')) {
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('tr-TR', dateOptions);
}

async function loadDashboard() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if(document.getElementById('totalUsers')) document.getElementById('totalUsers').textContent = users.length;
    if(document.getElementById('activeUsers')) document.getElementById('activeUsers').textContent = users.filter(u => u.isActive).length;

    const tbody = document.getElementById('recentUsersTable');
    if (tbody) {
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Henüz kullanıcı yok.</td></tr>';
        } else {
            tbody.innerHTML = users.slice(0, 8).map(u => `
                <tr>
                <td>
                    <div class="user-info-cell">
                        <span class="user-name">${u.name}</span>
                        <span class="company-tag">${u.company || '-'}</span>
                    </div>
                </td>
                <td><span class="user-email">${u.email}</span></td>
                <td><span class="role-badge role-${u.role}">${roleLabel(u.role)}</span></td>
                <td>
                    <div class="status-cell">
                        <span class="status-dot ${u.isActive ? 'active' : 'passive'}"></span>
                        <span style="font-size:0.8rem; font-weight:600;">${u.isActive ? 'Aktif' : 'Pasif'}</span>
                    </div>
                </td>
                </tr>
            `).join('');
        }
    }

    try {
      const msgSnap = await getDocs(collection(db, "messages"));
      if(document.getElementById('totalMessages')) document.getElementById('totalMessages').textContent = msgSnap.size;
      if(document.getElementById('spamMessages')) document.getElementById('spamMessages').textContent = msgSnap.docs.filter(d => d.data().isSpam).length;
    } catch {
      if(document.getElementById('totalMessages')) document.getElementById('totalMessages').textContent = '0';
    }
  } catch (err) { console.error("Dashboard error:", err); }
}

// =====================
// KULLANICI LİSTESİ VE TAB SİSTEMİ
// =====================
let allUsersData = [];
let currentFilter = 'all';

async function loadAllUsers() {
  const table = document.getElementById('allUsersTable');
  if (!table) return;

  const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
  const querySnapshot = await getDocs(q);
  
  allUsersData = [];
  querySnapshot.forEach((doc) => {
    allUsersData.push({ id: doc.id, ...doc.data() });
  });

  renderUserTable();
}

function renderUserTable() {
  const table = document.getElementById('allUsersTable');
  if (!table) return;
  table.innerHTML = '';

  const filtered = allUsersData.filter(u => {
    if (u.email === 'eren@intramail.corp') return false;
    if (currentFilter === 'all') return true;
    return (u.category === currentFilter);
  });

  if (filtered.length === 0) {
    table.innerHTML = `<tr><td colspan="6" class="empty-row"><i class="fa-solid fa-folder-open" style="font-size:2rem;margin-bottom:1rem;display:block;"></i>Bu kategoride personel bulunamadı.</td></tr>`;
    return;
  }

  filtered.forEach(u => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="user-info-cell">
          <span class="user-name">${u.name}</span>
          <span class="company-tag">${u.company || '-'}</span>
        </div>
      </td>
      <td>
        <div class="email-dept-cell">
          <span class="user-email">${u.email}</span>
          <span class="dept-tag">${u.department || 'Genel'}</span>
        </div>
      </td>
      <td><span class="role-badge role-${u.role}">${roleLabel(u.role)}</span></td>
      <td>
        <div class="status-cell">
          <span class="status-dot ${u.isActive ? 'active' : 'passive'}"></span>
          ${u.isActive ? 'Aktif' : 'Pasif'}
        </div>
      </td>
      <td><span class="reg-date">${u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('tr-TR') : '-'}</span></td>
      <td class="actions-cell">
        <button class="btn-icon delete" onclick="deleteUser('${u.id}')" title="Kullanıcıyı Sil">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    `;
    table.appendChild(row);
  });
}

// Tab Listeners
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-btn')) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderUserTable();
    }
});

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
    const subRoleManagerOpt = subRoleEl.querySelector('option[value="manager"]');

    document.getElementById('newUserCompany').value = '';
    document.getElementById('newUserDepartment').value = '';

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
  
  const trMap = {'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u',' ':'','-':''};
  const safeName = rawName.replace(/[çğıöşü\s\-]/g, m => trMap.hasOwnProperty(m) ? trMap[m] : m);
  const safeCompany = rawCompany.replace(/[çğıöşü\s\-]/g, m => trMap.hasOwnProperty(m) ? trMap[m] : m);
  const safeDept = rawDept.replace(/[çğıöşü\s\-]/g, m => trMap.hasOwnProperty(m) ? trMap[m] : m);

  const category = categoryEl.value;
  const subRole = subRoleEl.value;
  if (!category) return;

  let prefix = '';
  if (category === 'local') {
    prefix = (subRole === 'manager') ? `manager${safeCompany}${safeCompany}` : `${safeName}${safeCompany}`;
  } else if (category === 'regional') {
    prefix = `${safeName}${safeDept}karavil`;
  } else if (category === 'factory') {
    prefix = `${safeName}${safeDept}bellona`;
  }

  if (prefix) document.getElementById('newUserEmail').value = `${prefix}@gmail.com.tr`;

  const passEl = document.getElementById('newUserPassword');
  if (!passEl.value) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let pass = '';
    for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)];
    passEl.value = pass;
  }
}

['newUserName', 'newUserCompany', 'newUserDepartment'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', generateCredentials);
});
if(subRoleEl) subRoleEl.addEventListener('change', generateCredentials);

// =====================
// KULLANICI KAYIT
// =====================
const addUserForm = document.getElementById('addUserForm');
if (addUserForm) {
    addUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgDiv = document.getElementById('formMessage');
        const btn = document.getElementById('addUserBtn');

        const userData = {
            name: document.getElementById('newUserName').value.trim(),
            tcNo: document.getElementById('newUserTc').value.trim(),
            birthDate: document.getElementById('newUserBirth').value,
            category: document.getElementById('newUserCategory').value,
            company: document.getElementById('newUserCompany').value.trim(),
            department: document.getElementById('newUserDepartment').value.trim(),
            subRole: document.getElementById('newUserSubRole').value,
            email: document.getElementById('newUserEmail').value,
            password: document.getElementById('newUserPassword').value
        };

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor...';

        try {
            const apiKey = "AIzaSyDR28h-ns4E70SN8QXw5iuCyEjJcFNv0Is";
            const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userData.email, password: userData.password, returnSecureToken: false })
            });
            const authData = await authRes.json();
            if (authData.error) throw new Error(authData.error.message);

            let role = userData.category;
            if (userData.category === 'local' && userData.subRole === 'employee') role = 'local_employee';

            const { setDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            await setDoc(fsDoc(db, "users", authData.localId), {
                ...userData,
                role,
                isActive: true,
                createdAt: new Date(),
                createdBy: auth.currentUser.uid
            });

            msgDiv.textContent = "✅ Kullanıcı başarıyla oluşturuldu!";
            msgDiv.className = "form-status success";
            msgDiv.classList.remove('hidden');
            addUserForm.reset();
            loadAllUsers();
            loadDashboard();
        } catch (err) {
            msgDiv.textContent = "❌ Hata: " + (err.message === 'EMAIL_EXISTS' ? 'Bu e-posta zaten kullanımda!' : err.message);
            msgDiv.className = "form-status error";
            msgDiv.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Hesabı Tanımla ve Kaydet';
        }
    });
}

// =====================
// YARDIMCI FONKSİYONLAR
// =====================
function roleLabel(role) {
    return { admin: 'Admin', factory: 'Fabrika', regional: 'Bölge', local: 'Yerel Bayi', local_employee: 'Bayi Personeli' }[role] || role;
}

async function deleteUser(id) {
    if (confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) {
        await deleteDoc(doc(db, "users", id));
        loadAllUsers();
        loadDashboard();
    }
}
window.deleteUser = deleteUser;

async function loadAllMessages() {
    const tbody = document.getElementById('allMessagesTable');
    if(!tbody) return;
    try {
        const msgSnap = await getDocs(query(collection(db, "messages"), orderBy("timestamp", "desc"), limit(50)));
        tbody.innerHTML = msgSnap.docs.map(d => {
            const m = d.data();
            return `<tr>
                <td><strong>${m.senderName || m.senderId}</strong></td>
                <td>${m.receiverName || m.receiverId}</td>
                <td>${m.content?.substring(0, 50)}...</td>
                <td><span class="role-badge role-${m.isSpam ? 'factory' : 'local'}">${m.isSpam ? 'Spam' : 'Temiz'}</span></td>
                <td>${m.timestamp?.toDate ? m.timestamp.toDate().toLocaleDateString('tr-TR') : '-'}</td>
            </tr>`;
        }).join('');
    } catch (err) { console.error("Messages error:", err); }
}

// Navigasyon
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const section = item.dataset.section;
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        item.classList.add('active');
        document.getElementById('section-' + section).classList.add('active');
    });
});
function goToAddUser() {
    document.querySelector('[data-section="add-user"]').click();
}
window.goToAddUser = goToAddUser;
