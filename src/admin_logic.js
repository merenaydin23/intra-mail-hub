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

    // Şirket bazında dağılım tablosu (Normalleştirilmiş)
    const companyMap = {};
    nonAdmin.forEach(u => {
      const rawCo = u.company || 'Bilinmiyor';
      const key = rawCo.replace(/[-\s]/g, '').toLowerCase(); // Normalleşmiş anahtar
      
      if (!companyMap[key]) {
        companyMap[key] = { prettyName: rawCo, count: 0, ages: [] };
      }
      companyMap[key].count++;
      const a = calcAge(u.birthDate);
      if (a) companyMap[key].ages.push(a);
    });

    const breakdownTbody = document.getElementById('companyBreakdownTable');
    if (breakdownTbody) {
      breakdownTbody.innerHTML = Object.entries(companyMap)
        .sort((a,b) => b[1].count - a[1].count)
        .map(([key, data]) => {
          const avgCo = data.ages.length > 0 ? Math.round(data.ages.reduce((s,a)=>s+a,0)/data.ages.length) : '-';
          return `<tr>
            <td><strong>${data.prettyName}</strong></td>
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
                <button class="btn-greet" onclick="greetBirthday('${u.name}', '${u.email}', '${u.company}')">
                    <i class="fa-solid fa-cake-candles"></i> Kutla
                </button>
            </div>
        `;
    }).join('');
}

