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

// E-posta Üretimi: ad.soyad@bellona.com.tr (+ çakışma kontrolü)
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
async function initPersonel() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    const users = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(u => u.role !== 'admin');
    renderTable(users);
}

function renderTable(users) {
    const tbody = document.getElementById('userTableBody');
    if(!tbody) return;
    tbody.innerHTML = users.map(u => `
        <tr>
            <td><strong>${u.name} ${u.surname}</strong></td>
            <td><small>${u.email}</small></td>
            <td>${u.region || '-'}</td>
            <td>${u.company || '-'}</td>
            <td><span class="badge ${u.subRole === 'manager' ? 'badge-accent' : 'badge-primary'}">${u.subRole === 'manager' ? 'PATRON' : 'ÇALIŞAN'}</span></td>
            <td><button onclick="deleteUser('${u.id}')" style="border:none; background:none; color:#ef4444; cursor:pointer;"><i class="fa-solid fa-trash"></i></button></td>
        </tr>
    `).join('');
}

// =====================
// EKLEME SAYFASI
// =====================
function initEkle() {
    const nameIn = document.getElementById('newName');
    const surnameIn = document.getElementById('newSurname');
    const roleIn = document.getElementById('newSubRole');
    const deptGroup = document.getElementById('deptGroup');
    const pwIn = document.getElementById('newPassword');
    
    if(pwIn) pwIn.value = generateStrictPassword();
    
    const updateUI = () => {
        if(roleIn.value === 'manager') {
            deptGroup.style.display = 'none';
        } else {
            deptGroup.style.display = 'block';
        }
    };
    
    roleIn.addEventListener('change', updateUI);
    
    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = await generateUniqueEmail(nameIn.value, surnameIn.value);
        const data = {
            name: nameIn.value,
            surname: surnameIn.value,
            birthDate: document.getElementById('newBirth').value,
            region: document.getElementById('newRegion').value,
            company: document.getElementById('newCompany').value,
            subRole: roleIn.value,
            department: roleIn.value === 'manager' ? '' : document.getElementById('newDept').value,
            email: email,
            password: pwIn.value,
            role: 'user',
            isActive: true,
            createdAt: serverTimestamp()
        };
        
        await addDoc(collection(db, "users"), data);
        alert(`Kullanıcı eklendi: ${email}`);
        location.reload();
    });
}

window.deleteUser = async (id) => {
    if(confirm('Silmek istediğine emin misin?')) {
        await deleteDoc(doc(db, "users", id));
        location.reload();
    }
};
