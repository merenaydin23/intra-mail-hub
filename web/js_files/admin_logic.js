import { auth, db } from './firebase/config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  collection, getDocs, doc, getDoc, 
  query, orderBy, limit, updateDoc, deleteDoc, where, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// =====================
// UTILS
// =====================

function normalizeTr(str) {
    return str
        .toLowerCase()
        .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u')
        .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ı/g, 'i')
        .replace(/İ/g, 'i').replace(/Ş/g, 's').replace(/Ğ/g, 'g')
        .replace(/Ü/g, 'u').replace(/Ö/g, 'o').replace(/Ç/g, 'c')
        .replace(/[^a-z0-9.]/g, '');
}

// 10 karakterli şifre: 6 harf + 2 simge + 2 rakam
export function generateStrictPassword() {
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

// Rol + Ad + Soyad'a göre e-posta üret
async function generateUniqueEmail(name, surname) {
    const base = `${normalizeTr(name)}.${normalizeTr(surname)}`;
    let email = `${base}@bellona.com.tr`;
    
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const snap = await getDocs(q);
    
    if (snap.empty) return email;
    
    // Çakışma varsa numara ekle
    let i = 2;
    while (true) {
        email = `${base}${i}@bellona.com.tr`;
        const q2 = query(usersRef, where("email", "==", email));
        const snap2 = await getDocs(q2);
        if (snap2.empty) return email;
        i++;
    }
}

// =====================
// AUTH CHECK
// =====================
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '/index.html'; return; }
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'admin') {
            window.location.href = '/index.html';
            return;
        }
        initPage();
    } catch(e) { console.error(e); }
});

function initPage() {
    const path = window.location.pathname;
    if (path.includes('yonetim.html')) initDashboard();
    if (path.includes('yonetim_personel.html')) initPersonel();
    if (path.includes('yonetim_ekle.html')) initEkle();
}

// =====================
// DASHBOARD
// =====================
async function initDashboard() {
    const snap = await getDocs(collection(db, "users"));
    const users = snap.docs.map(d => d.data()).filter(u => u.role !== 'admin');
    
    // Otomatik Bölge Bayi Tanımlama (Revize Edilmiş Liste)
    if (localStorage.getItem('dealers_seeded_v2') !== 'true') {
        const dealers = [
            { name: "Karavil", surname: "Group", email: "karavil.group@bellona.com.tr", password: "kRv!89pL12", company: "Karavil Group", region: "Doğu Anadolu", category: "regional", subRole: "manager" },
            { name: "Atasaylar", surname: "Group", email: "atasaylar.group@bellona.com.tr", password: "aTs#44mK56", company: "Atasaylar Group", region: "İç Anadolu", category: "regional", subRole: "manager" },
            { name: "Karavil", surname: "Marmara", email: "karavil.marmara@bellona.com.tr", password: "mRm*23zX90", company: "Karavil Marmara", region: "Güneydoğu Anadolu", category: "regional", subRole: "manager" },
            { name: "Horazan", surname: "Group", email: "horazan.group@bellona.com.tr", password: "hRz@11vB78", company: "Horazan Group", region: "Akdeniz", category: "regional", subRole: "manager" },
            { name: "Gümüşbaşlar", surname: "Birliği", email: "gumusbaslar.birligi@bellona.com.tr", password: "gMs$77nJ34", company: "Gümüşbaşlar Şirket Birliği", region: "Marmara", category: "regional", subRole: "manager" },
            { name: "Yılmaz", surname: "Group", email: "yilmaz.group@bellona.com.tr", password: "yLm%55dQ11", company: "Yılmaz Group", region: "Karadeniz", category: "regional", subRole: "manager" },
            { name: "Karavil Group", surname: "Ege", email: "karavil.ege@bellona.com.tr", password: "kRv&66rW22", company: "Karavil Group Ege", region: "Ege", category: "regional", subRole: "manager" }
        ];

        for (const d of dealers) {
            await addDoc(collection(db, "users"), {
                ...d,
                role: "user",
                isActive: true,
                department: "Yönetici / Patron",
                createdAt: serverTimestamp()
            });
        }
        localStorage.setItem('dealers_seeded_v2', 'true');
        location.reload();
    }

    document.getElementById('statTotal').textContent = users.length;
    
    const regions = {};
    const dealers = {};
    users.forEach(u => {
        if(u.region) regions[u.region] = (regions[u.region] || 0) + 1;
        if(u.company) dealers[u.company] = (dealers[u.company] || 0) + 1;
    });
    
    const largestDealer = Object.entries(dealers).sort((a,b)=>b[1]-a[1])[0]?.[0] || '-';
    document.getElementById('statLargest').textContent = largestDealer;
    
    // Birthday Check
    const today = new Date();
    const bornToday = users.filter(u => {
        if(!u.birthDate) return false;
        const b = new Date(u.birthDate);
        return b.getDate() === today.getDate() && b.getMonth() === today.getMonth();
    });
    document.getElementById('statBirthdays').textContent = bornToday.length;
}

// =====================
// PERSONEL LİSTESİ
// =====================
let allUsers = [];

