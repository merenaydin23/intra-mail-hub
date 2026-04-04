import { auth, db } from './firebase/config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  collection, getDocs, doc, getDoc, 
  query, orderBy, limit, updateDoc, deleteDoc, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let allUsersData = [];
let currentFilter = 'all';

// =====================
// ORTAK AUTH VE HAZIRLIK
// =====================
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = './giris.html'; return; }

  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists() || userDoc.data().role !== 'admin') {
    alert("Bu sayfaya erişim yetkiniz yok!");
    window.location.href = './giris.html';
    return;
  }

  const userData = userDoc.data();
  if(document.getElementById('adminName')) document.getElementById('adminName').textContent = userData.name;
  if(document.getElementById('adminAvatar')) document.getElementById('adminAvatar').textContent = getInitials(userData.name);

  // Hangi sayfadayız?
  const path = window.location.pathname;
  if (path.includes('yonetim.html') || path.endsWith('/yonetim')) initDashboard();
  if (path.includes('yonetim_personel')) initPersonel();
  if (path.includes('yonetim_ekle')) initEkle();
  if (path.includes('yonetim_mesajlar')) loadAllMessages();
});

function getInitials(name) { return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(); }

// =====================
// DASHBOARD MANTIĞI
// =====================
async function initDashboard() {
  try {
    const snap = await getDocs(collection(db, "users"));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const nonAdmin = users.filter(u => u.role !== 'admin');

    // Temel istatistikler
    const regionalManagers = users.filter(u => u.category === 'regional' && u.subRole === 'manager').length;
    const uniqueDealers = [...new Set(users.filter(u => u.category === 'local').map(u => u.company))].length;
    const dealerEmployees = users.filter(u => u.category === 'local' && u.subRole === 'employee').length;
    document.getElementById('statRegionalManagers').textContent = regionalManagers;
    document.getElementById('statTotalDealers').textContent = uniqueDealers;
    document.getElementById('statDealerEmployees').textContent = dealerEmployees;
    document.getElementById('statTotalUsers').textContent = users.length;

    // Yaş hesaplama yardımcısı
    const calcAge = (birthDate) => {
      if (!birthDate) return null;
      const today = new Date();
      const bd = new Date(birthDate);
      if (isNaN(bd)) return null;
      let age = today.getFullYear() - bd.getFullYear();
      if (today < new Date(today.getFullYear(), bd.getMonth(), bd.getDate())) age--;
      return age;
    };

    // Ortalama yaş ve en yaşlı çalışan
    const withAge = nonAdmin.map(u => ({ ...u, age: calcAge(u.birthDate) })).filter(u => u.age !== null);
    if (withAge.length > 0) {
      const avgAge = Math.round(withAge.reduce((s, u) => s + u.age, 0) / withAge.length);
      const oldest = withAge.reduce((a, b) => a.age > b.age ? a : b);
      if (document.getElementById('statAvgAge')) document.getElementById('statAvgAge').textContent = avgAge;
      if (document.getElementById('statOldestName')) document.getElementById('statOldestName').textContent = oldest.name;
      if (document.getElementById('statOldestAge')) document.getElementById('statOldestAge').innerHTML = `En Yaşlı Personel &bull; ${oldest.age} yaş`;
    }

    // Doğum Günü Yaklaşanlar (Önümüzdeki 30 gün)
    renderBirthdays(nonAdmin);

    // Şirket bazında dağılım tablosu
    const companyMap = {};
    nonAdmin.forEach(u => {
      const co = u.company || 'Bilinmiyor';
      if (!companyMap[co]) companyMap[co] = { count: 0, ages: [] };
      companyMap[co].count++;
      const a = calcAge(u.birthDate);
      if (a) companyMap[co].ages.push(a);
    });
    const breakdownTbody = document.getElementById('companyBreakdownTable');
    if (breakdownTbody) {
      breakdownTbody.innerHTML = Object.entries(companyMap)
        .sort((a,b) => b[1].count - a[1].count)
        .map(([co, data]) => {
          const avgCo = data.ages.length > 0 ? Math.round(data.ages.reduce((s,a)=>s+a,0)/data.ages.length) : '-';
          return `<tr>
            <td><strong>${co}</strong></td>
            <td><strong style="color:var(--primary); font-size:1.2rem;">${data.count}</strong> <span style="color:#64748b; font-size:0.85rem;">personel</span></td>
            <td>${avgCo !== '-' ? `<span style="font-weight:600;">${avgCo}</span> yaş` : '<span style="color:#94a3b8;">-</span>'}</td>
          </tr>`;
        }).join('');
    }

    // Son operasyonlar
    const tbody = document.getElementById('recentUsersTable');
    if (tbody) {
      tbody.innerHTML = users.slice(0, 10).map(u => `
        <tr>
          <td><strong>${u.name}</strong><br/><small style="color:#64748b;">${u.company || 'Bellona'}</small></td>
          <td><span class="role-tag" style="background:#f1f5f9;">${u.category?.toUpperCase() || '-'}</span></td>
          <td><div class="status-badge"><span class="status-dot ${u.isActive ? 'active' : 'passive'}"></span> ${u.isActive?'Aktif':'Pasif'}</div></td>
          <td>${u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('tr-TR') : '-'}</td>
        </tr>
      `).join('');
    }
  } catch (err) { console.error("Dashboard error:", err); }
}

