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

  document.getElementById('detailSubject').textContent = msg.subject || "Kurumsal Mesaj"; 
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

  // AI Özet Kutusunu Resetle
  document.getElementById('aiSummaryBox').classList.add('hidden');
  document.getElementById('aiSummaryContent').textContent = "Analiz ediliyor...";

  // AI Etiketi Gösterimi
  const aiTag = document.getElementById('aiTag');
  if (msg.aiAnalyzed) {
    aiTag.classList.remove('hidden');
  } else {
    aiTag.classList.add('hidden');
  }

  // Akıllı Yanıt Önerilerini Oluştur
  const existingSuggestions = document.getElementById('renderedAiSuggestions');
  if (existingSuggestions) existingSuggestions.remove();

  if (msg.suggestions && msg.suggestions.length > 0 && msg.senderId !== currentUserInfo.uid) {
    const suggContainer = document.createElement('div');
    suggContainer.id = 'renderedAiSuggestions';
    suggContainer.style.cssText = "margin-top:24px; border-top:1px solid var(--border); padding-top:1.5rem;";
    
    const label = document.createElement('span');
    label.style.cssText = "font-weight:600; font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.05em;";
    label.innerHTML = "<i class='fa-solid fa-wand-magic-sparkles'></i> Akıllı Yanıt Önerileri";
    suggContainer.appendChild(label);

    const btnWrapper = document.createElement('div');
    btnWrapper.style.cssText = "display:flex; gap:12px; flex-wrap:wrap;";

    msg.suggestions.forEach(s => {
      const btn = document.createElement('button');
      btn.style.cssText = "background:var(--primary-soft); color:var(--primary); border:1px solid #C7D2FE; padding:10px 16px; border-radius:12px; font-size:0.875rem; cursor:pointer; font-weight:500; transition:all 0.2s;";
      btn.textContent = s;
      btn.onmouseover = () => { btn.style.background = "#E0E7FF"; btn.style.transform = "translateY(-1px)"; };
      btn.onmouseout = () => { btn.style.background = "var(--primary-soft)"; btn.style.transform = "translateY(0)"; };
      btn.onclick = () => {
        document.getElementById('composeArea').classList.remove('hidden');
        document.getElementById('receiverSelect').value = msg.senderId;
        document.getElementById('messageBodyInput').value = s;
      };
      btnWrapper.appendChild(btn);
    });

    suggContainer.appendChild(btnWrapper);
    document.getElementById('detailBody').parentNode.appendChild(suggContainer);
  }
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

document.getElementById('minimizeCompose').addEventListener('click', () => {
  if (composeArea.style.height === '45px') {
    composeArea.style.height = '600px';
  } else {
    composeArea.style.height = '45px';
  }
});

