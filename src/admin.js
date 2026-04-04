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
  const initials = getInitials(userData.name);
  document.getElementById('adminAvatar').textContent = initials;

  loadDashboard();
  loadAllUsers();
  loadAllMessages();
});

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

// =====================
// DASHBOARD VERİLERİ
// =====================
async function loadDashboard() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if(document.getElementById('totalUsers')) document.getElementById('totalUsers').textContent = users.length;
    if(document.getElementById('activeUsers')) document.getElementById('activeUsers').textContent = users.filter(u => u.isActive).length;

    const tbody = document.getElementById('recentUsersTable');
    if (tbody) {
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Henüz kayıtlı personel bulunamadı.</td></tr>';
        } else {
            tbody.innerHTML = users.slice(0, 8).map(u => `
                <tr>
                    <td>
                        <div class="user-nested-cell">
                            <div class="user-avatar-mini">${getInitials(u.name)}</div>
                            <div class="user-details">
                                <h5>${u.name}</h5>
                                <p>${u.company || 'Bellona Merkez'}</p>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="info-box">
                            <span class="info-main">${u.email}</span>
                        </div>
                    </td>
                    <td><span class="role-tag role-${u.role}" style="background:#f1f5f9; color:#475569;">${roleLabel(u.role)}</span></td>
                    <td>
                        <div class="status-badge">
                            <span class="status-dot ${u.isActive ? 'active' : 'passive'}"></span>
                            ${u.isActive ? 'Aktif' : 'Pasif'}
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
// KULLANICI LİSTESİ (NESTED DESIGN)
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

  const searchQuery = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
  const selectedRegion = document.getElementById('regionFilter')?.value || 'all';

  const filtered = allUsersData.filter(u => {
    if (u.email === 'eren@intramail.corp' || u.role === 'admin') return false;
    
    const isCategoryMatch = currentFilter === 'all' || u.category === currentFilter;
    const isRegionMatch = selectedRegion === 'all' || u.company === selectedRegion;
    const isSearchMatch = u.name.toLowerCase().includes(searchQuery) || u.email.toLowerCase().includes(searchQuery);

    return isCategoryMatch && isRegionMatch && isSearchMatch;
  });

  if (filtered.length === 0) {
    table.innerHTML = `<tr><td colspan="6" class="empty-row"><i class="fa-solid fa-folder-open" style="font-size:2rem;margin-bottom:1rem;display:block;"></i>Kayıt Bulunamadı.</td></tr>`;
    return;
  }

  filtered.forEach(u => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="user-nested-cell">
          <div class="user-avatar-mini">${getInitials(u.name)}</div>
          <div class="user-details">
            <h5>${u.name}</h5>
            <p>${u.company || '-'} / ${u.category?.toUpperCase() || 'PERSONEL'}</p>
          </div>
        </div>
      </td>
      <td>
        <div class="info-box">
          <span class="info-main" style="color:var(--primary); font-family: monospace; font-size:0.8rem;">${u.email}</span>
        </div>
      </td>
      <td>
        <div class="info-box">
          <span class="info-main" style="letter-spacing:1px; font-weight:800; color:#334155; font-family: monospace;">${u.password || '******'}</span>
        </div>
      </td>
      <td>
        <div class="info-box">
           <span class="role-tag role-${u.role}" style="display:inline-block; margin-bottom:4px;">${roleLabel(u.role)}</span>
           <span class="info-sub">${u.department || 'Genel'}</span>
        </div>
      </td>
      <td>
        <div class="status-badge">
          <span class="status-dot ${u.isActive ? 'active' : 'passive'}"></span>
          ${u.isActive ? 'Aktif' : 'Pasif'}
        </div>
      </td>
      <td>
        <button class="btn-action" onclick="deleteUser('${u.id}')" title="Kullanıcıyı Sil">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    `;
    table.appendChild(row);
  });
}

// Sekme ve Arama Dinleyicileri
document.addEventListener('input', (e) => {
    if (e.target.id === 'userSearchInput') renderUserTable();
    if (['newUserName', 'newUserCompany', 'newUserDepartment'].includes(e.target.id)) generateCredentials();
});

document.addEventListener('change', (e) => {
    if (e.target.id === 'regionFilter') renderUserTable();
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-btn')) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderUserTable();
    }
    if (e.target.dataset.section) {
        goToSection(e.target.dataset.section);
    }
});

function goToSection(section) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
    if(navItem) navItem.classList.add('active');
    
    const sectionEl = document.getElementById('section-' + section);
    if(sectionEl) sectionEl.classList.add('active');

    const titles = { 'dashboard': 'Dashboard', 'users': 'Personel Yönetimi', 'add-user': 'Yeni Hesap Oluştur', 'messages': 'Sistem Mesajları' };
    document.getElementById('pageTitle').textContent = titles[section] || section;
}
window.goToSection = goToSection;

function goToAddUser() {
    goToSection('add-user');
}
window.goToAddUser = goToAddUser;

