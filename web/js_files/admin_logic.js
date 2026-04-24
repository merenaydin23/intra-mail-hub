import { auth, db } from './firebase/config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  collection, getDocs, doc, getDoc, 
  query, orderBy, limit, updateDoc, deleteDoc, where, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let allUsersData = [];
let currentFilter = 'all';

// Kategori Türkçe Etiketleri
const getCategoryLabel = (cat) => {
  const map = {
    'factory': 'Fabrika (Merkez)',
    'regional': 'Bölge Bayisi',
    'local': 'Yerel Bayi'
  };
  return map[cat] || cat || '-';
};

// =====================
// ORTAK AUTH VE HAZIRLIK
// =====================
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = '/index.html'; return; }

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists() || userDoc.data().role !== 'admin') {
      alert("Bu sayfaya erişim yetkiniz yok!");
      window.location.href = '/index.html';
      return;
    }

    const userData = userDoc.data();
    if(document.getElementById('adminName')) document.getElementById('adminName').textContent = userData.name;
    const initials = userData.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AD';
    if(document.getElementById('adminAvatar')) document.getElementById('adminAvatar').textContent = initials;

    const path = window.location.pathname;
    if (path.includes('yonetim.html')) initDashboard();
    if (path.includes('yonetim_personel')) initPersonel();
    if (path.includes('yonetim_ekle')) initEkle();
  } catch(e) { console.error("Auth error:", e); }
});

// =====================
// DASHBOARD OPTİMİZASYONU
// =====================
async function initDashboard() {
  try {
    // Tek seferde veriyi çek
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const nonAdmin = users.filter(u => u.role !== 'admin');

    // HIZLI HESAPLAMA (Single Pass)
    const stats = {
        regMgr: 0,
        dealers: new Set(),
        empl: 0,
        ages: [],
        oldest: {name:'-', age:0},
        coMap: {}
    };

    const today = new Date();
    nonAdmin.forEach(u => {
        // İstatistik toplama
        if (u.category === 'regional' && u.subRole === 'manager') stats.regMgr++;
        if (u.category === 'local') {
            if(u.company) stats.dealers.add(u.company);
            if(u.subRole === 'employee') stats.empl++;
        }

        // Yaş hesaplama
        if (u.birthDate) {
            const bd = new Date(u.birthDate);
            let age = today.getFullYear() - bd.getFullYear();
            if (today < new Date(today.getFullYear(), bd.getMonth(), bd.getDate())) age--;
            if (age > 0) {
                stats.ages.push(age);
                if (age > stats.oldest.age) stats.oldest = {name: u.name, age: age};
            }
        }

        // Şirket Dağılımı
        const coKey = (u.company || 'Bilinmiyor').replace(/[-\s]/g, '').toLowerCase();
        if (!stats.coMap[coKey]) stats.coMap[coKey] = { pretty: u.company || 'Bilinmiyor', count: 0, ageSum: 0, ageCount: 0 };
        stats.coMap[coKey].count++;
        const uAge = u.birthDate ? (today.getFullYear() - new Date(u.birthDate).getFullYear()) : 0;
        if(uAge > 0) { stats.coMap[coKey].ageSum += uAge; stats.coMap[coKey].ageCount++; }
    });

    // UI'ya Bas
    if(document.getElementById('statRegionalManagers')) document.getElementById('statRegionalManagers').textContent = stats.regMgr;
    if(document.getElementById('statTotalDealers')) document.getElementById('statTotalDealers').textContent = stats.dealers.size;
    if(document.getElementById('statDealerEmployees')) document.getElementById('statDealerEmployees').textContent = stats.empl;
    if(document.getElementById('statTotalUsers')) document.getElementById('statTotalUsers').textContent = users.length;
    
    if(document.getElementById('statAvgAge')) {
        const avgGlobal = stats.ages.length ? Math.round(stats.ages.reduce((a,b)=>a+b,0)/stats.ages.length) : 0;
        document.getElementById('statAvgAge').textContent = avgGlobal;
    }
    if(document.getElementById('statOldestName')) document.getElementById('statOldestName').textContent = stats.oldest.name;
    if(document.getElementById('statOldestAge')) document.getElementById('statOldestAge').innerHTML = `En Yaşlı Personel &bull; ${stats.oldest.age} yaş`;

    // Dağılım Tablosu
    const breakdownTbody = document.getElementById('companyBreakdownTable');
    if (breakdownTbody) {
        breakdownTbody.innerHTML = Object.values(stats.coMap).sort((a,b)=>b.count - a.count).map(c => `
            <tr>
                <td><strong>${c.pretty}</strong></td>
                <td><strong>${c.count}</strong> personel</td>
                <td>${c.ageCount ? Math.round(c.ageSum/c.ageCount) : '-'} yaş</td>
            </tr>
        `).join('');
    }

    // Son Operasyonlar (Sadece ilk 6 yeterli dashboard için)
    const recentTbody = document.getElementById('recentUsersTable');
    if (recentTbody) {
        recentTbody.innerHTML = users.slice(0, 6).map(u => `
            <tr>
                <td><strong>${u.name}</strong><br/><small>${u.company || '-'}</small></td>
                <td><span class="role-tag" style="background:#f1f5f9; color:var(--primary); font-size:0.7rem; font-weight:800;">${getCategoryLabel(u.category).toUpperCase()}</span></td>
                <td><div class="status-badge" style="${u.isActive ? 'background:#ecfdf5; color:#059669;' : 'background:#f1f5f9; color:#64748b;'}"><span class="status-dot ${u.isActive?'active':'passive'}"></span> ${u.isActive?'Aktif':'Pasif'}</div></td>
                <td>${u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('tr-TR') : '-'}</td>
            </tr>
        `).join('');
    }

    renderBirthdays(nonAdmin);
  } catch (err) { console.error("Dashboard error:", err); }
}

