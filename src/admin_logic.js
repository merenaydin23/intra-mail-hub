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

  // Sayfa bazlı tetikleyiciler
  const path = window.location.pathname;
  if (path.includes('yonetim.html')) initDashboard();
  if (path.includes('yonetim_personel')) initPersonel();
  if (path.includes('yonetim_ekle')) initEkle();
  if (path.includes('yonetim_mesajlar')) loadAllMessages();
});

function getInitials(name) { return name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AD'; }

// =====================
// DASHBOARD MANTIĞI
// =====================
async function initDashboard() {
  try {
    const snap = await getDocs(collection(db, "users"));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const nonAdmin = users.filter(u => u.role !== 'admin');

    const calcAge = (birthDate) => {
      if (!birthDate) return null;
      const today = new Date();
      const bd = new Date(birthDate);
      let age = today.getFullYear() - bd.getFullYear();
      if (today < new Date(today.getFullYear(), bd.getMonth(), bd.getDate())) age--;
      return age;
    };

    // Dashboard Kartları
    const oldest = nonAdmin.map(u=>({...u, age:calcAge(u.birthDate)})).filter(u=>u.age).reduce((a,b)=>a.age>b.age?a:b, {name:'-', age:0});
    const avgAgeValue = Math.round(nonAdmin.map(u=>calcAge(u.birthDate)).filter(a=>a).reduce((s,a)=>s+a,0) / nonAdmin.length) || 0;

    if(document.getElementById('statAvgAge')) document.getElementById('statAvgAge').textContent = avgAgeValue;
    if(document.getElementById('statOldestName')) document.getElementById('statOldestName').textContent = oldest.name;
    if(document.getElementById('statOldestAge')) document.getElementById('statOldestAge').innerHTML = `En Yaşlı Personel &bull; ${oldest.age} yaş`;

    renderBirthdays(nonAdmin);

    // Dağılım Tablosu (Normalleştirilmiş)
    const companyMap = {};
    nonAdmin.forEach(u => {
      const key = (u.company || 'Bellona').replace(/[-\s]/g, '').toLowerCase();
      if(!companyMap[key]) companyMap[key] = { pretty: u.company || 'Bellona', count: 0, ages: [] };
      companyMap[key].count++;
      const a = calcAge(u.birthDate);
      if(a) companyMap[key].ages.push(a);
    });

    const breakdownTbody = document.getElementById('companyBreakdownTable');
    if(breakdownTbody) {
        breakdownTbody.innerHTML = Object.values(companyMap).sort((a,b)=>b.count-a.count).map(data => {
            const avg = data.ages.length ? Math.round(data.ages.reduce((s,a)=>s+a,0)/data.ages.length) : '-';
            return `<tr><td><strong>${data.pretty}</strong></td><td><strong>${data.count}</strong> personel</td><td>${avg} yaş</td></tr>`;
        }).join('');
    }

    // Son Operasyonlar
    const recentTbody = document.getElementById('recentUsersTable');
    if(recentTbody) {
        recentTbody.innerHTML = users.slice(0,10).map(u => `
            <tr>
                <td><strong>${u.name}</strong><br/><small>${u.company || '-'}</small></td>
                <td><span class="role-tag">${getCategoryLabel(u.category).toUpperCase()}</span></td>
                <td><div class="status-badge ${u.isActive?'active':'passive'}"><span class="status-dot"></span> ${u.isActive?'Aktif':'Pasif'}</div></td>
                <td>${u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('tr-TR') : '-'}</td>
            </tr>
        `).join('');
    }
  } catch(e) { console.error(e); }
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
        const d1 = (bThis - today) / 86400000;
        const d2 = (bNext - today) / 86400000;
        return (d1>=0 && d1<=30) || (d2>=0 && d2<=30);
    }).sort((a,b) => new Date(a.birthDate).getMonth() - new Date(b.birthDate).getMonth());

    list.innerHTML = upcoming.map(u => `
        <div class="birthday-row">
            <div><strong>${u.name}</strong><p>${u.company}</p></div>
            <button class="btn-greet" onclick="greetBirthday('${u.name}','${u.email}','${u.company}')">Kutla</button>
        </div>
    `).join('') || '<p>Yaklaşan doğum günü yok.</p>';
}

window.greetBirthday = (name, email, company) => {
    const text = `Değerli iş ortağımız,\n\nDoğum gününüzü en içten dileklerimizle kutlarız...\n\nSayın ${company} bayimizin güzide personeli ${name} olarak...`;
    navigator.clipboard.writeText(text).then(() => alert("Kutlama metni kopyalandı! ✅"));
};

