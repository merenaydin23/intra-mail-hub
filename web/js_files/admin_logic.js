import { db } from './firebase/config.js';
import { 
    collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// =====================
// YARDIMCI FONKSİYONLAR
// =====================

// Türkçe karakter temizleme ve küçük harfe çevirme
function normalizeTr(text) {
    if (!text) return "";
    return text.trim().toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/\s+/g, '.') // Boşlukları nokta yap
        .replace(/[^a-z0-9.]/g, ''); // Sadece harf, rakam ve nokta kalsın
}

// Şifre Üretici (10 Hane: Harf + Rakam + Simge)
export function generateStrictPassword() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const nums = "0123456789";
    const syms = "!@#$%^&*";
    let pw = [];
    for(let i=0; i<6; i++) pw.push(chars[Math.floor(Math.random()*chars.length)]);
    for(let i=0; i<2; i++) pw.push(nums[Math.floor(Math.random()*nums.length)]);
    for(let i=0; i<2; i++) pw.push(syms[Math.floor(Math.random()*syms.length)]);
    return pw.sort(() => Math.random() - 0.5).join('');
}

// Kurumsal E-posta Üretimi: name.surname@bellona.com.tr
async function generateEnterpriseEmail(name, surname) {
    const base = `${normalizeTr(name)}.${normalizeTr(surname)}`;
    let email = `${base}@bellona.com.tr`;
    
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const snap = await getDocs(q);
    
    if (snap.empty) return email;
    
    // Çakışma varsa: name.surname2@...
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
// DASHBOARD & SEEDING
// =====================
async function initDashboard() {
    // 7 Bölge Bayi Patronunu Sıfırdan Tanımla (Enterprise Format)
    const regionalCheck = await getDocs(query(collection(db, "users"), where("category", "==", "regional")));
    if (regionalCheck.empty) {
        const dealers = [
            { name: "Abdulkadir", surname: "Karavil", company: "Karavil Group", region: "Doğu Anadolu" },
            { name: "Ercan", surname: "Yılmaz", company: "Yılmaz Group", region: "İç Anadolu" },
            { name: "Abdullah", surname: "Gümüşbağlar", company: "Gümüşbağlar Şirket Birliği", region: "Karadeniz" },
            { name: "Kenan", surname: "Aydın", company: "Aydın Group", region: "Güneydoğu Anadolu" },
            { name: "Yılmaz", surname: "Karavil", company: "Karavil Marmara", region: "Marmara" },
            { name: "Kenan", surname: "Atasay", company: "Atasaylar Group", region: "Akdeniz" },
            { name: "Hakan", surname: "Kırklar", company: "Kırklar Şirketler Birliği", region: "Ege" }
        ];

        for (const d of dealers) {
            const email = `${normalizeTr(d.name)}.${normalizeTr(d.surname)}@bellona.com.tr`;
            await addDoc(collection(db, "users"), {
                ...d,
                email: email,
                password: generateStrictPassword(),
                category: "regional",
                subRole: "manager", // Owner
                role: "user",
                isActive: true,
                department: null,
                birthDate: "1970-01-01",
                createdAt: serverTimestamp()
            });
        }
        location.reload();
    }

    const snap = await getDocs(collection(db, "users"));
    const users = snap.docs.map(d => d.data()).filter(u => u.role !== 'admin');
    
    document.getElementById('statTotal').textContent = users.length;
    // ... diğer istatistikler
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

    [searchIn, filterCat, filterReg].forEach(el => el?.addEventListener('input', applyFilters));
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
                <td><span class="badge" style="background:#f1f5f9; color:#475569;">${catLabel}</span></td>
                <td>${u.region || '-'}</td>
                <td>${u.company || '-'}</td>
                <td><span class="badge ${u.subRole === 'manager' ? 'badge-accent' : 'badge-primary'}">${u.subRole === 'manager' ? 'PATRON' : 'ÇALIŞAN'}</span></td>
                <td><button onclick="deleteUser('${u.id}')" class="btn-delete"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
        `;
    }).join('');
}

// =====================
// YENİ KAYIT (ONBOARDING)
// =====================
function initEkle() {
    const nameIn = document.getElementById('newName');
    const surnameIn = document.getElementById('newSurname');
    const catIn = document.getElementById('newCategory');
    const roleIn = document.getElementById('newSubRole');
    const regionIn = document.getElementById('newRegion');
    const companyIn = document.getElementById('newCompany');
    const regionCompanyIn = document.getElementById('newRegionCompany');
    const deptGroup = document.getElementById('deptGroup');
    const pwIn = document.getElementById('newPassword');
    const emailPreview = document.getElementById('newEmail');
    
    if(pwIn) pwIn.value = generateStrictPassword();
    
    const updateUI = () => {
        // 1. Kategori Mantığı
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

        // 2. Rol Mantığı (Owner vs Employee)
        if(roleIn.value === 'manager') {
            deptGroup.style.display = 'none';
        } else {
            deptGroup.style.display = 'block';
        }

        // 3. Email Önizleme (Saf Enterprise Format)
        if(nameIn.value && surnameIn.value) {
            emailPreview.value = `${normalizeTr(nameIn.value)}.${normalizeTr(surnameIn.value)}@bellona.com.tr`;
        }
    };
    
    [nameIn, surnameIn, catIn, roleIn].forEach(el => el?.addEventListener('input', updateUI));
    updateUI(); 
    
    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = await generateEnterpriseEmail(nameIn.value, surnameIn.value);
        const finalCompany = (catIn.value === 'regional') ? regionCompanyIn.value : companyIn.value;
        
        const data = {
            name: nameIn.value,
            surname: surnameIn.value,
            birthDate: document.getElementById('newBirth').value,
            category: catIn.value,
            region: regionIn.value,
            company: finalCompany,
            subRole: roleIn.value,
            department: roleIn.value === 'manager' ? null : document.getElementById('newDept').value,
            email: email,
            password: pwIn.value,
            role: 'user',
            isActive: true,
            createdAt: serverTimestamp()
        };
        
        await addDoc(collection(db, "users"), data);
        alert(`Personel başarıyla kaydedildi!\nE-posta: ${email}`);
        location.reload();
    });
}

// Global Fonksiyonlar
window.deleteUser = async (id) => {
    if(confirm("Bu personeli silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, "users", id));
        location.reload();
    }
};

// Sayfa Yükleme Tetikleyicileri
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if(path.includes('yonetim.html')) initDashboard();
    if(path.includes('yonetim_personel.html')) initPersonel();
    if(path.includes('yonetim_ekle.html')) initEkle();
});