function renderBirthdays(users) {
    const list = document.getElementById('birthdayList');
    if (!list) return;
    const today = new Date();
    const upcoming = users.filter(u => {
        if(!u.birthDate) return false;
        const b = new Date(u.birthDate);
        const bThis = new Date(today.getFullYear(), b.getMonth(), b.getDate());
        const bNext = new Date(today.getFullYear()+1, b.getMonth(), b.getDate());
        const d1 = (bThis-today)/86400000;
        const d2 = (bNext-today)/86400000;
        return (d1>=0 && d1<=30) || (d2>=0 && d2<=30);
    }).sort((a,b) => new Date(a.birthDate).getMonth() - new Date(b.birthDate).getMonth());

    list.innerHTML = upcoming.map(u => `
        <div class="birthday-row">
            <div style="flex:1;"><strong>${u.name}</strong><p style="font-size:0.75rem; color:#64748b;">${u.company}</p></div>
            <button class="btn-greet" onclick="greetBirthday('${u.name}','${u.email}','${u.company}')">Kutla</button>
        </div>
    `).join('') || '<p style="text-align:center; color:#94a3b8; font-size:0.85rem;">Yakın zamanda doğum günü yok.</p>';
}

window.greetBirthday = (name, email, company) => {
    const text = `Değerli iş ortağımız,\n\nDoğum gününüzü kutlarız! 🎉 Sayın ${company} bayimizin personeli ${name} olarak nice yıllara...`;
    navigator.clipboard.writeText(text).then(() => alert("Mesaj kopyalandı! ✅"));
};

// =====================
// PERSONEL SAYFASI
// =====================
async function initPersonel() {
    try {
        const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
        allUsersData = snap.docs.map(d=>({id:d.id, ...d.data()}));
        renderUserTable();
        document.getElementById('userSearchInput')?.addEventListener('input', renderUserTable);
        document.getElementById('companyFilter')?.addEventListener('change', renderUserTable);
    } catch(e) { console.error(e); }
}

