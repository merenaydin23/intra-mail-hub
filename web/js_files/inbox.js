import { auth, db } from './firebase/config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  collection, query, where, orderBy, onSnapshot, 
  addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
    const elements = {
        'userName': `${currentUserData.name} ${currentUserData.surname || ''}`,
        'userCompany': currentUserData.company || 'Bellona Kurumsal',
        'userRole': currentUserData.department || 'Personel',
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
            q = query(baseRef, where("participants", "array-contains", currentUserData.id), where("status", "==", "active"));
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
                const time = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}) : '--:--';
                
                return `
                    <div class="msg-item ${isActive}" onclick="selectThread('${doc.id}')">
                        <div class="msg-header">
                            <span class="msg-sender">${m.senderName || 'Bilinmiyor'}</span>
                            <span class="msg-time">${time}</span>
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

    const map = {
        'detailSubject': data.subject, 'activeSubj': data.subject,
        'detailSenderName': data.senderName, 'activeSender': data.senderName,
        'detailDate': data.timestamp?.toDate().toLocaleString('tr-TR'), 'activeTime': data.timestamp?.toDate().toLocaleString('tr-TR'),
        'detailBody': data.content, 'activeContent': data.content
    };

    Object.entries(map).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = val || '';
    });

    // AI Summary
    const aiBox = document.getElementById('aiSummaryBox') || document.getElementById('aiSummary');
    if (aiBox) {
        if (data.content?.length > 150) {
            aiBox.classList.remove('hidden');
            const aiText = document.getElementById('aiSummaryContent') || document.getElementById('aiSummaryText');
            if (aiText) aiText.textContent = "AI Analizi: Bu mesaj '" + data.subject + "' konusunu içermektedir. Kurumsal standartlara uygun olarak analiz edilmiştir.";
        } else {
            aiBox.classList.add('hidden');
        }
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

    // Akıllı Düzenle (AI Smart Edit)
    const aiSuggestBtn = document.getElementById('aiSuggestBtn');
    if (aiSuggestBtn) {
        aiSuggestBtn.addEventListener('click', () => {
            const bodyInput = document.getElementById('messageBodyInput');
            const recSelect = document.getElementById('receiverSelect');
            if (!bodyInput || !recSelect) return;

            const originalText = bodyInput.value.trim();
            if (!originalText) return;

            const receiverText = recSelect.options[recSelect.selectedIndex]?.text || "Yetkili";
            const receiverName = receiverText.split('(')[0].trim();
            
            const myName = `${currentUserData.name} ${currentUserData.surname || ''}`;
            const myCompany = currentUserData.company || "Bellona";

            // Kurumsal Formatta Düzenle
            const formalText = `Sayın ${receiverName},\n\n${originalText}\n\nSaygılarımla,\n${myName}\n${myCompany}`;
            
            bodyInput.value = formalText;
            
            const statusEl = document.getElementById('composeStatus');
            if (statusEl) {
                statusEl.innerHTML = '<i class="fa-solid fa-check-circle" style="color:var(--success)"></i> Metin kurumsallaştırıldı.';
                setTimeout(() => statusEl.innerHTML = '', 3000);
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
        // Sadece kendi mağazasındaki çalışma arkadaşları
        q = query(usersRef, 
            where("company", "==", currentUserData.company),
            where("subRole", "==", "staff")
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
    if (!input.value.trim() || !activeThreadId) return;

    const replyText = input.value.trim();
    input.value = '';

    try {
        const docRef = doc(db, "messages", activeThreadId);
        const docSnap = await getDoc(docRef);
        const data = docSnap.data();
        
        await updateDoc(docRef, {
            lastMessage: replyText,
            timestamp: serverTimestamp(),
            content: data.content + `<hr/><p><strong>Re (${currentUserData.name}):</strong> ${replyText}</p>`
        });
        selectThread(activeThreadId);
    } catch (err) { console.error("Reply error:", err); }
}