// =====================
// AI ÖZETLEME (SUMMARIZER)
// =====================
document.getElementById('btnSummarize').addEventListener('click', async () => {
  const content = document.getElementById('detailBody').textContent;
  const summaryBox = document.getElementById('aiSummaryBox');
  const summaryContent = document.getElementById('aiSummaryContent');
  
  summaryBox.classList.remove('hidden');
  summaryContent.textContent = "Mesaj analiz ediliyor ve özetleniyor...";

  try {
    const aiKey = "AIzaSyD_O076TZRdbjrzF5z3n-QPfY8KJC3ios8";
    const prompt = `Aşağıdaki iş mesajını çok kısa (maksimum 2-3 cümle) ve özet bir şekilde, en önemli noktaları vurgulayarak özetle:\n\n"${content}"`;
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${aiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    
    const data = await res.json();
    if (data.candidates && data.candidates[0].content.parts[0].text) {
      summaryContent.textContent = data.candidates[0].content.parts[0].text.trim();
    }
  } catch(err) {
    summaryContent.textContent = "Özet çıkarılamadı. Lütfen tekrar deneyin.";
  }
});

document.getElementById('closeSummary').addEventListener('click', () => {
  document.getElementById('aiSummaryBox').classList.add('hidden');
});

async function loadUsersDropdown() {
  const usersSnap = await getDocs(collection(db, "users"));
  const select = document.getElementById('receiverSelect');
  
  const roleNames = {
    admin: 'Sistem Yöneticisi',
    factory: 'Fabrika',
    regional: 'Bölge Bayi',
    local: 'Yerel Bayi',
    local_employee: 'Yerel Bayi Çalışanı'
  };

  usersSnap.docs.forEach(d => {
    if (d.id !== currentUserInfo?.uid) { 
      const u = d.data();
      const option = document.createElement('option');
      option.value = d.id;
      const roleLabel = roleNames[u.role] || u.role;
      option.textContent = `${u.name} [${roleLabel}] - ${u.email}`;
      select.appendChild(option);
    }
  });
}

document.getElementById('composeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const receiverId = document.getElementById('receiverSelect').value;
  const content = document.getElementById('messageBodyInput').value;
  const subject = document.getElementById('subjectInput').value || "Konusuz Kurumsal Mesaj";
  const btn = document.getElementById('sendBtn');

  if (!receiverId) {
    showMessage("Lütfen bir alıcı seçin.", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = 'AI Analizi Yapılıyor...';

  let aiTranslated = "";
  let aiSpamScore = 0;
  let aiIsSpam = false;
  let aiSuggestions = [];

  try {
    const aiKey = "AIzaSyD_O076TZRdbjrzF5z3n-QPfY8KJC3ios8";
    const prompt = `Lütfen aşağıdaki şirket içi mesajı incele ve şu görevleri yap:
1. Türkçe ise İngilizceye, başka bir dilde ise Türkçeye profesyonelce çevir. (translatedContent)
2. Mesajda hakaret, tehdit, oltalama, saygısızlık veya şirket kuralı ihlali varsa 0-100 arası bir zarar skoru ver (100=çok zararlı). Sadece iş mesajıysa skor 0 olsun. (spamScore)
3. Eğer skor 60 ve üzeri ise isSpam true, değilse false olsun.
4. Bu mesaja verilebilecek en uygun 3 adet KISA VE ÖZ yanıt önerisini dizi halinde oluştur. Örnek: ["Hemen inceliyorum.", "Lütfen daha fazla detay verin.", "Onaylıyorum."] (suggestions)

Mesaj: "${content}"

Yalnızca aşağıdaki strict JSON formatında cevap ver, başka hiçbir kelime yazma:
{"translatedContent": "çeviri", "spamScore": 0, "isSpam": false, "suggestions": ["Yanıt1", "Yanıt2", "Yanıt3"]}`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${aiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    
    const data = await res.json();
    if(data.candidates && data.candidates[0].content.parts[0].text) {
      let aiText = data.candidates[0].content.parts[0].text;
      aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(aiText);
      aiTranslated = parsed.translatedContent || "";
      aiSpamScore = parsed.spamScore || 0;
      aiIsSpam = parsed.isSpam || false;
      aiSuggestions = parsed.suggestions || [];
    }
  } catch (err) {
    console.error("AI Analiz Hatası (Hata göz ardı ediliyor):", err);
  }

  btn.textContent = 'Gönderiliyor...';

  try {
    await addDoc(collection(db, "messages"), {
      senderId: currentUserInfo.uid,
      receiverId: receiverId,
      content: content,
      subject: subject,
      translatedContent: aiTranslated,
      isSpam: aiIsSpam,
      spamScore: aiSpamScore,
      aiAnalyzed: true,
      suggestions: aiSuggestions,
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

// =====================
// AI UYARLAMA / RESMİLEŞTİRME (FORMALIZER)
// =====================
const aiSuggestBtn = document.getElementById('aiSuggestBtn');
if (aiSuggestBtn) {
  aiSuggestBtn.addEventListener('click', async () => {
    const inputEl = document.getElementById('messageBodyInput');
    const content = inputEl.value.trim();
    if (!content) {
      showMessage("Önce taslak bir mesaj yazmalısınız.", "error");
      return;
    }
    
    aiSuggestBtn.textContent = "✨ Düzenleniyor...";
    aiSuggestBtn.disabled = true;

    try {
      const aiKey = "AIzaSyD_O076TZRdbjrzF5z3n-QPfY8KJC3ios8";
      const prompt = `Aşağıdaki iş e-postası taslağını çok daha profesyonel, resmi ve kurumsal bir Türkçe ile baştan yaz. Sadece ve sadece düzeltilmiş metni düz olarak ver, asla 'Tamam', 'Aşağıda sunuyorum' gibi fazladan açıklamalar yazma:\n\n"${content}"`;
      
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${aiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      
      const data = await res.json();
      if (data.candidates && data.candidates[0].content.parts[0].text) {
        inputEl.value = data.candidates[0].content.parts[0].text.trim();
        showMessage("Taslak yapay zeka tarafından resmileştirildi!", "success");
      }
    } catch(err) {
      showMessage("AI düzeltme yapamadı.", "error");
    }

    aiSuggestBtn.textContent = "✨ Akıllı Öneri";
    aiSuggestBtn.disabled = false;
  });
}

// BAŞLIK ÖNER (NEW FEATURE)
const btnSuggestSubject = document.getElementById('btnSuggestSubject');
if (btnSuggestSubject) {
  btnSuggestSubject.addEventListener('click', async () => {
    const body = document.getElementById('messageBodyInput').value;
    if (!body) {
      showMessage("Önce mesaj içeriğini yazmalısınız.", "error");
      return;
    }
    
    btnSuggestSubject.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btnSuggestSubject.disabled = true;

    try {
      const aiKey = "AIzaSyD_O076TZRdbjrzF5z3n-QPfY8KJC3ios8";
      const prompt = `Aşağıdaki iş mesajı için 3-5 kelimelik, profesyonel bir konu başlığı öner (SADECE BAŞLIĞI YAZ):\n\n"${body}"`;
      
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${aiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      
      const data = await res.json();
      if (data.candidates && data.candidates[0].content.parts[0].text) {
        document.getElementById('subjectInput').value = data.candidates[0].content.parts[0].text.trim().replace(/"/g, '');
        showMessage("AI tarafından bir konu başlığı önerildi.", "success");
      }
    } catch(err) {
      showMessage("AI başlık öneremedi.", "error");
    }

    btnSuggestSubject.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Öner';
    btnSuggestSubject.disabled = false;
  });
}