function renderUserTable() {
    const table = document.getElementById('allUsersTable');
    if(!table) return;
    const search = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
    const coFilter = document.getElementById('companyFilter')?.value || 'all';

    const filtered = allUsersData.filter(u => {
        if(u.role==='admin') return false;
        const coMatch = coFilter==='all' || u.company?.replace(/[-\s]/g,'').toLowerCase() === coFilter;
        return coMatch && (!search || u.name?.toLowerCase().includes(search));
    }).sort((a,b) => (b.subRole==='manager'?1:0) - (a.subRole==='manager'?1:0));

    table.innerHTML = filtered.map(u => {
        const initials = u.name?.split(' ').map(n=>n[0]).join('').toUpperCase() || 'U';
        return `
            <tr>
                <td><div style="display:flex; align-items:center; gap:10px;"><div class="avatar-mini-box" style="width:35px;height:35px;background:#4f46e5;color:white;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:0.8rem;">${initials}</div><div><strong>${u.name}</strong><br/><small>${u.company}</small></div></div></td>
                <td><small>${u.email}</small><br/><b>PW: ${u.password}</b></td>
                <td><small>TC: ${u.tcNo}</small><br/><small>DT: ${u.birthDate}</small></td>
                <td><span style="font-size:0.7rem; font-weight:800; background:#f1f5f9; padding:4px 8px; border-radius:4px;">${getCategoryLabel(u.category).toUpperCase()}</span><br/><small>${u.subRole==='manager'?'BAYİ SAHİBİ':'PERSONEL'}</small></td>
                <td><div class="status-badge ${u.isActive?'active':'passive'}" style="padding:4px 10px; font-size:0.75rem;"><span class="status-dot"></span> ${u.isActive?'Aktif':'Pasif'}</div></td>
                <td><button class="btn-action" onclick="deleteUser('${u.id}')"><i class="fa-solid fa-trash-can"></i></button></td>
            </tr>
        `;
    }).join('');
}

// =====================
// EKLEME SAYFASI
// =====================

// Türkçe karakterleri normalize et, boşluk ve özel karakter temizle
function normalizeTr(str) {
    return str
        .toLowerCase()
        .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u')
        .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ı/g, 'i')
        .replace(/İ/g, 'i').replace(/Ş/g, 's').replace(/Ğ/g, 'g')
        .replace(/Ü/g, 'u').replace(/Ö/g, 'o').replace(/Ç/g, 'c')
        .replace(/[^a-z0-9.]/g, ''); // sadece harf, rakam, nokta bırak
}

// Rol + Ad + Firma'ya göre e-posta üret
function generateEmail(name, company, category, subRole) {
    const firstName = normalizeTr(name.trim().split(' ')[0]); // Sadece ilk ad
    const firmSlug = normalizeTr((company || '').replace(/\s+/g, '')); // Firma adı slug

    if (category === 'factory') {
        return `${firstName}.fabrika@bellona.com.tr`;
    } else if (category === 'regional') {
        return `${firstName}.${firmSlug}.bolge@bellona.com.tr`;
    } else if (category === 'local') {
        if (subRole === 'manager') {
            return `${firstName}.${firmSlug}.yerel@bellona.com.tr`;
        } else {
            return `${firstName}.${firmSlug}.calisan@bellona.com.tr`;
        }
    }
    return `${firstName}@bellona.com.tr`;
}

function updateEmailPreview() {
    const name = document.getElementById('newUserName')?.value || '';
    const company = document.getElementById('newUserCompany')?.value || '';
    const category = document.getElementById('newUserCategory')?.value || '';
    const subRole = document.getElementById('newUserSubRole')?.value || 'employee';
    const emailField = document.getElementById('newUserEmail');
    if (!emailField) return;
    if (name && category) {
        emailField.value = generateEmail(name, company, category, subRole);
    } else {
        emailField.value = '';
        emailField.placeholder = 'Otomatik Üretilecek';
    }
}

// 10 karakterli şifre üretici: 6 harf + 2 simge + 2 rakam
function generateStrictPassword() {
    const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    const symbols = '!@#$%&*-_+';
    const digits  = '23456789';
    let pw = [];
    for (let i = 0; i < 6; i++) pw.push(letters[Math.floor(Math.random() * letters.length)]);
    for (let i = 0; i < 2; i++) pw.push(symbols[Math.floor(Math.random() * symbols.length)]);
    for (let i = 0; i < 2; i++) pw.push(digits[Math.floor(Math.random() * digits.length)]);
    for (let i = pw.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pw[i], pw[j]] = [pw[j], pw[i]];
    }
    return pw.join('');
}