window.greetBirthday = function(name, email, company) {
    const text = `Değerli iş ortağımız,

Doğum gününüzü en içten dileklerimizle kutlarız. Yeni yaşınızın size sağlık, mutluluk ve başarı getirmesini temenni ederiz. Birlikte nice başarılı yıllara ulaşmayı diliyor, iş birliğimizin güçlenerek devam etmesini arzu ediyoruz.

Sayın ${company} bayimizin güzide personeli ${name} olarak, yeni yaşınızın tüm hayallerinizi gerçekleştirmesini dileriz. ✨

Saygılarımızla,
Bellona Ailesi 🎂`;
    
    // Simüle edilmiş mail gönderme (Şimdilik kopyala)
    navigator.clipboard.writeText(text).then(() => {
        alert(`${name} için özel kurumsal kutlama metni kopyalandı! ✅\n\n${email} adresine gönderebilirsiniz.`);
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

  // Şirketleri dinamik ve temiz (normalleştirilmiş) olarak dropdown'a doldur
  const companyFilter = document.getElementById('companyFilter');
  if (companyFilter) {
    const rawCompanies = allUsersData.filter(u => u.role !== 'admin' && u.company).map(u => u.company);
    
    // Normalizasyon: "Ay-Ka" ve "Ay Ka" aynı olsun
    const normalizedMap = {}; // key: normalizedName, value: prettyName
    rawCompanies.forEach(co => {
      const key = co.replace(/[-\s]/g, '').toLowerCase(); // "ayka"
      if (!normalizedMap[key]) normalizedMap[key] = co;
    });

    // Eskileri temizle
    companyFilter.innerHTML = '<option value="all">Tüm Şirketler / Bayiler</option>';
    
    Object.values(normalizedMap).sort().forEach(co => {
      const opt = document.createElement('option');
      opt.value = co.replace(/[-\s]/g, '').toLowerCase(); // Filtre değeri normal normalize edilmiş olsun
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
    
    const uCoNormalized = u.company ? u.company.replace(/[-\s]/g, '').toLowerCase() : '';
    
    const isCategory = currentFilter === 'all' || u.category === currentFilter;
    const isCompany = selectedCompany === 'all' || uCoNormalized === selectedCompany;
    const isSearch = !searchQuery || 
                     u.name?.toLowerCase().includes(searchQuery) || 
                     u.email?.toLowerCase().includes(searchQuery) || 
                     u.tcNo?.includes(searchQuery);
                     
    return isCategory && isCompany && isSearch;
  }).sort((a, b) => {
    // Önce subRole === 'manager' olanlar (Patronlar en üste)
    const aMgr = a.subRole === 'manager' ? 1 : 0;
    const bMgr = b.subRole === 'manager' ? 1 : 0;
    if (aMgr !== bMgr) return bMgr - aMgr;
    
    // Sonra tarihe göre (yeni gelenler üstte)
    const aDate = a.createdAt?.seconds || 0;
    const bDate = b.createdAt?.seconds || 0;
    return bDate - aDate;
  });

  table.innerHTML = filtered.map(u => {
    // Aktiflik durumuna göre stil belirle
    const statusStyle = u.isActive 
        ? 'background:#ecfdf5; color:#059669; border:1px solid #10b98133;' // Yeşil temalı Aktif
        : 'background:#f1f5f9; color:#64748b; border:1px solid #e2e8f0;'; // Pasif
    
    // İsim Başharfleri (Avatar için)
    const initials = u.name ? u.name.split(' ').map(n=>n[0]).join('').toUpperCase() : 'U';

    return `
    <tr class="anim-fade-up">
        <td>
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:40px; height:40px; border-radius:10px; background:var(--primary); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem;">${initials}</div>
            <div style="display:flex; flex-direction:column;">
                <strong style="color:var(--text-main); font-size:0.95rem;">${u.name}</strong>
                <span style="font-size:0.75rem; color:var(--primary); font-weight:700;">${u.company || 'BELLONA'}</span>
            </div>
          </div>
        </td>
        
        <td>
            <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-family:monospace; font-size:0.8rem; color:var(--primary);">${u.email}</span>
                <span style="font-size:0.7rem; color:#64748b;">PW: ${u.password || '******'}</span>
            </div>
        </td>

        <td>
            <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-size:0.8rem;">TC: ${u.tcNo || '-'}</span>
                <span style="font-size:0.7rem; color:#94a3b8;">DT: ${u.birthDate || '-'}</span>
            </div>
        </td>

        <td>
            <div style="display:flex; flex-direction:column; gap:4px;">
                <span style="background:#f1f5f9; color:#0f172a; font-size:0.65rem; font-weight:800; padding:2px 8px; border-radius:4px; width:fit-content;">${u.subRole === 'manager' ? 'BAYİ SAHİBİ' : 'PERSONEL'}</span>
                <span style="font-size:0.75rem; color:#64748b; padding-left:4px;">${u.department || 'Genel'}</span>
            </div>
        </td>

        <td>
            <div class="status-badge" style="${statusStyle} padding: 4px 12px; font-weight:700;">
                <span class="status-dot ${u.isActive ? 'active' : 'passive'}"></span> 
                ${u.isActive ? 'Aktif' : 'Pasif'}
            </div>
        </td>

        <td>
            <div style="display:flex; gap:8px; align-items:center;">
                <button class="btn-action" style="background:#f0fdf4; color:#16a34a;" onclick="openMessageModal('${u.email}', '${u.name}')" title="Mesaj Gönder">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
                <button class="btn-action" onclick="deleteUser('${u.id}')" title="Kullanıcıyı Sil">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </td>
    </tr>
  `}).join('');
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
// =====================
// DİREKT MESAJ MANTIĞI
// =====================
let activeChatEmail = '';

window.openMessageModal = function(email, name) {
    activeChatEmail = email;
    const modal = document.createElement('div');
    modal.id = 'directMsgModal';
    modal.style = `
        position:fixed; top:0; left:0; width:100%; height:100%; 
        background:rgba(15, 23, 42, 0.6); backdrop-filter:blur(5px);
        display:flex; align-items:center; justify-content:center; z-index:9999;
        font-family:'Inter', sans-serif;
    `;
    modal.innerHTML = `
        <div style="background:white; width:450px; border-radius:24px; padding:2rem; box-shadow:var(--shadow-premium); position:relative;" class="anim-fade-up">
            <h3 style="margin-bottom:0.5rem; color:#0f172a; display:flex; align-items:center; gap:10px;">
                <i class="fa-solid fa-paper-plane" style="color:var(--primary);"></i> Mesaj Gönder
            </h3>
            <p style="color:#64748b; font-size:0.85rem; margin-bottom:1.5rem;">Alıcı: <strong>${name}</strong> (${email})</p>
            
            <div style="display:flex; flex-direction:column; gap:1rem;">
                <div>
                    <label style="font-size:0.75rem; font-weight:700; color:#475569; display:block; margin-bottom:0.5rem;">MESAJ KONUSU</label>
                    <input type="text" id="directMsgSubject" placeholder="Örn: Bilgilendirme..." 
                           style="width:100%; padding:0.8rem; border-radius:12px; border:1px solid #e2e8f0; font-size:0.9rem;">
                </div>
                <div>
                    <label style="font-size:0.75rem; font-weight:700; color:#475569; display:block; margin-bottom:0.5rem;">MESAJINIZ</label>
                    <textarea id="directMsgBody" placeholder="Mesajınızı buraya yazın..." 
                              style="width:100%; height:120px; padding:0.8rem; border-radius:12px; border:1px solid #e2e8f0; font-size:0.9rem; resize:none;"></textarea>
                </div>
                <div style="display:flex; gap:1rem; margin-top:0.5rem;">
                    <button onclick="closeDirectModal()" style="flex:1; padding:0.8rem; border-radius:12px; border:1.5px solid #e2e8f0; background:white; font-weight:600; cursor:pointer;">Vazgeç</button>
                    <button onclick="sendDirectMessage()" style="flex:1; padding:0.8rem; border-radius:12px; background:var(--primary); color:white; font-weight:600; border:none; cursor:pointer;">Gönder</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.closeDirectModal = function() {
    document.getElementById('directMsgModal')?.remove();
};

window.sendDirectMessage = async function() {
    const subject = document.getElementById('directMsgSubject').value;
    const body = document.getElementById('directMsgBody').value;
    
    if(!subject || !body) {
        alert("Lütfen konu ve mesaj alanlarını doldurun.");
        return;
    }

    try {
        await addDoc(collection(db, "messages"), {
            sender: "admin@bellona.com.tr", // Admin e-postası (dinamikleştirilebilir)
            receiver: activeChatEmail,
            subject: subject,
            content: body,
            timestamp: serverTimestamp(),
            isRead: false
        });
        
        alert("Mesaj başarıyla gönderildi! ✅");
        closeDirectModal();
    } catch (err) {
        console.error("Mesaj gönderim hatası:", err);
        alert("Mesaj gönderilemedi. Hata: " + err.message);
    }
};

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
