import { auth, db } from './firebase/config.js';
import { signOut, onAuthStateChanged } from "firebase/auth";
import { 
  collection, getDocs, doc, getDoc, 
  query, orderBy, addDoc, serverTimestamp, onSnapshot,
  updateDoc, setDoc, deleteDoc
} from "firebase/firestore";

let currentUserInfo = null;
let currentFolder = 'inbox'; // inbox, sent, spam, archive, trash
let unsubscribeMessages = null;
let currentViewMsgId = null;

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
      alert("Kullanıcı verisi bulunamadı!");
      await signOut(auth);
      return;
    }

    currentUserInfo = { uid: user.uid, ...userDoc.data() };

    document.getElementById('userName').textContent = currentUserInfo.name;
    document.getElementById('userRole').textContent = 
      currentUserInfo.role === 'admin' ? 'Admin' : 
      currentUserInfo.role === 'manager' ? 'Yönetici' : 'Çalışan';
      
    const initials = currentUserInfo.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    document.getElementById('userAvatar').textContent = initials;

    loadUsersDropdown();
    listenToMessages();

  } catch (err) {
    console.error("Auth hatası:", err);
  }
});

// =====================
// SOL MENÜ GEZİNİMİ
// =====================
document.querySelectorAll('.nav-item').forEach(item => {
  if (item.classList.contains('active')) return; 
  
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    
    currentFolder = item.dataset.folder;
    
    const titles = {
      'inbox': 'Gelen Kutusu',
      'sent': 'Gönderilenler',
      'spam': 'Spam Klasörü',
      'archive': 'Arşiv',
      'trash': 'Çöp Kutusu'
    };
    document.getElementById('currentFolderName').textContent = titles[currentFolder];
    
    document.getElementById('messageContent').classList.add('hidden');
    document.getElementById('detailEmptyState').classList.remove('hidden');

    listenToMessages();
  });
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = '/index.html';
});

// =====================
// MESAJ OKUMA / DİNLEME VE FİLTRELEME
// =====================
function listenToMessages() {
  if (!currentUserInfo) return;
  if (unsubscribeMessages) unsubscribeMessages(); 

  const msgRef = collection(db, "messages");
  // Index hatası almamak ve esnek olmak için JS tarafında filtreleyeceğiz
  const q = query(msgRef, orderBy("timestamp", "desc"));

  const listEl = document.getElementById('messageList');
  listEl.innerHTML = '<div class="empty-state">Yükleniyor...</div>';

  unsubscribeMessages = onSnapshot(q, async (snapshot) => {
    if (snapshot.empty) {
      listEl.innerHTML = '<div class="empty-state">Mesaj bulunmuyor.</div>';
      if (currentFolder === 'inbox') document.getElementById('unreadCount').textContent = '0';
      return;
    }

    const messagesData = [];
    const now = new Date();

    for (let d of snapshot.docs) {
      let m = { id: d.id, ...d.data() };
      
      // Sadece gönderici veya alıcı ben isem beni ilgilendirir
      if (m.senderId !== currentUserInfo.uid && m.receiverId !== currentUserInfo.uid) {
         continue; 
      }

      const isArch = m.isArchived || false;
      const isDel = m.isDeleted || false;

      // 15 Gün Çöp Kutusu Oto-Silme Mantığı
      if (isDel && m.deletedAt) {
        const diffTime = Math.abs(now - m.deletedAt.toDate());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 15) {
          // 15 günü geçmişse kalıcı olarak veritabanından sil
          deleteDoc(doc(db, "messages", m.id));
          continue;
        }
      }

      // Klasör Filtreleri
      if (currentFolder === 'inbox' && (m.receiverId !== currentUserInfo.uid || m.isSpam || isArch || isDel)) continue;
      if (currentFolder === 'sent' && (m.senderId !== currentUserInfo.uid || isArch || isDel)) continue;
      if (currentFolder === 'spam' && (m.receiverId !== currentUserInfo.uid || !m.isSpam || isArch || isDel)) continue;
      if (currentFolder === 'archive' && (!isArch || isDel)) continue;
      if (currentFolder === 'trash' && !isDel) continue;

      messagesData.push(m);
    }

    if (currentFolder === 'inbox') {
      document.getElementById('unreadCount').textContent = messagesData.length;
    }

    if (messagesData.length === 0) {
      listEl.innerHTML = '<div class="empty-state">Bu klasör klasörde hiç mesaj yok.</div>';
      return;
    }

    let html = '';
    const usersCache = {};
    const fetchUser = async (uid) => {
      if (usersCache[uid]) return usersCache[uid];
      try {
        const uDoc = await getDoc(doc(db, "users", uid));
        if (uDoc.exists()) {
          usersCache[uid] = uDoc.data();
          return usersCache[uid];
        }
      } catch (e) { }
      return { name: "Bilinmeyen Kullanıcı" };
    };

    for (let msg of messagesData) {
      let displayName = "Bilinmeyen";
      
      if (msg.senderId === currentUserInfo.uid) {
        const u = await fetchUser(msg.receiverId);
        displayName = "Kime: " + u.name;
      } else {
        const u = await fetchUser(msg.senderId);
        displayName = u.name;
      }

      const dateStr = msg.timestamp ? msg.timestamp.toDate().toLocaleDateString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-';
      const previewText = msg.content ? (msg.content.substring(0, 40) + '...') : '';
      
      html += `
        <div class="msg-item" data-id="${msg.id}" data-sender="${displayName}">
          <div class="msg-header">
            <span class="msg-sender">${displayName}</span>
            <span class="msg-time">${dateStr}</span>
          </div>
          <div class="msg-preview">${previewText}</div>
        </div>
      `;
    }

    listEl.innerHTML = html;

    document.querySelectorAll('.msg-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.msg-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        const msgId = item.dataset.id;
        const displayName = item.dataset.sender;
        const msgData = messagesData.find(m => m.id === msgId);
        
        showDetail(msgData, displayName);
      });
    });

  }, (error) => {
    console.error("Mesajlar dinlenemedi:", error);
    listEl.innerHTML = '<div class="empty-state">Mesajlar yüklenirken bir sorun oluştu.</div>';
  });
}