function initEkle() {
    const form = document.getElementById('addUserForm');

    const toggleFields = () => {
        const cat = document.getElementById('newUserCategory').value;
        const compGroup = document.getElementById('companyGroup');
        if(cat === 'factory') {
            document.getElementById('newUserCompany').value = 'Bellona Merkez';
            if(compGroup) compGroup.style.display = 'none';
        } else {
            document.getElementById('newUserCompany').value = '';
            if(compGroup) compGroup.style.display = 'block';
        }
        updateEmailPreview();
    };

    const toggleRoleFields = () => {
        const subRole = document.getElementById('newUserSubRole').value;
        const deptGroup = document.getElementById('deptGroup');
        if (subRole === 'manager') {
            document.getElementById('newUserDepartment').value = 'Yönetici / Sahip';
            if (deptGroup) deptGroup.style.display = 'none';
        } else {
            document.getElementById('newUserDepartment').value = '';
            if (deptGroup) deptGroup.style.display = 'block';
        }
        updateEmailPreview();
    };

    // Herhangi bir ilgili alan değiştiğinde e-postayı güncelle
    document.getElementById('newUserName')?.addEventListener('input', updateEmailPreview);
    document.getElementById('newUserCategory')?.addEventListener('change', toggleFields);
    document.getElementById('newUserCompany')?.addEventListener('input', updateEmailPreview);
    document.getElementById('newUserSubRole')?.addEventListener('change', toggleRoleFields);

    const pwInput = document.getElementById('newUserPassword');
    const btnCopyPw = document.getElementById('btnCopyUserPw');
    
    // Sayfa yüklendiğinde şifreyi oluştur ve alanları ayarla
    if(pwInput && !pwInput.value) {
        pwInput.value = generateStrictPassword();
    }
    toggleRoleFields(); // Başlangıçta depertman alanını duruma göre gizle/göster
    
    if(btnCopyPw) {
        btnCopyPw.addEventListener('click', () => {
            if(!pwInput.value) return;
            navigator.clipboard.writeText(pwInput.value).then(() => {
                const oldHTML = btnCopyPw.innerHTML;
                btnCopyPw.innerHTML = '<i class="fa-solid fa-check"></i> Kopyalandı!';
                btnCopyPw.style.background = 'rgba(16,185,129,0.2)';
                btnCopyPw.style.color = '#059669';
                setTimeout(() => {
                    btnCopyPw.innerHTML = oldHTML;
                    btnCopyPw.style.background = 'rgba(79,70,229,0.1)';
                    btnCopyPw.style.color = 'var(--primary)';
                }, 2000);
            });
        });
    }

    form?.addEventListener('submit', handleAddUser);
}

async function handleAddUser(e) {
    e.preventDefault();
    const name     = document.getElementById('newUserName').value.trim();
    const tcNo     = document.getElementById('newUserTc').value.trim();
    const birthDate= document.getElementById('newUserBirth').value;
    const category = document.getElementById('newUserCategory').value;
    const company  = document.getElementById('newUserCompany').value.trim();
    const department= document.getElementById('newUserDepartment').value.trim();
    const subRole  = document.getElementById('newUserSubRole').value;
    const email    = generateEmail(name, company, category, subRole);
    const password = document.getElementById('newUserPassword').value;

    const data = {
        name, tcNo, birthDate, category, company, department, subRole,
        email, password,
        isActive: true, role: 'user', createdAt: serverTimestamp()
    };

    const btn = document.getElementById('addUserBtn');
    const msg = document.getElementById('formMessage');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor...';

    try {
        await addDoc(collection(db, "users"), data);
        msg.style.display = 'block';
        msg.style.background = '#ecfdf5';
        msg.style.color = '#065f46';
        msg.innerHTML = `✅ <strong>${name}</strong> başarıyla eklendi!<br>📧 E-posta: <strong>${email}</strong> &nbsp;|&nbsp; 🔑 Şifre: <strong>${password}</strong>`;
        e.target.reset();
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserPassword').value = generateStrictPassword();
        toggleRoleFields();
    } catch(err) {
        msg.style.display = 'block';
        msg.style.background = '#fef2f2';
        msg.style.color = '#991b1b';
        msg.innerHTML = `❌ Hata: ${err.message}`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Personel Kaydını Tamamla';
    }
}

window.deleteUser = async (id) => {
    if(!confirm('Emin misiniz?')) return;
    try { await deleteDoc(doc(db, "users", id)); location.reload(); } catch(e) { alert(e.message); }
};