function renderBirthdays(users) {
    const list = document.getElementById('birthdayList');
    if (!list) return;

    const today = new Date();
    const upcoming = users.filter(u => {
        if (!u.birthDate) return false;
        const b = new Date(u.birthDate);
        const bThisYear = new Date(today.getFullYear(), b.getMonth(), b.getDate());
        const bNextYear = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate());
        
        const diff1 = (bThisYear - today) / (1000 * 60 * 60 * 24);
        const diff2 = (bNextYear - today) / (1000 * 60 * 60 * 24);
        
        return (diff1 >= 0 && diff1 <= 30) || (diff2 >= 0 && diff2 <= 30);
    }).sort((a,b) => {
        const da = new Date(a.birthDate);
        const db = new Date(b.birthDate);
        return da.getMonth() - db.getMonth() || da.getDate() - db.getDate();
    });

    if (upcoming.length === 0) {
        list.innerHTML = '<p style="color:#94a3b8; font-size:0.85rem; text-align:center;">Önümüzdeki 30 gün içinde doğum günü olan personel bulunmamaktadır.</p>';
        return;
    }

    list.innerHTML = upcoming.map(u => {
        const b = new Date(u.birthDate);
        return `
            <div class="birthday-row">
                <div>
                    <h5 style="font-family:'Outfit'; color:#0f172a; margin-bottom:2px;">${u.name}</h5>
                    <p style="font-size:0.75rem; color:#94a3b8;">${b.toLocaleDateString('tr-TR', {day:'numeric', month:'long'})} &bull; ${u.company}</p>
                </div>
                <button class="btn-greet" onclick="greetBirthday('${u.name}', '${u.email}')">
                    <i class="fa-solid fa-cake-candles"></i> Kutla
                </button>
            </div>
        `;
    }).join('');
}

window.greetBirthday = function(name, email) {
    const templates = [
        `Sayın ${name}, yeni yaşınızın size sağlık, mutluluk ve başarı getirmesini dileriz. Bellona ailesinin değerli bir üyesi olarak doğum gününüzü en içten dileklerimizle kutlarız! 🎂`,
        `Mutlu Yıllar ${name}! 🎈 Yeni yaşında her şey gönlünce olsun. Bellona ailesi olarak doğum gününü tebrik eder, nice başarılı yıllar dileriz. ✨`,
        `İyi ki doğdun ${name}! 🎉 Bellona'daki özverili çalışmaların için teşekkür eder, yeni yaşında bol şans ve mutluluk dileriz. 🎊`
    ];
    const text = templates[Math.floor(Math.random() * templates.length)];
    
    // Simüle edilmiş mail gönderme (Şimdilik kopyala)
    navigator.clipboard.writeText(text).then(() => {
        alert(`Kutlama mesajı kopyalandı! Şirket içi mail/mesaj aracılığıyla ${email} adresine gönderebilirsiniz:\n\n"${text}"`);
    });
}


// =====================
// PERSONEL LİSTESİ MANTIĞI
// =====================
async function initPersonel() {
  const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  allUsersData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  if(document.getElementById('userCountBadge')) document.getElementById('userCountBadge').textContent = allUsersData.length;

  // Şirketleri dinamik olarak dropdown'a doldur
  const companyFilter = document.getElementById('companyFilter');
  if (companyFilter) {
    const companies = [...new Set(allUsersData.filter(u => u.role !== 'admin' && u.company).map(u => u.company))].sort();
    companies.forEach(co => {
      const opt = document.createElement('option');
      opt.value = co;
      opt.textContent = co;
      companyFilter.appendChild(opt);
    });
    companyFilter.addEventListener('change', renderUserTable);
  }

  renderUserTable();

  document.getElementById('userSearchInput')?.addEventListener('input', renderUserTable);
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderUserTable();
    });
  });
}