// MESAJ DETAYINI GÖSTER
function showDetail(msg, displayName) {
  currentViewMsgId = msg.id; // Global tutuyoruz
  document.getElementById('detailEmptyState').classList.add('hidden');
  document.getElementById('messageContent').classList.remove('hidden');

  document.getElementById('detailSubject').textContent = "Konusuz Mesaj"; 
  document.getElementById('detailSenderName').textContent = displayName;
  
  const initials = displayName.replace("Kime: ", "").split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('detailAvatar').textContent = initials;
  
  if (msg.timestamp) {
    document.getElementById('detailDate').textContent = msg.timestamp.toDate().toLocaleString('tr-TR');
  }

  let bodyContent = msg.content;
  if(msg.translatedContent) {
    bodyContent += `\n\n--- Çeviri ---\n${msg.translatedContent}`;
  }
  if(msg.isSpam) {
    bodyContent = `[⚠️ DİKKAT: Bu mesaj sistem tarafından spam (Skor: ${msg.spamScore}) olarak işaretlenmiştir!]\n\n` + bodyContent;
  }
  
  document.getElementById('detailBody').textContent = bodyContent;
}

// ARŞİV VE ÇÖP KUTUSU AKSİYONLARI BAĞLAMASI
document.getElementById('btnArchive').addEventListener('click', async () => {
  if(!currentViewMsgId) return;
  await updateDoc(doc(db, "messages", currentViewMsgId), { isArchived: true, isDeleted: false });
  document.getElementById('messageContent').classList.add('hidden');
  document.getElementById('detailEmptyState').classList.remove('hidden');
});

document.getElementById('btnTrash').addEventListener('click', async () => {
  if(!currentViewMsgId) return;
  await updateDoc(doc(db, "messages", currentViewMsgId), { isDeleted: true, isArchived: false, deletedAt: serverTimestamp() });
  document.getElementById('messageContent').classList.add('hidden');
  document.getElementById('detailEmptyState').classList.remove('hidden');
});

// =====================
// YENİ MESAJ GÖNDERME
// =====================
const composeArea = document.getElementById('composeArea');
const statusMsg = document.getElementById('composeStatus');

document.getElementById('composeBtn').addEventListener('click', () => {
  composeArea.classList.remove('hidden');
  statusMsg.textContent = '';
});

document.getElementById('closeComposeBtn').addEventListener('click', () => {
  composeArea.classList.add('hidden');
});

async function loadUsersDropdown() {
  const usersSnap = await getDocs(collection(db, "users"));
  const select = document.getElementById('receiverSelect');
  
  usersSnap.docs.forEach(d => {
    if (d.id !== currentUserInfo?.uid) { 
      const u = d.data();
      const option = document.createElement('option');
      option.value = d.id;
      option.textContent = `${u.name} (${u.department} - ${u.email})`;
      select.appendChild(option);
    }
  });
}

document.getElementById('composeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const receiverId = document.getElementById('receiverSelect').value;
  const content = document.getElementById('messageBodyInput').value;
  const btn = document.getElementById('sendBtn');

  if (!receiverId) {
    showMessage("Lütfen bir alıcı seçin.", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Gönderiliyor...';

  try {
    await addDoc(collection(db, "messages"), {
      senderId: currentUserInfo.uid,
      receiverId: receiverId,
      content: content,
      translatedContent: "",
      isSpam: false,
      spamScore: 0,
      suggestions: [],
      attachments: [],
      timestamp: serverTimestamp(),
      isArchived: false,
      isDeleted: false,
      deletedAt: null
    });

    const threadId = [currentUserInfo.uid, receiverId].sort().join('_');
    const threadRef = doc(db, "threads", threadId);
    const threadSnap = await getDoc(threadRef);

    if (threadSnap.exists()) {
      await updateDoc(threadRef, {
        lastMessage: content,
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(threadRef, {
        participants: [currentUserInfo.uid, receiverId],
        lastMessage: content,
        updatedAt: serverTimestamp()
      });
    }

    showMessage("Mesaj başarıyla gönderildi!", "success");
    document.getElementById('messageBodyInput').value = '';
    
    setTimeout(() => {
      composeArea.classList.add('hidden');
      btn.disabled = false;
      btn.textContent = 'Gönder';
    }, 1500);

  } catch (err) {
    console.error("Mesaj gönderim hatası:", err);
    showMessage("Gönderilemedi: " + err.message, "error");
    btn.disabled = false;
    btn.textContent = 'Gönder';
  }
});

function showMessage(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = `status-msg ${type}`;
}
