import { auth, db } from './firebase/config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  collection, query, where, orderBy, onSnapshot, 
  addDoc, serverTimestamp, doc, getDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUserData = null;
let activeThreadId = null;

// =====================
// AUTH & ROLE PROTECTION
// =====================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = './giris.html';
    return;
  }

  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists()) {
    signOut(auth);
    return;
  }

  currentUserData = { id: user.uid, ...userDoc.data() };
  
  // UI Update
  if(document.getElementById('userName')) document.getElementById('userName').textContent = currentUserData.name;
  if(document.getElementById('userAvatar')) {
      const init = currentUserData.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
      document.getElementById('userAvatar').textContent = init;
  }

  loadInbox();
});

// =====================
// INBOX LOADING (REAL-TIME)
// =====================
function loadInbox() {
  const inboxList = document.getElementById('inboxList');
  if (!inboxList) return;

  // Mesajları getir (Sadece kullanıcıya ait olanlar)
  const q = query(
    collection(db, "messages"),
    where("participants", "array-contains", currentUserData.id),
    orderBy("timestamp", "desc")
  );

  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      inboxList.innerHTML = '<div class="empty-view" style="padding:3rem; text-align:center; color:#94a3b8;">Henüz mesajınız yok.</div>';
      return;
    }

    inboxList.innerHTML = snapshot.docs.map(doc => {
      const m = doc.data();
      const isActive = doc.id === activeThreadId ? 'active' : '';
      const time = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}) : '';
      
      return `
        <div class="msg-item ${isActive}" onclick="selectThread('${doc.id}')">
          <div class="msg-info">
            <span class="msg-sender">${m.senderName || 'Bilinmiyor'}</span>
            <span class="msg-time">${time}</span>
          </div>
          <div class="msg-subj">${m.subject || 'Konu Yok'}</div>
          <p style="font-size:0.75rem; color:#64748b; margin-top:0.3rem;">${m.lastMessage?.substring(0, 40)}...</p>
        </div>
      `;
    }).join('');
  });
}

// =====================
// SELECT & VIEW MESSAGE
// =====================
window.selectThread = async (id) => {
  activeThreadId = id;
  const docSnap = await getDoc(doc(db, "messages", id));
  if (!docSnap.exists()) return;

  const data = docSnap.data();
  
  // UI state change
  document.getElementById('emptyView').classList.add('hidden');
  document.getElementById('messageView').classList.remove('hidden');
  document.querySelectorAll('.msg-item').forEach(el => el.classList.remove('active'));

  document.getElementById('activeSubj').textContent = data.subject || 'Konu Yok';
  document.getElementById('activeSender').textContent = data.senderName || 'Bilinmeyen Gönderici';
  document.getElementById('activeTime').textContent = data.timestamp?.toDate ? data.timestamp.toDate().toLocaleString('tr-TR') : '';
  document.getElementById('activeContent').innerHTML = data.content || '';

  // AI Summary Logic (If content is long or has attachments)
  const aiBox = document.getElementById('aiSummary');
  if (data.content && data.content.length > 200) {
      aiBox.classList.remove('hidden');
      document.getElementById('aiSummaryText').textContent = "Yapay zeka mesaj içeriğini özetliyor: " + data.content.substring(0, 100) + "... [Otomate Özet Aktif]";
  } else {
      aiBox.classList.add('hidden');
  }

  // Attachments
  const attachDiv = document.getElementById('activeAttaches');
  attachDiv.innerHTML = '';
  if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach(file => {
          attachDiv.innerHTML += `
            <div class="attachment-chip">
              <i class="fa-solid fa-file-pdf"></i>
              <span>${file.name || 'Dosya'}</span>
              <i class="fa-solid fa-download" style="margin-left:0.5rem; opacity:0.5;"></i>
            </div>
          `;
      });
  }
};

// =====================
// REPLY LOGIC
// =====================
const sendBtn = document.getElementById('sendReply');
if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
        const input = document.getElementById('replyInput');
        if (!input.value.trim() || !activeThreadId) return;

        const replyText = input.value.trim();
        input.value = '';

        try {
            await updateDoc(doc(db, "messages", activeThreadId), {
                lastMessage: replyText,
                timestamp: serverTimestamp(),
                content: document.getElementById('activeContent').innerHTML + `<hr/><p><strong>Re:</strong> ${replyText}</p>`
            });
            selectThread(activeThreadId);
        } catch (err) { console.error("Reply error:", err); }
    });
}

// LOGOUT
const logoutBtn = document.getElementById('logoutBtn');
if(logoutBtn) {
    logoutBtn.addEventListener('click', () => signOut(auth).then(() => window.location.href = './giris.html'));
}