function renderUserTable() {
  const table = document.getElementById('allUsersTable');
  if (!table) return;

  const searchQuery = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
  const selectedCompany = document.getElementById('companyFilter')?.value || 'all';

  const filtered = allUsersData.filter(u => {
    if (u.role === 'admin') return false;
    const isCategory = currentFilter === 'all' || u.category === currentFilter;
    const isCompany = selectedCompany === 'all' || u.company === selectedCompany;
    const isSearch = !searchQuery || u.name?.toLowerCase().includes(searchQuery) || u.email?.toLowerCase().includes(searchQuery) || u.tcNo?.includes(searchQuery);
    return isCategory && isCompany && isSearch;
  });

  table.innerHTML = filtered.map(u => `
    <tr>
      <td>
        <div class="user-nested-cell">
          <div class="user-avatar-mini">${getInitials(u.name)}</div>
          <div class="user-details"><h5>${u.name}</h5><p>${u.company || 'BELLONA'}</p></div>
        </div>
      </td>
      <td><div class="info-box"><span class="info-main" style="color:var(--primary); font-family:monospace; font-size:0.8rem;">${u.email}</span><span class="info-sub" style="font-weight:800; color:#334155; font-family:monospace;">PW: ${u.password || '******'}</span></div></td>
      <td><div class="info-box"><span class="info-main">TC: ${u.tcNo || '-'}</span><span class="info-sub">DT: ${u.birthDate || '-'}</span></div></td>
      <td><div class="info-box"><span class="role-tag role-${u.role}" style="margin-bottom:4px;">${roleLabel(u.role)}</span><span class="info-sub">${u.department || 'Genel'}</span></div></td>
      <td><div class="status-badge"><span class="status-dot ${u.isActive ? 'active' : 'passive'}"></span> ${u.isActive?'Aktif':'Pasif'}</div></td>
      <td><button class="btn-action" onclick="deleteUser('${u.id}')"><i class="fa-solid fa-trash-can"></i></button></td>
    </tr>
  `).join('');
}

// =====================
// KAYIT FORMU MANTIĞI
// =====================
function initEkle() {
    const form = document.getElementById('addUserForm');
    const catEl = document.getElementById('newUserCategory');
    if(catEl) catEl.addEventListener('change', handleCategoryChange);
    
    ['newUserName', 'newUserCompany', 'newUserDepartment'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', generateCredentials);
    });
    document.getElementById('newUserSubRole')?.addEventListener('change', generateCredentials);

    if(form) form.addEventListener('submit', handleAddUser);
}

function handleCategoryChange() {
    const category = document.getElementById('newUserCategory').value;
    const companyGroup = document.getElementById('companyGroup');
    const deptGroup = document.getElementById('deptGroup');
    const companyLabel = document.getElementById('companyLabel');
    const subRoleManagerOpt = document.getElementById('managerOption');

    if (category === 'factory') {
        companyGroup.classList.add('hidden'); deptGroup.classList.remove('hidden');
        document.getElementById('newUserCompany').value = 'Bellona';
        if(subRoleManagerOpt) subRoleManagerOpt.textContent = 'Birim Yöneticisi';
    } else if (category === 'regional') {
        companyGroup.classList.add('hidden'); deptGroup.classList.remove('hidden');
        document.getElementById('newUserCompany').value = 'Karavil';
        if(subRoleManagerOpt) subRoleManagerOpt.textContent = 'Bölge Müdürü / Yön.';
    } else if (category === 'local') {
        companyGroup.classList.remove('hidden'); deptGroup.classList.add('hidden');
        companyLabel.textContent = 'Bayi Adı (Bölge)';
        if(subRoleManagerOpt) subRoleManagerOpt.textContent = 'Bayi Sahibi / Ortak';
    }
    generateCredentials();
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
        let p = ''; for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
        passEl.value = p;
    }
}

async function handleAddUser(e) {
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

    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor...';

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

        msgDiv.textContent = "✅ Hesap Başarıyla Oluşturuldu!";
        msgDiv.style.background = "#f0fdf4"; msgDiv.style.color = "#16a34a";
        msgDiv.classList.remove('hidden');
        document.getElementById('addUserForm').reset();
    } catch (err) {
        msgDiv.textContent = "❌ Hata: " + err.message;
        msgDiv.style.background = "#fef2f2"; msgDiv.style.color = "#dc2626";
        msgDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Personel Kaydını Tamamla';
    }
}

// UTILS & GLOBAL HOOKS
function roleLabel(role) {
    return { admin: 'Admin', factory: 'Fabrika', regional: 'Bölge', local: 'Bayi Sahibi', local_employee: 'Personel' }[role] || role;
}
window.deleteUser = async function(id) {
    if (confirm('Personel kaydını silmek istediğinize emin misiniz?')) {
        await deleteDoc(doc(db, "users", id));
        window.location.reload();
    }
}
document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth).then(() => window.location.href = './giris.html'));