async function initPersonel() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    allUsers = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(u => u.role !== 'admin');
    
    const searchIn = document.getElementById('searchUser');
    const filterCat = document.getElementById('filterCategory');
    const filterReg = document.getElementById('filterRegion');

    const applyFilters = () => {
        const term = searchIn.value.toLowerCase();
        const cat = filterCat.value;
        const reg = filterReg.value;

        const filtered = allUsers.filter(u => {
            const matchSearch = (u.name + ' ' + u.surname + ' ' + (u.company || '')).toLowerCase().includes(term);
            const matchCat = (cat === 'all' || u.category === cat);
            const matchReg = (reg === 'all' || u.region === reg);
            return matchSearch && matchCat && matchReg;
        });
        renderTable(filtered);
    };

    [searchIn, filterCat, filterReg].forEach(el => {
        el?.addEventListener('input', applyFilters);
        el?.addEventListener('change', applyFilters);
    });

    renderTable(allUsers);
}

function renderTable(users) {
    const tbody = document.getElementById('userTableBody');
    if(!tbody) return;
    tbody.innerHTML = users.map(u => {
        let catLabel = 'Bilinmiyor';
        if(u.category === 'factory') catLabel = 'FABRİKA';
        if(u.category === 'regional') catLabel = 'BÖLGE BAYİSİ';
        if(u.category === 'local') catLabel = 'YEREL BAYİ';

        return `
            <tr>
                <td><strong>${u.name} ${u.surname}</strong></td>
                <td><small>${u.email}</small></td>
                <td><span class="badge" style="background:#f1f5f9; color:#475569; font-size:0.7rem;">${catLabel}</span></td>
                <td>${u.region || '-'}</td>
                <td>${u.company || '-'}</td>
                <td><span class="badge ${u.subRole === 'manager' ? 'badge-accent' : 'badge-primary'}">${u.subRole === 'manager' ? 'PATRON' : 'ÇALIŞAN'}</span></td>
                <td><button onclick="deleteUser('${u.id}')" style="border:none; background:none; color:#ef4444; cursor:pointer;"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
        `;
    }).join('');
}

// =====================
// EKLEME SAYFASI
// =====================
function initEkle() {
    const nameIn = document.getElementById('newName');
    const surnameIn = document.getElementById('newSurname');
    const catIn = document.getElementById('newCategory');
    const roleIn = document.getElementById('newSubRole');
    const regionIn = document.getElementById('newRegion');
    const companyIn = document.getElementById('newCompany'); // Local
    const regionCompanyIn = document.getElementById('newRegionCompany'); // Regional
    const deptGroup = document.getElementById('deptGroup');
    const pwIn = document.getElementById('newPassword');
    const emailPreview = document.getElementById('newEmail');
    
    if(pwIn) pwIn.value = generateStrictPassword();
    
    const updateUI = () => {
        // 1. Kategori Kontrolü
        if(catIn.value === 'factory') {
            companyIn.value = 'Bellona Genel Müdürlük';
            companyIn.style.display = 'block';
            regionCompanyIn.style.display = 'none';
            companyIn.readOnly = true;
        } else if(catIn.value === 'regional') {
            companyIn.style.display = 'none';
            regionCompanyIn.style.display = 'block';
            companyIn.readOnly = false;
        } else {
            companyIn.style.display = 'block';
            regionCompanyIn.style.display = 'none';
            companyIn.readOnly = false;
            if(companyIn.value === 'Bellona Genel Müdürlük') companyIn.value = '';
        }

        // 2. Rol Kontrolü
        if(roleIn.value === 'manager') {
            deptGroup.style.display = 'none';
        } else {
            deptGroup.style.display = 'block';
        }

        // 3. Email Önizleme
        if(nameIn.value && surnameIn.value) {
            emailPreview.value = `${normalizeTr(nameIn.value)}.${normalizeTr(surnameIn.value)}@bellona.com.tr`;
        }
    };
    
    [nameIn, surnameIn, catIn, roleIn].forEach(el => el?.addEventListener('input', updateUI));
    [catIn, roleIn].forEach(el => el?.addEventListener('change', updateUI));
    
    updateUI(); 
    
    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = await generateUniqueEmail(nameIn.value, surnameIn.value);
        const finalCompany = (catIn.value === 'regional') ? regionCompanyIn.value : companyIn.value;
        
        const data = {
            name: nameIn.value,
            surname: surnameIn.value,
            birthDate: document.getElementById('newBirth').value,
            category: catIn.value,
            region: regionIn.value,
            company: finalCompany,
            subRole: roleIn.value,
            department: roleIn.value === 'manager' ? 'Yönetici / Patron' : document.getElementById('newDept').value,
            email: email,
            password: pwIn.value,
            role: 'user',
            isActive: true,
            createdAt: serverTimestamp()
        };
        
        await addDoc(collection(db, "users"), data);
        alert(`Kullanıcı başarıyla eklendi!\nE-posta: ${email}`);
        location.reload();
    });
}

window.deleteUser = async (id) => {
    if(confirm('Silmek istediğine emin misin?')) {
        await deleteDoc(doc(db, "users", id));
        location.reload();
    }
};
