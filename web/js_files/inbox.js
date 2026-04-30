import { auth, db } from './firebase/config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  collection, query, where, orderBy, onSnapshot, 
  addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { refineMessageWithAI } from './services/ai-service.js';

let currentUserData = null;
let activeThreadId = null;
let currentFolder = 'inbox';

// =====================
// AUTH & INITIALIZATION
// =====================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '/index.html';
    return;
  }

  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists()) {
    signOut(auth);
    return;
  }

  currentUserData = { id: user.uid, ...userDoc.data() };
  
  updateUI();
  initNavigation();
  initCompose();
  loadFolder(currentFolder);
});

function updateUI() {
    let roleLabel = currentUserData.subRole === 'manager' ? 'Yönetici / Patron' : 'Mağaza Personeli';
    if (currentUserData.category === 'regional') roleLabel = 'Bölge Sorumlusu';
    if (currentUserData.category === 'factory') roleLabel = 'Fabrika Yetkilisi';

    const elements = {
        'userName': `${currentUserData.name} ${currentUserData.surname || ''}`,
        'userCompany': currentUserData.company || 'Bellona Kurumsal',
        'userRole': roleLabel,
        'userAvatar': currentUserData.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase()
    };

    Object.entries(elements).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    });
}

// =====================
// NAVIGATION LOGIC
// =====================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const folder = item.getAttribute('data-folder') || item.getAttribute('data-type');
            if (folder) switchFolder(folder, item);
        });
    });

    const logoutBtns = document.querySelectorAll('#logoutBtn');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', () => signOut(auth).then(() => window.location.href = '/index.html'));
    });
}

function switchFolder(folder, clickedElement) {
    currentFolder = folder;
    
    // UI Updates
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    if (clickedElement) clickedElement.classList.add('active');
    
    const folderTitle = document.getElementById('currentFolderName');
    if (folderTitle) {
        const names = {
            'inbox': 'Gelen Kutusu', 'sent': 'Gönderilenler', 'spam': 'Spam Klasörü',
            'archive': 'Arşiv', 'trash': 'Çöp Kutusu', 'all': 'Tüm Mesajlar'
        };
        folderTitle.textContent = names[folder] || folder;
    }

    // Reset View
    resetDetailView();
    loadFolder(folder);
}

function resetDetailView() {
    const emptyState = document.getElementById('detailEmptyState') || document.getElementById('emptyView');
    const contentArea = document.getElementById('messageContent') || document.getElementById('messageView');
    const composeArea = document.getElementById('composeArea');
    
    if (emptyState) emptyState.classList.remove('hidden');
    if (contentArea) contentArea.classList.add('hidden');
    if (composeArea) composeArea.classList.add('hidden');
    activeThreadId = null;
}