// =====================
// PERSONEL LİSTESİ
// =====================
async function initPersonel() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    allUsersData = snap.docs.map(d=>({id:d.id, ...d.data()}));
    
    document.getElementById('userSearchInput')?.addEventListener('input', renderUserTable);
    document.getElementById('companyFilter')?.addEventListener('change', renderUserTable);
    renderUserTable();
}

function renderUserTable() {
    const table = document.getElementById('allUsersTable');
    if(!table) return;
    const search = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
    const coFilter = document.getElementById('companyFilter')?.value || 'all';

    const filtered = allUsersData.filter(u => {
        if(u.role==='admin') return false;
        const coMatch = coFilter==='all' || u.company?.replace(/[-\s]/g,'').toLowerCase() === coFilter;
        const searchMatch = !search || u.name?.toLowerCase().includes(search) || u.email?.toLowerCase().includes(search);
        return coMatch && searchMatch;
    }).sort((a,b) => (b.subRole==='manager'?1:0) - (a.subRole==='manager'?1:0));

    table.innerHTML = filtered.map(u => {
        const initials = u.name?.split(' ').map(n=>n[0]).join('').toUpperCase() || 'U';
        return `
            <tr class="anim-fade-up">
                <td><div style="display:flex; align-items:center; gap:10px;"><div class="avatar-mini">${initials}</div><div><strong>${u.name}</strong><br/><small>${u.company}</small></div></div></td>
                <td>${u.email}<br/><small>PW: ${u.password}</small></td>
                <td>TC: ${u.tcNo}<br/><small>DT: ${u.birthDate}</small></td>
                <td><span class="tag">${getCategoryLabel(u.category).toUpperCase()}</span><br/><small>${u.subRole==='manager'?'BAYİ SAHİBİ':'PERSONEL'}</small></td>
                <td><div class="status-badge ${u.isActive?'active':'passive'}"><span></span> ${u.isActive?'Aktif':'Pasif'}</div></td>
                <td><button onclick="deleteUser('${u.id}')"><i class="fa-solid fa-trash-can"></i></button></td>
            </tr>
        `;
    }).join('');
}

// =====================
// YENİ EKLEME MANTIĞI
// =====================
function initEkle() {
    const form = document.getElementById('addUserForm');
    const catSel = document.getElementById('newUserCategory');
    const roleSel = document.getElementById('newUserSubRole');

    const toggleFields = () => {
        const cat = catSel.value;
        const role = roleSel.value;
        const compGroup = document.getElementById('companyGroup');
        const deptGroup = document.getElementById('deptGroup');

        if(cat === 'factory') {
            document.getElementById('newUserCompany').value = 'Bellona Merkez';
            if(compGroup) compGroup.style.display = 'none';
            if(role === 'manager') {
                document.getElementById('newUserDepartment').value = 'Genel Yönetim';
                if(deptGroup) deptGroup.style.display = 'none';
            } else {
                if(deptGroup) deptGroup.style.display = 'block';
            }
        } else {
            if(compGroup) compGroup.style.display = 'block';
            if(deptGroup) deptGroup.style.display = 'block';
        }
    };

    catSel?.addEventListener('change', toggleFields);
    roleSel?.addEventListener('change', toggleFields);
    form?.addEventListener('submit', handleAddUser);
}

async function handleAddUser(e) {
    e.preventDefault();
    const btn = document.getElementById('addUserBtn');
    const data = {
        name: document.getElementById('newUserName').value,
        tcNo: document.getElementById('newUserTc').value,
        birthDate: document.getElementById('newUserBirth').value,
        category: document.getElementById('newUserCategory').value,
        company: document.getElementById('newUserCompany').value,
        department: document.getElementById('newUserDepartment').value,
        subRole: document.getElementById('newUserSubRole').value,
        email: `${document.getElementById('newUserName').value.toLowerCase().replace(/\s/g,'')}@bellona.com.tr`,
        password: Math.random().toString(36).slice(-8),
        isActive: true, role: 'user', createdAt: serverTimestamp()
    };
    try {
        await addDoc(collection(db, "users"), data);
        alert("Başarılı! ✅"); e.target.reset();
    } catch(err) { alert(err.message); }
}

window.deleteUser = async (id) => {
    if(confirm('Silmek istediğine emin misin?')) {
        await deleteDoc(doc(db, "users", id));
        location.reload();
    }
};