// =====================
// DİNAMİK FORM KURALLARI
// =====================
const categoryEl = document.getElementById('newUserCategory');
if (categoryEl) {
  categoryEl.addEventListener('change', () => {
    const category = categoryEl.value;
    const companyGroup = document.getElementById('companyGroup');
    const deptGroup = document.getElementById('deptGroup');
    const companyLabel = document.getElementById('companyLabel');
    const subRoleManagerOpt = document.getElementById('managerOption');

    document.getElementById('newUserCompany').value = '';
    document.getElementById('newUserDepartment').value = '';

    if (category === 'factory') {
      companyGroup.classList.add('hidden');
      deptGroup.classList.remove('hidden');
      document.getElementById('newUserCompany').value = 'Bellona';
      if(subRoleManagerOpt) subRoleManagerOpt.textContent = 'Yönetici / Birim Sorumlusu';
    } else if (category === 'regional') {
      companyGroup.classList.add('hidden');
      deptGroup.classList.remove('hidden');
      document.getElementById('newUserCompany').value = 'Karavil';
      if(subRoleManagerOpt) subRoleManagerOpt.textContent = 'Bölge Yöneticisi / Müdür';
    } else if (category === 'local') {
      companyGroup.classList.remove('hidden');
      deptGroup.classList.add('hidden');
      companyLabel.textContent = 'Bayi Adı';
      if(subRoleManagerOpt) subRoleManagerOpt.textContent = 'Yönetici / Bayi Sahibi';
    }
    generateCredentials();
  });
}

function generateCredentials() {
  const nameVal = document.getElementById('newUserName')?.value.trim().toLowerCase() || '';
  const compVal = document.getElementById('newUserCompany')?.value.trim().toLowerCase() || '';
  const deptVal = document.getElementById('newUserDepartment')?.value.trim().toLowerCase() || '';
  const category = document.getElementById('newUserCategory')?.value;
  const subRole = document.getElementById('newUserSubRole')?.value;

  if (!nameVal || !category) return;

  const trMap = {'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u',' ':'','-':''};
  const sName = nameVal.replace(/[çğıöşü\s\-]/g, m => trMap.hasOwnProperty(m) ? trMap[m] : m);
  const sComp = compVal.replace(/[çğıöşü\s\-]/g, m => trMap.hasOwnProperty(m) ? trMap[m] : m);
  const sDept = deptVal.replace(/[çğıöşü\s\-]/g, m => trMap.hasOwnProperty(m) ? trMap[m] : m);

  let prefix = '';
  if (category === 'local') {
    prefix = (subRole === 'manager') ? `manager${sComp}${sComp}` : `${sName}${sComp}`;
  } else if (category === 'regional') {
    prefix = `${sName}${sDept}karavil`;
  } else if (category === 'factory') {
    prefix = `${sName}${sDept}bellona`;
  }

  if (prefix) document.getElementById('newUserEmail').value = `${prefix}@gmail.com.tr`;

  const passEl = document.getElementById('newUserPassword');
  if (!passEl.value) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let p = '';
    for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
    passEl.value = p;
  }
}

// =====================
// KAYIT İŞLEMİ
// =====================
const addUserForm = document.getElementById('addUserForm');
if (addUserForm) {
    addUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgDiv = document.getElementById('formMessage');
        const btn = document.getElementById('addUserBtn');

        const userData = {
            name: document.getElementById('newUserName').value,
            tcNo: document.getElementById('newUserTc').value,
            birthDate: document.getElementById('newUserBirth').value,
            category: document.getElementById('newUserCategory').value,
            company: document.getElementById('newUserCompany').value,
            department: document.getElementById('newUserDepartment').value,
            subRole: document.getElementById('newUserSubRole').value,
            email: document.getElementById('newUserEmail').value,
            password: document.getElementById('newUserPassword').value
        };

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor...';

        try {
            const apiKey = "AIzaSyDR28h-ns4E70SN8QXw5iuCyEjJcFNv0Is";
            const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userData.email, password: userData.password, returnSecureToken: false })
            });
            const authData = await authRes.json();
            if (authData.error) throw new Error(authData.error.message);

            let role = userData.category;
            if (userData.category === 'local' && userData.subRole === 'employee') role = 'local_employee';

            const { setDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            await setDoc(fsDoc(db, "users", authData.localId), {
                ...userData, role, isActive: true, createdAt: new Date(), createdBy: auth.currentUser.uid
            });

            msgDiv.textContent = "✅ Hesap Aktif Edildi!";
            msgDiv.style.background = "#f0fdf4"; msgDiv.style.color = "#16a34a";
            msgDiv.classList.remove('hidden');
            addUserForm.reset();
            loadAllUsers(); loadDashboard();
        } catch (err) {
            msgDiv.textContent = "❌ Hata: " + err.message;
            msgDiv.style.background = "#fef2f2"; msgDiv.style.color = "#dc2626";
            msgDiv.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-user-check"></i> Personeli Sisteme Tanımla';
        }
    });
}

// UTILS
function roleLabel(role) {
    return { admin: 'Sistem Admin', factory: 'Fabrika', regional: 'Bölge', local: 'Bayi Sahibi', local_employee: 'Personel' }[role] || role;
}
async function deleteUser(id) {
    if (confirm('DİKKAT: Bu personel kaydını silmek istediğinize emin misiniz?')) {
        await deleteDoc(doc(db, "users", id));
        loadAllUsers(); loadDashboard();
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
                <td><strong>${m.senderName || 'Bilinmiyor'}</strong></td>
                <td>${m.receiverName || 'Bilinmiyor'}</td>
                <td><p style="font-size:0.8rem; color:#64748b;">${m.content?.substring(0, 50)}...</p></td>
                <td><span class="role-tag" style="background:#f1f5f9;">Sistem İletisi</span></td>
                <td>${m.timestamp?.toDate ? m.timestamp.toDate().toLocaleDateString('tr-TR') : '-'}</td>
            </tr>`;
        }).join('');
    } catch (err) { console.error("Msg error:", err); }
}

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth).then(() => window.location.href = './giris.html'));