// =====================
// DATA LOADING
// =====================
function loadFolder(folder) {
    const listContainer = document.getElementById('messageList') || document.getElementById('inboxList');
    if (!listContainer) return;

    // Show initial loader
    listContainer.innerHTML = `
        <div class="loader-container" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted); opacity:0.6; padding: 4rem 0;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; margin-bottom:1rem;"></i>
            <p>Mesajlar yükleniyor...</p>
        </div>`;

    let q;
    const baseRef = collection(db, "messages");

    try {
        if (folder === 'sent') {
            q = query(baseRef, where("senderId", "==", currentUserData.id));
        } else if (['spam', 'archive', 'trash'].includes(folder)) {
            q = query(baseRef, where("participants", "array-contains", currentUserData.id), where("status", "==", folder));
        } else {
            // Inbox: Sadece bana gelen aktif mesajlar
            q = query(baseRef, where("receiverId", "==", currentUserData.id), where("status", "==", "active"));
        }

        onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                const emptyMessages = {
                    'inbox': 'Henüz bir mesaj almadınız.',
                    'sent': 'Henüz bir mesaj göndermediniz.',
                    'spam': 'Spam klasörünüz temiz.',
                    'archive': 'Arşivlenmiş mesajınız bulunmuyor.',
                    'trash': 'Çöp kutusu boş.'
                };
                
                listContainer.innerHTML = `
                    <div class="empty-state-modern">
                        <div class="empty-icon-wrapper">
                            <i class="fa-solid fa-envelope-open"></i>
                        </div>
                        <h3>Tertemiz!</h3>
                        <p>${emptyMessages[folder] || 'Burada görülecek bir şey yok.'}</p>
                    </div>`;
                return;
            }

            // Sort in memory to avoid composite index requirement
            const sortedDocs = [...snapshot.docs].sort((a, b) => {
                const timeA = a.data().timestamp?.toMillis() || 0;
                const timeB = b.data().timestamp?.toMillis() || 0;
                return timeB - timeA;
            });

            listContainer.innerHTML = sortedDocs.map(doc => {
                const m = doc.data();
                const isActive = doc.id === activeThreadId ? 'active' : '';
                
                // Tarih formatlama
                const dateObj = m.timestamp?.toDate();
                let timeStr = "--:--";
                if (dateObj) {
                    const today = new Date();
                    if (dateObj.toDateString() === today.toDateString()) {
                        timeStr = dateObj.toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'});
                    } else {
                        timeStr = dateObj.toLocaleDateString('tr-TR', {day:'2-digit', month:'short'});
                    }
                }
                
                const senderDisplay = folder === 'sent' ? `Alıcı: ${m.receiverName || 'Bilinmiyor'}` : (m.senderName || 'Bilinmiyor');
                
                return `
                    <div class="msg-item ${isActive}" onclick="selectThread('${doc.id}')">
                        <div class="msg-header">
                            <span class="msg-sender">${senderDisplay}</span>
                            <span class="msg-time">${timeStr}</span>
                        </div>
                        <div class="msg-subj">${m.subject || 'Konu Yok'}</div>
                        <p class="msg-preview">${(m.lastMessage || m.content || '').substring(0, 45).replace(/<[^>]*>?/gm, '')}...</p>
                    </div>
                `;
            }).join('');
        }, (error) => {
            console.error("Snapshot error:", error);
            listContainer.innerHTML = `
                <div class="error-state" style="padding:2rem; text-align:center; color:var(--danger);">
                    <i class="fa-solid fa-circle-exclamation" style="font-size:2rem; margin-bottom:1rem;"></i>
                    <p>Mesajlar yüklenirken bir hata oluştu.</p>
                    <small style="display:block; margin-top:0.5rem; opacity:0.7;">Dizin eksik olabilir veya bağlantı sorunu var.</small>
                </div>`;
        });
    } catch (err) {
        console.error("Query buildup error:", err);
        listContainer.innerHTML = '<div style="padding:2rem; text-align:center;">Sorgu oluşturulurken hata oluştu.</div>';
    }
}

// =====================
// MESSAGE ACTIONS
// =====================
window.selectThread = async (id) => {
    activeThreadId = id;
    const docSnap = await getDoc(doc(db, "messages", id));
    if (!docSnap.exists()) return;
    const data = docSnap.data();

    const emptyState = document.getElementById('detailEmptyState') || document.getElementById('emptyView');
    const contentArea = document.getElementById('messageContent') || document.getElementById('messageView');
    const composeArea = document.getElementById('composeArea');
    
    if (emptyState) emptyState.classList.add('hidden');
    if (contentArea) contentArea.classList.remove('hidden');
    if (composeArea) composeArea.classList.add('hidden');
    
    document.querySelectorAll('.msg-item').forEach(el => {
        if(el.textContent.includes(data.subject)) el.classList.add('active');
        else el.classList.remove('active');
    });

    const dateObj = data.timestamp?.toDate();
    const fullDate = dateObj ? dateObj.toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';

    const map = {
        'detailSubject': data.subject,
        'detailSenderName': data.senderName,
        'detailSenderEmail': `Alıcı: ${data.receiverName || 'Bilinmiyor'}`,
        'detailDate': fullDate,
        'detailBody': data.content
    };

    Object.entries(map).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = val || '';
    });

    Object.entries(map).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = val || '';
    });

    // Render Replies (Threading)
    const detailBody = document.getElementById('detailBody');
    if (data.replies && data.replies.length > 0) {
        let repliesHtml = '<div class="thread-divider">Yazışma Geçmişi</div>';
        data.replies.forEach(r => {
            const rDate = new Date(r.timestamp).toLocaleString('tr-TR', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short'});
            repliesHtml += `
                <div class="reply-bubble">
                    <div class="reply-header">
                        <span class="reply-author">${r.authorName}</span>
                        <span class="reply-time">${rDate}</span>
                    </div>
                    <div class="reply-text">${r.text}</div>
                </div>
            `;
        });
        detailBody.innerHTML += repliesHtml;
    }
};

