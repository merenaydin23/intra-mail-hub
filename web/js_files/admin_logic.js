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
    // Mega Test Verisi Yükleme (V10 - Tüm Birimlere Departmanlar)
    if (localStorage.getItem('dealers_seeded_v10_dept') !== 'true') {
        const regions = ["Marmara", "Ege", "İç Anadolu", "Akdeniz", "Karadeniz", "Doğu Anadolu", "Güneydoğu Anadolu"];
        const factoryDepts = ["Pazarlama", "Muhasebe", "İK", "Sevkiyat", "Ar-Ge", "Kalite Kontrol", "Lojistik"];
        const dealerDepts = ["Satış Temsilcisi", "Muhasebe", "Müşteri İlişkileri", "Pazarlama", "Depo Sorumlusu"];
        const companiesList = ["Yıldız Mobilya", "Kaya Concept", "Demir Palace", "Arslan Ev Gereçleri", "Öztürk Bellona", "Güneş Mobilya"];
        const names = ["Ahmet", "Mehmet", "Mustafa", "Ali", "Zeynep", "Ayşe", "Fatma", "Can", "Murat", "Selin", "Burak", "Derya", "Okan", "Gizem", "Serkan", "Esra", "Umut", "Pelin", "Ege", "Deniz"];
        const surnames = ["Yıldız", "Kaya", "Demir", "Çelik", "Arslan", "Öztürk", "Aydın", "Yavuz", "Şahin", "Kılıç", "Bulut", "Korkmaz", "Erdoğan", "Güneş", "Tezcan", "Eren", "Yalçın", "Güler", "Aksoy", "Toprak"];

        const allToSeed = [
            { name: "Abdulkadir", surname: "Karavil", company: "Karavil Group", region: "Doğu Anadolu", category: "regional", subRole: "manager", department: "Bölge Başkanı" },
            { name: "Ercan", surname: "Yılmaz", company: "Yılmaz Group", region: "İç Anadolu", category: "regional", subRole: "manager", department: "Bölge Başkanı" },
            { name: "Abdullah", surname: "Gümüşbağlar", company: "Gümüşbağlar Şirket Birliği", region: "Karadeniz", category: "regional", subRole: "manager", department: "Bölge Başkanı" },
            { name: "Kenan", surname: "Aydın", company: "Aydın Group", region: "Güneydoğu Anadolu", category: "regional", subRole: "manager", department: "Bölge Başkanı" },
            { name: "Yılmaz", surname: "Karavil", company: "Karavil Marmara", region: "Marmara", category: "regional", subRole: "manager", department: "Bölge Başkanı" },
            { name: "Kenan", surname: "Atasay", company: "Atasaylar Group", region: "Akdeniz", category: "regional", subRole: "manager", department: "Bölge Başkanı" },
            { name: "Hakan", surname: "Kırklar", company: "Kırklar Şirketler Birliği", region: "Ege", category: "regional", subRole: "manager", department: "Bölge Başkanı" }
        ];

        // 30 Rastgele Çalışan (Karışık Kategori ve Departman)
        for(let i=0; i<30; i++) {
            const cat = i % 3 === 0 ? "factory" : (i % 3 === 1 ? "regional" : "local");
            const isManager = i < 5; // İlk 5'i patron yap
            allToSeed.push({
                name: names[i % names.length],
                surname: surnames[(i+5) % surnames.length],
                company: cat === "factory" ? "Bellona Genel Müdürlük" : companiesList[i % companiesList.length],
                region: regions[Math.floor(Math.random() * regions.length)],
                category: cat,
                subRole: isManager ? "manager" : "employee",
                department: isManager ? (cat === "factory" ? "Fabrika Müdürü" : "Bayi Sahibi") : (cat === "factory" ? factoryDepts[i % factoryDepts.length] : dealerDepts[i % dealerDepts.length])
            });
        }

        const getRandomBirthDate = () => {
            const year = Math.floor(Math.random() * (2000 - 1960 + 1)) + 1960;
            const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
            const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        for (const d of allToSeed) {
            const email = await generateEnterpriseEmail(d.name, d.surname);
            await addDoc(collection(db, "users"), {
                ...d,
                email: email,
                password: generateStrictPassword(),
                role: "user",
                isActive: true,
                birthDate: getRandomBirthDate(),
                createdAt: serverTimestamp()
            });
        }
        localStorage.setItem('dealers_seeded_v10_dept', 'true');
        location.reload();
    }

    const snap = await getDocs(collection(db, "users"));
    const users = snap.docs.map(d => d.data()).filter(u => u.role !== 'admin');
    
    // 1. Toplam Personel
    document.getElementById('statTotal').textContent = users.length;

    // 2. Şirketin Duayeni (En Yaşlı Üye)
    const oldest = [...users].filter(u => u.birthDate).sort((a, b) => new Date(a.birthDate) - new Date(b.birthDate))[0];
    if (oldest) {
        document.getElementById('statOldest').textContent = `${oldest.name} ${oldest.surname} (${new Date(oldest.birthDate).getFullYear()})`;
    }

    // 3. Yaklaşan Doğum Günleri (30 Gün)
    const today = new Date();
    const upcomingBirthdays = users.filter(u => {
        if (!u.birthDate) return false;
        const bday = new Date(u.birthDate);
        const thisYearBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
        if (thisYearBday < today) thisYearBday.setFullYear(today.getFullYear() + 1);
        const diffDays = Math.ceil((thisYearBday - today) / (1000 * 60 * 60 * 24));
        u.daysRemaining = diffDays;
        u.upcomingDate = thisYearBday;
        return diffDays <= 30;
    }).sort((a, b) => a.daysRemaining - b.daysRemaining);

    document.getElementById('statBirthdays').textContent = upcomingBirthdays.length;

    const listDiv = document.getElementById('upcomingBirthdayList');
    if (listDiv) {
        listDiv.innerHTML = upcomingBirthdays.length === 0 ? '<p style="text-align:center;padding:1rem;">Yok</p>' : 
            upcomingBirthdays.map(u => `
                <div style="display:flex;justify-content:space-between;padding:0.5rem;border-bottom:1px solid #eee;">
                    <span><strong>${u.name} ${u.surname}</strong><br><small>${u.company}</small></span>
                    <span style="text-align:right;"><b style="color:var(--accent);">${u.daysRemaining} gün</b><br><small>${u.upcomingDate.toLocaleDateString('tr-TR',{day:'numeric',month:'short'})}</small></span>
                </div>
            `).join('');
    }

    // 4. Bölgesel Dağılım Tablosu & Grafik
    const regionStats = {};
    users.forEach(u => {
        if (u.region) regionStats[u.region] = (regionStats[u.region] || 0) + 1;
    });

    const regionBody = document.getElementById('regionTableBody');
    if (regionBody) {
        regionBody.innerHTML = Object.entries(regionStats).map(([reg, count]) => `
            <tr>
                <td><strong>${reg}</strong></td>
                <td>${count} Personel</td>
            </tr>
        `).join('');
    }

    const ctx = document.getElementById('regionChart');
    if (ctx && typeof Chart !== 'undefined') {
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(regionStats),
                datasets: [{
                    data: Object.values(regionStats),
                    backgroundColor: ['#0F3D2E','#1a5c46','#2d8b6c','#46b992','#72d9b6','#a5eed4','#d1f7e9'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }
            }
        });
    }
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
        const term = searchIn.value.toLocaleLowerCase('tr-TR');
        const cat = filterCat.value;
        const reg = filterReg.value;

        const filtered = allUsers.filter(u => {
            const fullName = (u.name + ' ' + u.surname + ' ' + (u.company || '')).toLocaleLowerCase('tr-TR');
            const matchSearch = fullName.includes(term);
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
                <td><span style="font-size: 0.8rem; color: #64748b;">${u.department || '-'}</span></td>
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

        // 2. Rol Mantığı (Manager vs Employee) - Departman Gösterimi
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
            department: roleIn.value === 'manager' ? (catIn.value === 'factory' ? "Fabrika Müdürü" : "Bayi Sahibi") : document.getElementById('newDept').value,
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
