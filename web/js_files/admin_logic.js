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
// OTOMATİK VERİ TEMİZLEME (PERFORMANS ODAKLI)
// =====================
async function autoCleanupUsers() {
    // Her saniye temizlik yapma, sadece günde bir veya manuel tetiklemede yap
    const lastCleanup = localStorage.getItem('last_cleanup_timestamp');
    const now = Date.now();
    if (lastCleanup && (now - lastCleanup < 3600000)) return; // 1 saatte bir kontrol et

    const allSnap = await getDocs(collection(db, "users"));
    let deleted = false;
    for (const docSnap of allSnap.docs) {
        const u = docSnap.data();
        if (u.role !== 'admin' && (!u.department || u.department === "-" || u.department === "")) {
            await deleteDoc(doc(db, "users", docSnap.id));
            deleted = true;
        }
    }
    localStorage.setItem('last_cleanup_timestamp', now.toString());
    if (deleted) location.reload();
}

async function initDashboard() {
    autoCleanupUsers();

    // 1. Verileri Çek
    let users = [];
    try {
        const snap = await getDocs(collection(db, "users"));
        users = snap.docs.map(d => d.data()).filter(u => u.role !== 'admin');
    } catch (err) {
        console.error("Dashboard veri çekme hatası:", err);
        return;
    }

    const total = users.length;
    const factoryUsers = users.filter(u => u.category === 'factory');
    const regionalUsers = users.filter(u => u.category === 'regional');
    const localUsers = users.filter(u => u.category === 'local');
    const managers = users.filter(u => u.subRole === 'manager');
    const employees = users.filter(u => u.subRole === 'employee');
    const companies = [...new Set(users.map(u => u.company).filter(Boolean))];
    const departments = [...new Set(users.map(u => u.department).filter(Boolean))];

    // ===== ROW 1: Stat Cards =====
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('statTotal', total);
    setEl('statFactory', factoryUsers.length);
    setEl('statRegional', regionalUsers.length);
    setEl('statLocal', localUsers.length);

    const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    setHtml('statTotalSub', `${managers.length} Yönetici · ${employees.length} Çalışan`);
    setHtml('statFactorySub', `${[...new Set(factoryUsers.map(u => u.department).filter(Boolean))].length} farklı departman`);
    setHtml('statRegionalSub', `${[...new Set(regionalUsers.map(u => u.company).filter(Boolean))].length} farklı firma`);
    setHtml('statLocalSub', `${[...new Set(localUsers.map(u => u.company).filter(Boolean))].length} farklı mağaza`);

    // ===== ROW 2: Highlight Strip =====
    const hlMgr = document.querySelector('#hlManagerCount .hl-value');
    const hlEmp = document.querySelector('#hlEmployeeCount .hl-value');
    const hlComp = document.querySelector('#hlCompanyCount .hl-value');
    const hlDept = document.querySelector('#hlDeptCount .hl-value');
    if (hlMgr) hlMgr.textContent = managers.length;
    if (hlEmp) hlEmp.textContent = employees.length;
    if (hlComp) hlComp.textContent = companies.length;
    if (hlDept) hlDept.textContent = departments.length;

    // ===== ROW 3a: Bölgesel Dağılım Tablosu & Grafiği =====
    const regionStats = {};
    users.forEach(u => { if (u.region) regionStats[u.region] = (regionStats[u.region] || 0) + 1; });
    const sortedRegions = Object.entries(regionStats).sort((a, b) => b[1] - a[1]);

    const regionBody = document.getElementById('regionTableBody');
    if (regionBody) {
        regionBody.innerHTML = sortedRegions.map(([reg, count]) => {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
            return `<tr><td><strong>${reg}</strong></td><td>${count}</td><td>${pct}%</td></tr>`;
        }).join('');
    }

    const regionCtx = document.getElementById('regionChart');
    if (regionCtx && typeof Chart !== 'undefined') {
        new Chart(regionCtx, {
            type: 'pie',
            data: {
                labels: sortedRegions.map(r => r[0]),
                datasets: [{
                    data: sortedRegions.map(r => r[1]),
                    backgroundColor: [
                        '#0f766e', '#0891b2', '#0284c7', '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3', '#db2777', '#e11d48'
                    ],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10, family: 'Inter' }, padding: 12 } } } }
        });
    }

    // ===== ROW 3b: Kategori Dağılımı (Doughnut) =====
    const catCtx = document.getElementById('categoryChart');
    if (catCtx && typeof Chart !== 'undefined') {
        new Chart(catCtx, {
            type: 'doughnut',
            data: {
                labels: ['Fabrika', 'Bölge Bayisi', 'Yerel Bayi'],
                datasets: [{
                    data: [factoryUsers.length, regionalUsers.length, localUsers.length],
                    backgroundColor: ['#f59e0b', '#3b82f6', '#8b5cf6'],
                    borderWidth: 3,
                    borderColor: '#fff',
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 11, family: 'Inter', weight: '600' }, padding: 16 } }
                }
            }
        });
    }

    // ===== ROW 4: Insight Cards =====
    // En Kalabalık Yerel Bayi
    const localCompanyStats = {};
    localUsers.forEach(u => { if (u.company) localCompanyStats[u.company] = (localCompanyStats[u.company] || 0) + 1; });
    const busiestLocal = Object.entries(localCompanyStats).sort((a, b) => b[1] - a[1])[0];
    const insightLocal = document.getElementById('insightBusiestLocal');
    if (insightLocal) {
        if (busiestLocal) {
            const bLocalUsers = localUsers.filter(u => u.company === busiestLocal[0]);
            const bLocalMgr = bLocalUsers.filter(u => u.subRole === 'manager').length;
            const bLocalRegion = bLocalUsers[0]?.region || 'Bilinmiyor';
            insightLocal.innerHTML = `
                <div class="insight-big">
                    <div class="insight-company-name"><i class="fa-solid fa-store"></i> ${busiestLocal[0]}</div>
                    <div class="insight-metric"><span class="insight-metric-label">Toplam Personel</span><span class="insight-metric-value">${busiestLocal[1]} kişi</span></div>
                    <div class="insight-metric"><span class="insight-metric-label">Yönetici Sayısı</span><span class="insight-metric-value">${bLocalMgr}</span></div>
                    <div class="insight-metric"><span class="insight-metric-label">Bölge</span><span class="insight-metric-value">${bLocalRegion}</span></div>
                </div>`;
        } else {
            insightLocal.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;">Yerel bayi verisi bulunamadı.</p>';
        }
    }

    // En Kalabalık Bölge Bayisi
    const regCompanyStats = {};
    regionalUsers.forEach(u => { if (u.company) regCompanyStats[u.company] = (regCompanyStats[u.company] || 0) + 1; });
    const busiestRegional = Object.entries(regCompanyStats).sort((a, b) => b[1] - a[1])[0];
    const insightRegional = document.getElementById('insightBusiestRegional');
    if (insightRegional) {
        if (busiestRegional) {
            const bRegUsers = regionalUsers.filter(u => u.company === busiestRegional[0]);
            const bRegMgr = bRegUsers.filter(u => u.subRole === 'manager').length;
            const bRegRegion = bRegUsers[0]?.region || 'Bilinmiyor';
            insightRegional.innerHTML = `
                <div class="insight-big">
                    <div class="insight-company-name"><i class="fa-solid fa-map-location-dot"></i> ${busiestRegional[0]}</div>
                    <div class="insight-metric"><span class="insight-metric-label">Toplam Personel</span><span class="insight-metric-value">${busiestRegional[1]} kişi</span></div>
                    <div class="insight-metric"><span class="insight-metric-label">Koordinatör</span><span class="insight-metric-value">${bRegMgr}</span></div>
                    <div class="insight-metric"><span class="insight-metric-label">Bölge</span><span class="insight-metric-value">${bRegRegion}</span></div>
                </div>`;
        } else {
            insightRegional.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;">Bölge bayisi verisi bulunamadı.</p>';
        }
    }

    // Şirketin Duayeni
    const oldest = [...users].filter(u => u.birthDate).sort((a, b) => new Date(a.birthDate) - new Date(b.birthDate))[0];
    const insightOldest = document.getElementById('insightOldest');
    if (insightOldest) {
        if (oldest) {
            const birthYear = new Date(oldest.birthDate).getFullYear();
            const age = new Date().getFullYear() - birthYear;
            const initials = (oldest.name?.[0] || '') + (oldest.surname?.[0] || '');
            insightOldest.innerHTML = `
                <div class="insight-big">
                    <div class="insight-person">
                        <div class="insight-avatar">${initials.toUpperCase()}</div>
                        <div class="insight-person-info">
                            <span class="insight-person-name">${oldest.name} ${oldest.surname}</span>
                            <span class="insight-person-detail">${oldest.company || 'Bilinmeyen Şirket'}</span>
                        </div>
                    </div>
                    <div class="insight-metric"><span class="insight-metric-label">Doğum Yılı</span><span class="insight-metric-value">${birthYear}</span></div>
                    <div class="insight-metric"><span class="insight-metric-label">Yaş</span><span class="insight-metric-value">${age}</span></div>
                    <div class="insight-metric"><span class="insight-metric-label">Departman</span><span class="insight-metric-value">${oldest.department || '-'}</span></div>
                </div>`;
        } else {
            insightOldest.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;">Doğum tarihi bilgisi bulunamadı.</p>';
        }
    }

    // ===== ROW 5a: Şirket Bazlı Bar Chart (Top 10) =====
    const companyStats = {};
    users.forEach(u => { if (u.company) companyStats[u.company] = (companyStats[u.company] || 0) + 1; });
    const topCompanies = Object.entries(companyStats).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const compCtx = document.getElementById('companyChart');
    if (compCtx && typeof Chart !== 'undefined') {
        new Chart(compCtx, {
            type: 'bar',
            data: {
                labels: topCompanies.map(c => c[0].length > 22 ? c[0].substring(0, 20) + '…' : c[0]),
                datasets: [{
                    label: 'Personel',
                    data: topCompanies.map(c => c[1]),
                    backgroundColor: topCompanies.map((_, i) => {
                        const colors = ['#0F3D2E','#1a5c46','#2d8b6c','#46b992','#72d9b6','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
                        return colors[i % colors.length];
                    }),
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10, family: 'Inter' } } },
                    y: { grid: { display: false }, ticks: { font: { size: 10, family: 'Inter', weight: '600' } } }
                }
            }
        });
    }

    // ===== ROW 5b: Doğum Günleri =====
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

    setEl('statBirthdays', upcomingBirthdays.length);

    const listDiv = document.getElementById('upcomingBirthdayList');
    if (listDiv) {
        listDiv.innerHTML = upcomingBirthdays.length === 0
            ? '<p style="text-align:center;padding:2rem;color:var(--text-muted);"><i class="fa-solid fa-face-smile-wink" style="font-size:1.5rem;display:block;margin-bottom:0.5rem;"></i>Yakın 30 gün içinde doğum günü yok.</p>'
            : upcomingBirthdays.map(u => `
                <div class="birthday-item">
                    <div class="bday-left">
                        <span class="bday-name">${u.name} ${u.surname}</span>
                        <span class="bday-company">${u.company || '-'}</span>
                    </div>
                    <div class="bday-right">
                        <span class="bday-countdown ${u.daysRemaining === 0 ? 'today' : ''}">${u.daysRemaining === 0 ? '🎉 BUGÜN!' : u.daysRemaining + ' gün'}</span>
                        <span class="bday-date">${u.upcomingDate.toLocaleDateString('tr-TR', {day:'numeric', month:'long'})}</span>
                    </div>
                </div>
            `).join('');
    }

    // ===== ROW 6a: Yönetici / Çalışan Oranı (Doughnut) =====
    const roleCtx = document.getElementById('roleChart');
    if (roleCtx && typeof Chart !== 'undefined') {
        new Chart(roleCtx, {
            type: 'doughnut',
            data: {
                labels: ['Yönetici / Patron', 'Çalışan'],
                datasets: [{
                    data: [managers.length, employees.length],
                    backgroundColor: ['#0F3D2E', '#a5eed4'],
                    borderWidth: 3,
                    borderColor: '#fff',
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 12, family: 'Inter', weight: '600' }, padding: 16 } }
                }
            }
        });
    }

    // ===== ROW 6b: Departman Dağılımı (Top 10 - Horizontal Bar) =====
    const deptStats = {};
    users.forEach(u => { if (u.department) deptStats[u.department] = (deptStats[u.department] || 0) + 1; });
    const topDepts = Object.entries(deptStats).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const deptCtx = document.getElementById('deptChart');
    if (deptCtx && typeof Chart !== 'undefined') {
        new Chart(deptCtx, {
            type: 'bar',
            data: {
                labels: topDepts.map(d => d[0].length > 25 ? d[0].substring(0, 23) + '…' : d[0]),
                datasets: [{
                    label: 'Kişi',
                    data: topDepts.map(d => d[1]),
                    backgroundColor: '#3b82f6',
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10, family: 'Inter' } } },
                    y: { grid: { display: false }, ticks: { font: { size: 10, family: 'Inter', weight: '600' } } }
                }
            }
        });
    }
}

// =====================
// PERSONEL LİSTESİ
// =====================
let allUsers = [];
async function initPersonel() {
    autoCleanupUsers(); // Arka planda çalışsın, sayfayı yavaşlatmasın
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

        // 2. Rol Mantığı (Manager vs Employee) - Departman Gösterimi ve Filtreleme
        if(roleIn.value === 'manager') {
            deptGroup.style.display = 'none';
        } else {
            deptGroup.style.display = 'block';
            // Kategorilere göre departman optgroup'larını filtrele
            const optF = document.getElementById('optFactory');
            const optR = document.getElementById('optRegional');
            const optL = document.getElementById('optLocal');
            
            if(optF) optF.style.display = (catIn.value === 'factory') ? 'block' : 'none';
            if(optR) optR.style.display = (catIn.value === 'regional') ? 'block' : 'none';
            if(optL) optL.style.display = (catIn.value === 'local') ? 'block' : 'none';
            
            // Eğer kategori değişirse ve eski seçim artık görünmüyorsa temizle
            document.getElementById('newDept').value = "";
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
