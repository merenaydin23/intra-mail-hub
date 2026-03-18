import { auth, db } from './firebase/config.js';
import { signOut, onAuthStateChanged } from "firebase/auth";
import { 
  collection, getDocs, doc, getDoc, 
  query, orderBy 
} from "firebase/firestore";

let currentManager = null;
let allUsersMap = {};

// =====================
// AUTH KONTROLÜ
// =====================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '/index.html';
    return;
  }

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      await signOut(auth);
      return;
    }

    currentManager = { uid: user.uid, ...userDoc.data() };

    if (currentManager.role !== 'manager' && currentManager.role !== 'admin') {
      alert("Sadece Müdür/Admin bu paneli görebilir!");
      window.location.href = '/index.html';
      return;
    }

    document.getElementById('managerName').textContent = currentManager.name;
    document.getElementById('managerDept').textContent = currentManager.department;

    await loadAllUsers();
    await loadDepartmentMessages();

  } catch (err) {
    console.error("Auth hatası:", err);
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = '/index.html';
});

// Cache için tüm kullanıcıları al
async function loadAllUsers() {
  const usersSnap = await getDocs(collection(db, "users"));
  usersSnap.docs.forEach(d => {
    allUsersMap[d.id] = d.data();
  });
}

// =====================
// DEPARTMAN MESAJLARI
// =====================
async function loadDepartmentMessages() {
  const container = document.getElementById('messagesContainer');
  container.innerHTML = 'Yükleniyor...';

  try {
    // Müdür tüm mesajları çekebilir (Rules'daki izin gereği).
    const msgRef = collection(db, "messages");
    const q = query(msgRef, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);

    let html = '';
    snapshot.docs.forEach(d => {
      const msg = d.data();
      const sender = allUsersMap[msg.senderId];
      const receiver = allUsersMap[msg.receiverId];

      // Filtre (Yalnızca Müdürün olduğu departman içindeki gönderici veya alıcı ise)
      // *Admin* ise tüm filtreleri bypass edip hepsini görebilir
      const isSenderInDept = sender && sender.department === currentManager.department;
      const isReceiverInDept = receiver && receiver.department === currentManager.department;

      if (currentManager.role === 'admin' || isSenderInDept || isReceiverInDept) {
        
        const sName = sender ? sender.name : 'Silinen Kullanıcı';
        const rName = receiver ? receiver.name : 'Silinen Kullanıcı';
        const dStr = msg.timestamp ? msg.timestamp.toDate().toLocaleDateString() : '-';
        
        html += `
          <div class="msg-box">
            <b>Gönderen:</b> ${sName} | <b>Alıcı:</b> ${rName} | <b>Tarih:</b> ${dStr}<br/>
            <b>İçerik:</b> ${msg.content || '[Boş Mesaj]'} <br/>
            <small style="color: ${msg.isSpam ? 'red' : 'green'}">
              Spam Durumu: ${msg.isSpam ? `SPAM (${msg.spamScore})` : 'Temiz'}
            </small>
          </div>
        `;
      }
    });

    if (!html) html = 'Departmanınızda okunacak mesaj bulunmamaktadır.';
    container.innerHTML = html;

  } catch (err) {
    console.error("Departman mesajları çekerken hata:", err);
    container.innerHTML = 'Okuma hatası (Rules veya Ağ)';
  }
}