// =====================
// COMPOSE & REPLY
// =====================
function initCompose() {
    const composeBtn = document.getElementById('composeBtn') || document.getElementById('newThreadBtn');
    const composeArea = document.getElementById('composeArea');
    const closeCompose = document.getElementById('closeComposeBtn');
    const categorySelect = document.getElementById('receiverCategorySelect');
    
    if (composeBtn && composeArea) {
        composeBtn.addEventListener('click', () => {
            resetDetailView();
            document.getElementById('detailEmptyState')?.classList.add('hidden');
            document.getElementById('emptyView')?.classList.add('hidden');
            composeArea.classList.remove('hidden');
            if (categorySelect) categorySelect.value = "";
            const recSelect = document.getElementById('receiverSelect');
            if (recSelect) {
                recSelect.innerHTML = '<option value="">Önce birim seçiniz...</option>';
                recSelect.disabled = true;
            }
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            loadReceiversByCategory(e.target.value);
        });
    }

    if (closeCompose) {
        closeCompose.addEventListener('click', () => resetDetailView());
    }

    const composeForm = document.getElementById('composeForm');
    if (composeForm) {
        composeForm.addEventListener('submit', handleComposeSubmit);
    }

    const replyBtn = document.getElementById('sendReply');
    if (replyBtn) {
        replyBtn.addEventListener('click', handleReplySubmit);
    }

    const aiSuggestBtn = document.getElementById('aiSuggestBtn');
    let lastOriginalText = ""; // Sil baştan yapmak için ham metni saklıyoruz

    if (aiSuggestBtn) {
        aiSuggestBtn.addEventListener('click', async () => {
            const bodyInput = document.getElementById('messageBodyInput');
            const recSelect = document.getElementById('receiverSelect');
            if (!bodyInput || !recSelect) return;

            let currentText = bodyInput.value.trim();
            if (!currentText) return;

            // Eğer metin zaten AI tarafından düzenlenmişse (✨ varsa), 
            // ve biz hala aynı oturumdaysak, sakladığımız ham metni kullanalım.
            // Aksi takdirde mevcut metni yeni "ham metin" olarak kabul edelim.
            if (!currentText.includes("✨") || !lastOriginalText) {
                lastOriginalText = currentText;
            }

            const receiverText = recSelect.options[recSelect.selectedIndex]?.text || "Yetkili";
            const receiverName = receiverText.split('(')[0].trim();
            const myName = `${currentUserData.name} ${currentUserData.surname || ''}`;
            const myCompany = currentUserData.company || "Bellona";

            const statusEl = document.getElementById('composeStatus');
            if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Düzenleniyor...';

            try {
                const refinedText = await refineMessageWithAI(lastOriginalText, {
                    receiverName,
                    senderName: myName,
                    senderCompany: myCompany
                });
                
                if (refinedText.error) throw new Error(refinedText.error);

                // Sadece Mesaj Gövdesini Güncelle (Sil Baştan)
                bodyInput.value = "✨ " + refinedText;
                
                if (statusEl) {
                    statusEl.innerHTML = '<i class="fa-solid fa-check-circle" style="color:var(--success)"></i> Düzenlendi.';
                    setTimeout(() => statusEl.innerHTML = '', 3000);
                }
            } catch (err) {
                console.error("AI Refine UI Error:", err);
                if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:var(--danger)"></i> Hata.';
            }
        });
    }
}

async function loadReceiversByCategory(category) {
    const select = document.getElementById('receiverSelect');
    if (!select) return;

    if (!category) {
        select.innerHTML = '<option value="">Önce birim seçiniz...</option>';
        select.disabled = true;
        return;
    }

    select.disabled = false;
    select.innerHTML = '<option value="">Yükleniyor...</option>';

    let q;
    const usersRef = collection(db, "users");

    if (category === 'local_boss') {
        // Bölgedeki tüm yerel bayi sorumluları (yöneticiler)
        q = query(usersRef, 
            where("region", "==", currentUserData.region),
            where("category", "==", "local"),
            where("subRole", "==", "manager")
        );
    } else if (category === 'local_colleagues') {
        // Kendi mağazasındaki herkes (hem çalışan hem diğer yöneticiler)
        q = query(usersRef, 
            where("company", "==", currentUserData.company)
        );
    } else if (category === 'region_dealers') {
        // Bağlı olduğu bölgedeki diğer bayi sorumluları/çalışanları
        q = query(usersRef, 
            where("region", "==", currentUserData.region),
            where("category", "==", "region")
        );
    } else {
        // Fallback or restricted access
        select.innerHTML = '<option value="">Yetkiniz olmayan birim</option>';
        return;
    }

    try {
        const snap = await getDocs(q);
        select.innerHTML = `<option value="">${snap.empty ? 'Alıcı bulunamadı' : 'Alıcı seçiniz...'}</option>`;
        
        snap.forEach(doc => {
            const u = doc.data();
            if (doc.id !== currentUserData.id) {
                select.innerHTML += `<option value="${doc.id}">${u.name} ${u.surname || ''} (${u.role === 'admin' ? 'Sistem' : (u.company || 'Bellona')})</option>`;
            }
        });
    } catch (err) {
        console.error("Load receivers error:", err);
        select.innerHTML = '<option value="">Yükleme hatası!</option>';
    }
}

async function handleComposeSubmit(e) {
    e.preventDefault();
    const receiverId = document.getElementById('receiverSelect').value;
    const subject = document.getElementById('subjectInput')?.value || "Konu Yok";
    const body = document.getElementById('messageBodyInput')?.value;

    if (!receiverId || !body) return;

    const receiverDoc = await getDoc(doc(db, "users", receiverId));
    const rData = receiverDoc.data();

    try {
        await addDoc(collection(db, "messages"), {
            senderId: currentUserData.id,
            senderName: `${currentUserData.name} ${currentUserData.surname || ''}`,
            receiverId: receiverId,
            receiverName: `${rData.name} ${rData.surname || ''}`,
            participants: [currentUserData.id, receiverId],
            subject: subject,
            content: body,
            lastMessage: body,
            status: 'active',
            timestamp: serverTimestamp()
        });
        resetDetailView();
        alert("Mesaj başarıyla gönderildi!");
    } catch (err) { console.error("Send error:", err); }
}

async function handleReplySubmit() {
    const input = document.getElementById('replyInput');
    if (!input || !input.value.trim() || !activeThreadId) return;

    const replyText = input.value.trim();
    const now = new Date();
    
    const replyObj = {
        authorName: `${currentUserData.name} ${currentUserData.surname || ''}`,
        authorId: currentUserData.id,
        text: replyText,
        timestamp: now.toISOString()
    };

    try {
        const docRef = doc(db, "messages", activeThreadId);
        const docSnap = await getDoc(docRef);
        const data = docSnap.data();
        
        const replies = data.replies || [];
        replies.push(replyObj);

        await updateDoc(docRef, {
            replies: replies,
            lastMessage: replyText,
            timestamp: serverTimestamp()
        });
        
        input.value = '';
        selectThread(activeThreadId);
    } catch (err) { console.error("Reply error:", err); }
}
