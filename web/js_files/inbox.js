import { 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
  ref, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { auth, db, storage, messaging } from './firebase/config.js';
import { getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { refineMessageWithAI, summarizeThreadWithAI } from './services/ai-service.js';

function cleanTextForSearch(str) {
    if (!str) return "";
    return str.trim()
        .replace(/I/g, "ı")
        .replace(/İ/g, "i")
        .toLowerCase()
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c");
}

let currentUserData = null;
let activeThreadId = null;
let activeThreadData = null;
let activeThreadListener = null;
let currentFolder = 'inbox';
let forwardOriginalMessageId = null;
let forwardOriginalSenderId = null;
let forwardOriginalSenderName = null;

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
  initUnreadCounter(); // Okunmamış sayacını başlat
  initFCM(user.uid);   // Gerçek Zamanlı Bildirimleri (FCM) Başlat
  loadFolder(currentFolder);
});

// =====================
// REAL-TIME NOTIFICATIONS (FCM)
// =====================
async function initFCM(userId) {
    if (!('Notification' in window)) {
        console.log("Bu tarayıcı anlık bildirimleri desteklemiyor.");
        return;
    }

    if (Notification.permission === 'default') {
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.log("Bildirim izni reddedildi.");
                return;
            }
        } catch (err) {
            console.error("Bildirim izni istenirken hata:", err);
            return;
        }
    }

    if (Notification.permission === 'granted') {
        try {
            // Register messaging service worker explicitly matching Vite's server assets routing
            const serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log("FCM Service Worker başarıyla kaydedildi:", serviceWorkerRegistration);

            // Get messaging device token with standard configuration
            const token = await getToken(messaging, { 
                serviceWorkerRegistration,
                vapidKey: "BM4V4aR4p5QjO2s628n7zP_nI1f7V7sK7B3c4W5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z"
            });

            if (token) {
                console.log("FCM Device Token başarıyla alındı:", token);
                const userDocRef = doc(db, "users", userId);
                await updateDoc(userDocRef, { fcmToken: token });
                console.log("FCM Token Firestore'a başarıyla kaydedildi.");
            } else {
                console.log("Etkin bir FCM token alınamadı. Bildirim izinlerini kontrol edin.");
            }
        } catch (err) {
            console.error("FCM Token alımı veya SW kaydı sırasında hata:", err);
        }
    }
}

function initUnreadCounter() {
    const q = query(
        collection(db, "messages"), 
        where("receiverId", "==", currentUserData.id),
        where("status", "==", "active"),
        where("isRead", "==", false)
    );

    onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        const badge = document.getElementById('unreadCount');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    });
}

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

    const archiveBtn = document.getElementById('btnArchive');
    if (archiveBtn) {
        archiveBtn.addEventListener('click', async () => {
            if (!activeThreadId) {
                alert("Lütfen önce işlem yapılacak bir mesaj seçin.");
                return;
            }
            try {
                const docRef = doc(db, "messages", activeThreadId);
                const nextStatus = currentFolder === 'archive' ? 'active' : 'archive';
                
                await updateDoc(docRef, { status: nextStatus });
                alert(currentFolder === 'archive' ? "Mesaj Gelen Kutusuna geri taşındı!" : "Mesaj başarıyla arşive taşındı!");
                
                resetDetailView();
                loadFolder(currentFolder);
            } catch (err) {
                console.error("Archive toggle error:", err);
                alert("İşlem gerçekleştirilirken bir hata oluştu.");
            }
        });
    }

    const trashBtn = document.getElementById('btnTrash');
    if (trashBtn) {
        trashBtn.addEventListener('click', async () => {
            if (!activeThreadId) {
                alert("Lütfen önce işlem yapılacak bir mesaj seçin.");
                return;
            }
            const docRef = doc(db, "messages", activeThreadId);
            if (currentFolder === 'trash') {
                // Restore from trash
                try {
                    await updateDoc(docRef, { 
                        status: 'active',
                        deletedAt: null
                    });
                    alert("Mesaj Gelen Kutusuna geri yüklendi!");
                    resetDetailView();
                    loadFolder(currentFolder);
                } catch (err) {
                    console.error("Restore error:", err);
                    alert("Mesaj geri yüklenirken bir hata oluştu.");
                }
            } else {
                // Move to trash
                if (confirm("Bu mesajı silmek (çöp kutusuna taşımak) istediğinize emin misiniz?")) {
                    try {
                        await updateDoc(docRef, { 
                            status: 'trash',
                            deletedAt: serverTimestamp()
                        });
                        alert("Mesaj çöp kutusuna taşındı!");
                        resetDetailView();
                        loadFolder(currentFolder);
                    } catch (err) {
                        console.error("Trash error:", err);
                        alert("Mesaj silinirken hata oluştu.");
                    }
                }
            }
        });
    }

    const summarizeBtn = document.getElementById('btnSummarize');
    const summaryBox = document.getElementById('aiSummaryBox');
    const summaryContent = document.getElementById('aiSummaryContent');
    const closeSummary = document.getElementById('closeSummary');

    if (summarizeBtn && summaryBox && summaryContent) {
        summarizeBtn.addEventListener('click', async () => {
            if (!activeThreadId || !activeThreadData) {
                alert("Lütfen önce özetlenecek bir mesaj seçin.");
                return;
            }

            // Show summary box and set state to Loading
            summaryBox.classList.remove('hidden');
            summaryContent.innerHTML = `
                <div style="display:flex; align-items:center; gap:0.5rem; color:var(--text-muted); padding:0.5rem 0;">
                    <i class="fa-solid fa-spinner fa-spin" style="color:var(--accent);"></i>
                    <span style="font-weight:500;">Yazışmalar yapay zeka ile inceleniyor ve özetleniyor, lütfen bekleyin...</span>
                </div>`;

            try {
                const summary = await summarizeThreadWithAI(
                    activeThreadData.subject,
                    activeThreadData.senderName,
                    activeThreadData.receiverName,
                    activeThreadData.content,
                    activeThreadData.replies || []
                );
                
                if (summary) {
                    summaryContent.innerHTML = `<p style="line-height:1.6; font-size:0.92rem; color:var(--text-main); font-weight:500; margin:0;">${summary}</p>`;
                } else {
                    summaryContent.textContent = "Yazışma özeti çıkarılamadı.";
                }
            } catch (err) {
                console.error("Summarization error:", err);
                summaryContent.textContent = "Özetleme işlemi sırasında bir hata oluştu.";
            }
        });
    }

    if (closeSummary && summaryBox) {
        closeSummary.addEventListener('click', () => {
            summaryBox.classList.add('hidden');
        });
    }
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
    forwardOriginalMessageId = null;
    forwardOriginalSenderId = null;
    forwardOriginalSenderName = null;

    const existingTrashNotice = document.getElementById('trashNoticeBox');
    if (existingTrashNotice) existingTrashNotice.remove();

    if (activeThreadListener) {
        activeThreadListener();
        activeThreadListener = null;
    }
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
            q = query(baseRef, where("participants", "array-contains", currentUserData.id), where("status", "==", "active"));
        } else if (['spam', 'archive', 'trash'].includes(folder)) {
            q = query(baseRef, where("participants", "array-contains", currentUserData.id), where("status", "==", folder));
        } else {
            // Inbox (Gelen Kutusu): Dahil olduğum tüm aktif mesajlar
            q = query(baseRef, where("participants", "array-contains", currentUserData.id), where("status", "==", "active"));
        }

        onSnapshot(q, (snapshot) => {
            let filteredDocs = [...snapshot.docs];

            if (folder === 'inbox') {
                filteredDocs = filteredDocs.filter(doc => {
                    const m = doc.data();
                    if (m.senderId === currentUserData.id) {
                        // I am the sender. Only show in Inbox if there is a discussion (replies exist)
                        return m.replies && m.replies.length > 0;
                    }
                    // I am the receiver. It definitely belongs in Gelen Kutusu
                    return true;
                });
            } else if (folder === 'sent') {
                filteredDocs = filteredDocs.filter(doc => {
                    const m = doc.data();
                    // Show in Sent if I am the original sender OR if I wrote a reply in this thread
                    const isOriginalSender = m.senderId === currentUserData.id;
                    const hasMyReply = m.replies && m.replies.some(r => r.authorId === currentUserData.id);
                    return isOriginalSender || hasMyReply;
                });
            }

            if (filteredDocs.length === 0) {
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
            const sortedDocs = filteredDocs.sort((a, b) => {
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
                
                
                                const isSentByMe = m.senderId === currentUserData.id;
                const senderDisplay = isSentByMe ? `<i class="fa-solid fa-share" style="font-size:0.7rem; color:var(--primary)"></i> Alıcı: ${m.receiverName}` : m.senderName;
                
                // Read Receipt status check
                let receiptHtml = '';
                if (isSentByMe) {
                    if (m.isRead) {
                        const readDate = m.readAt?.toDate();
                        const readTooltip = readDate 
                            ? `Okundu: ${readDate.toLocaleString('tr-TR')}` 
                            : 'Okundu';
                        receiptHtml = `<i class="fas fa-check-double" style="color: #00a4ad; margin-left: 4px;" title="${readTooltip}"></i>`;
                    } else {
                        receiptHtml = `<i class="fas fa-check" style="color: var(--text-muted); opacity: 0.6; margin-left: 4px;" title="İletildi (Okunmadı)"></i>`;
                    }
                }

                const replyCount = m.replies ? m.replies.length : 0;
                const totalMessages = 1 + replyCount;
                const badgeHtml = replyCount > 0 
                    ? `<span class="thread-count-badge" style="background:var(--primary-soft); color:var(--primary); font-size:0.7rem; font-weight:700; padding:0.125rem 0.4rem; border-radius:12px; border:1px solid rgba(10, 46, 46, 0.1); display:inline-flex; align-items:center; gap:0.25rem;" title="${totalMessages} Mesaj"><i class="fa-solid fa-comments" style="font-size:0.6rem;"></i> ${totalMessages}</span>`
                    : '';

                return `
                    <div class="msg-item ${isActive}" onclick="selectThread('${doc.id}')">
                        <div class="msg-header">
                            <span class="msg-sender">${senderDisplay}</span>
                            <div class="msg-meta-side" style="display:flex; align-items:center; gap:0.5rem;">
                                ${badgeHtml}
                                <span class="msg-time">${timeStr}${receiptHtml}</span>
                            </div>
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
function handleForwardMessage(id, data) {
    const composeArea = document.getElementById('composeArea');
    if (!composeArea) return;

    // Show compose area and reset recipient selection
    resetDetailView();
    document.getElementById('detailEmptyState')?.classList.add('hidden');
    document.getElementById('emptyView')?.classList.add('hidden');
    composeArea.classList.remove('hidden');
    
    // Clear previously selected recipients so they can pick C
    if (window.__clearSelectedReceivers) window.__clearSelectedReceivers();

    // Set active forward state
    forwardOriginalMessageId = id;
    forwardOriginalSenderId = data.senderId;
    forwardOriginalSenderName = data.senderName;

    // Prefill subject with Fwd prefix if not already present
    const subjectInput = document.getElementById('subjectInput');
    if (subjectInput) {
        const prefix = "İletildi: ";
        subjectInput.value = data.subject.startsWith(prefix) ? data.subject : prefix + data.subject;
    }

    // Prefill message body with a nice header and the original content
    const messageBodyInput = document.getElementById('messageBodyInput');
    if (messageBodyInput) {
        const dateStr = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleString('tr-TR') : 'Bilinmeyen Tarih';
        const separator = "\n\n-----------------------------------------\n";
        const header = `--- İletilen Mesaj ---\nKimden: ${data.senderName}\nTarih: ${dateStr}\nKonu: ${data.subject}\n\n`;
        messageBodyInput.value = separator + header + data.content + separator;
    }
}

window.selectThread = async (id) => {
    activeThreadId = id;
    
    // Unsubscribe from previous listener if exists
    if (activeThreadListener) {
        activeThreadListener();
        activeThreadListener = null;
    }

    const docRef = doc(db, "messages", id);
    
    activeThreadListener = onSnapshot(docRef, async (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        activeThreadData = data;

        // Okundu Bilgisi İşleme (Read Receipt Trigger)
        if (data.receiverId === currentUserData.id && data.isRead === false) {
            try {
                await updateDoc(docRef, {
                    isRead: true,
                    readAt: serverTimestamp()
                });
            } catch (err) {
                console.error("Okundu bilgisi güncellenirken hata:", err);
            }
        }

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

        let receiverDisplay = `Alıcı: ${data.receiverName || 'Bilinmiyor'}`;
        if (data.originalSenderName) {
            receiverDisplay += ` <span style="margin: 0 0.5rem; color: var(--border);">|</span> <span class="to-label" style="background:var(--primary-soft); color:var(--primary); font-weight:700; border:1px solid rgba(10,46,46,0.1); border-radius:6px; padding:0.125rem 0.5rem; display:inline-flex; align-items:center; gap:0.25rem;" title="Bayi ile başlayan ortak yazışma zinciri"><i class="fa-solid fa-link"></i> Ortak Zincir: <strong>${data.originalSenderName}</strong> <i class="fa-solid fa-arrow-right-long" style="font-size:0.7rem; color:var(--accent);"></i> <strong>${data.senderName}</strong> <i class="fa-solid fa-arrow-right-long" style="font-size:0.7rem; color:var(--accent);"></i> <strong>${data.receiverName}</strong></span>`;
        }

        // Detail Read Receipt rendering
        let detailReceiptHtml = '';
        if (data.senderId === currentUserData.id) {
            if (data.isRead) {
                const readDate = data.readAt?.toDate();
                const readDateStr = readDate ? readDate.toLocaleString('tr-TR') : '--';
                detailReceiptHtml = ` <span style="margin-left: 8px; display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; color: #00a4ad; font-weight: 600;"><i class="fas fa-check-double" style="color: #00a4ad;"></i> Okundu (${readDateStr})</span>`;
            } else {
                detailReceiptHtml = ` <span style="margin-left: 8px; display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; color: var(--text-muted); opacity: 0.8;"><i class="fas fa-check"></i> İletildi</span>`;
            }
        }

        const map = {
            'detailSubject': data.subject,
            'detailSenderName': data.senderName,
            'detailSenderEmail': receiverDisplay,
            'detailDate': fullDate + detailReceiptHtml,
            'detailBody': data.content
        };

        Object.entries(map).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = val || '';
        });

        // Render Replies (Threading)
        const repliesBody = document.getElementById('detailBody');
        if (data.replies && data.replies.length > 0) {
            let repliesHtml = '<div class="replies-section">';
            repliesHtml += '<h4 class="replies-title"><i class="fa-solid fa-comments"></i> Yanıtlar</h4>';
            data.replies.forEach(r => {
                const rDate = new Date(r.timestamp).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
                
                if (r.isSystem) {
                    repliesHtml += `
                        <div class="reply-item system-log">
                            <i class="fa-solid fa-circle-info"></i>
                            <span>${r.text}</span>
                            <span style="margin-left:auto; font-size:0.72rem; color:var(--text-muted); font-weight:500;">${rDate}</span>
                        </div>
                    `;
                } else {
                    let targetBadge = '';
                    let itemClass = 'reply-item';
                    
                    if (r.directedToId) {
                        if (r.directedToId === currentUserData.id) {
                            itemClass += ' reply-item-for-me';
                            targetBadge = `
                                <span class="reply-badge-target for-me" title="Bu yanıt doğrudan size hitaben yazılmıştır.">
                                    <i class="fa-solid fa-star"></i> Sizin İçin Öncelikli
                                </span>`;
                        } else {
                            itemClass += ' reply-item-targeted';
                            const targetCleanName = (r.directedToName || 'Bilinmeyen').split('(')[0].trim();
                            targetBadge = `
                                <span class="reply-badge-target targeted" title="Bu yanıt ${targetCleanName} kullanıcısına hitaben yazılmıştır.">
                                    <i class="fa-solid fa-bullseye"></i> ${targetCleanName} Hedefli
                                </span>`;
                        }
                    } else {
                        itemClass += ' reply-item-general';
                        targetBadge = `
                            <span class="reply-badge-target general" title="Bu yanıt konuşmadaki tüm katılımcıların ortak bilgilendirilmesi içindir.">
                                <i class="fa-solid fa-bullhorn"></i> Herkese Açık (Genel)
                            </span>`;
                    }
                    
                    repliesHtml += `
                        <div class="${itemClass}">
                            <div class="reply-header" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                                <span class="reply-author" style="display:flex; align-items:center; gap:0.5rem;">
                                    <i class="fa-solid fa-user-pen" style="color:var(--primary); font-size:0.85rem;"></i> 
                                    <strong>${r.authorName}</strong>
                                </span>
                                ${targetBadge}
                                <span class="reply-date" style="font-size:0.75rem; color:var(--text-muted); font-weight:500; margin-left:auto;">${rDate}</span>
                            </div>
                            <div class="reply-text" style="margin-top:0.75rem;">${r.text}</div>
                        </div>
                    `;
                }
            });
            repliesHtml += '</div>';
            if (repliesBody) repliesBody.innerHTML += repliesHtml;
        }

        // Ekli Dosya Görüntüleme
        const attachmentsArea = document.getElementById('attachmentsArea');
        const attachmentsList = document.getElementById('attachmentsList');
        if (attachmentsArea && attachmentsList) {
            if (data.attachmentUrl) {
                attachmentsArea.classList.remove('hidden');
                attachmentsList.innerHTML = `
                    <div class="attachment-item">
                        <i class="fa-solid fa-file-pdf"></i>
                        <div class="attachment-info">
                            <span class="file-name">${data.attachmentName || 'Ekli Dosya'}</span>
                            <a href="${data.attachmentUrl}" target="_blank" class="btn-download">
                                <i class="fa-solid fa-download"></i> İndir / Görüntüle
                            </a>
                        </div>
                    </div>
                `;
            } else {
                attachmentsArea.classList.add('hidden');
                attachmentsList.innerHTML = '';
            }
        }

        // Setup Targeted Reply Dropdown dynamically
        const replyActionsRow = document.querySelector('.reply-actions-row');
        if (replyActionsRow) {
            let existingTargetWrapper = document.getElementById('replyTargetWrapper');
            if (existingTargetWrapper) existingTargetWrapper.remove();

            const targetWrapper = document.createElement('div');
            targetWrapper.id = 'replyTargetWrapper';
            targetWrapper.style.marginBottom = '0.75rem';
            targetWrapper.style.display = 'flex';
            targetWrapper.style.alignItems = 'center';
            targetWrapper.style.gap = '0.5rem';
            targetWrapper.style.fontSize = '0.85rem';

            const otherParticipants = [];
            if (data.senderId !== currentUserData.id) {
                otherParticipants.push({ id: data.senderId, name: data.senderName });
            }
            if (data.receiverId !== currentUserData.id) {
                otherParticipants.push({ id: data.receiverId, name: data.receiverName });
            }
            if (data.originalSenderId && data.originalSenderId !== currentUserData.id) {
                otherParticipants.push({ id: data.originalSenderId, name: data.originalSenderName });
            }
            
            if (data.replies) {
                data.replies.forEach(rep => {
                    if (rep.authorId && rep.authorId !== currentUserData.id && !otherParticipants.find(p => p.id === rep.authorId)) {
                        otherParticipants.push({ id: rep.authorId, name: rep.authorName });
                    }
                });
            }

            let optionsHtml = '<option value="">📢 Herkese Açık (Genel)</option>';
            otherParticipants.forEach(p => {
                optionsHtml += `<option value="${p.id}" data-name="${p.name}">🎯 ${p.name} (Öncelikli)</option>`;
            });

            targetWrapper.innerHTML = `
                <span style="font-weight:600; color:var(--text-muted); display:inline-flex; align-items:center; gap:0.25rem;"><i class="fa-solid fa-bullseye"></i> Kime Hitaben?</span>
                <select id="replyTargetSelect" style="padding:0.35rem 0.75rem; border:1px solid var(--border); border-radius:6px; font-family:inherit; font-size:0.8rem; background:white; color:var(--text-main); outline:none; cursor:pointer;">
                    ${optionsHtml}
                </select>
            `;

            replyActionsRow.parentNode.insertBefore(targetWrapper, replyActionsRow);

            const tSel = targetWrapper.querySelector('#replyTargetSelect');
            const rInp = document.getElementById('replyInput');
            if (tSel && rInp) {
                tSel.addEventListener('change', () => {
                    const opt = tSel.options[tSel.selectedIndex];
                    const name = opt.getAttribute('data-name');
                    if (name) {
                        rInp.value = customizeMessageForRecipient(rInp.value, name);
                    } else {
                        const collectiveNames = otherParticipants.map(p => p.name.split('(')[0].trim()).join(', ');
                        if (collectiveNames) {
                            rInp.value = customizeMessageForRecipient(rInp.value, collectiveNames);
                        }
                    }
                });
            }
        }

        // Dynamic Forward Button Addition
        const btnGroup = document.querySelector('.meta-row .btn-group') || document.querySelector('.action-row .btn-group');
        if (btnGroup) {
            const existingFwd = document.getElementById('btnForward');
            if (existingFwd) existingFwd.remove();

            const fwdBtn = document.createElement('button');
            fwdBtn.id = 'btnForward';
            fwdBtn.className = 'btn-action';
            fwdBtn.title = 'Konuşmaya Dahil Et / Grup';
            fwdBtn.style.background = 'var(--primary-soft)';
            fwdBtn.style.color = 'var(--primary)';
            fwdBtn.style.marginLeft = '4px';
            fwdBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i>';
            fwdBtn.addEventListener('click', () => {
                openLoopInModal(id, data);
            });
            btnGroup.appendChild(fwdBtn);
        }

        const archiveBtn = document.getElementById('btnArchive');
        if (archiveBtn) {
            if (currentFolder === 'archive') {
                archiveBtn.innerHTML = '<i class="fa-solid fa-envelope-open"></i>';
                archiveBtn.title = 'Gelen Kutusuna Taşı';
            } else {
                archiveBtn.innerHTML = '<i class="fa-solid fa-box-archive"></i>';
                archiveBtn.title = 'Arşivle';
            }
        }

        const trashBtn = document.getElementById('btnTrash');
        if (trashBtn) {
            if (currentFolder === 'trash') {
                trashBtn.innerHTML = '<i class="fa-solid fa-trash-arrow-up"></i>';
                trashBtn.title = 'Geri Yükle';
            } else {
                trashBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                trashBtn.title = 'Sil';
            }
        }

        const replySection = document.getElementById('replySection');
        if (replySection) {
            if (currentFolder === 'trash') {
                replySection.classList.add('hidden');
                
                let existingTrashNotice = document.getElementById('trashNoticeBox');
                if (!existingTrashNotice) {
                    existingTrashNotice = document.createElement('div');
                    existingTrashNotice.id = 'trashNoticeBox';
                    existingTrashNotice.className = 'trash-notice-box';
                    existingTrashNotice.style.margin = '1.5rem 2rem';
                    existingTrashNotice.style.padding = '1.2rem';
                    existingTrashNotice.style.background = 'linear-gradient(135deg, #fff1f2, #ffe4e6)';
                    existingTrashNotice.style.borderRadius = '14px';
                    existingTrashNotice.style.border = '1.2px solid #fecdd3';
                    existingTrashNotice.style.color = '#9f1239';
                    existingTrashNotice.style.fontSize = '0.9rem';
                    existingTrashNotice.style.fontWeight = '500';
                    existingTrashNotice.style.display = 'flex';
                    existingTrashNotice.style.alignItems = 'center';
                    existingTrashNotice.style.gap = '0.75rem';
                    existingTrashNotice.innerHTML = `
                        <i class="fa-solid fa-circle-exclamation" style="font-size:1.4rem; color:#e11d48; flex-shrink: 0;"></i>
                        <div>
                            <strong>Bu mesaj çöp kutusundadır.</strong> Yanıt yazmak veya işlem yapmak için mesajı yukarıdaki <strong>Geri Yükle</strong> butonunu kullanarak kurtarabilirsiniz. Çöp kutusundaki iletiler 15 gün boyunca saklanır, ardından kalıcı olarak silinir.
                        </div>
                    `;
                    replySection.parentNode.insertBefore(existingTrashNotice, replySection);
                }
            } else {
                replySection.classList.remove('hidden');
                const existingTrashNotice = document.getElementById('trashNoticeBox');
                if (existingTrashNotice) existingTrashNotice.remove();
            }
        }
    });
};

// =====================
// COMPOSE & REPLY
// =====================
function initCompose() {
    const composeBtn = document.getElementById('composeBtn') || document.getElementById('newThreadBtn');
    const composeArea = document.getElementById('composeArea');
    const closeCompose = document.getElementById('closeComposeBtn');
    const categorySelect = document.getElementById('receiverCategorySelect');
    
    // Search Elements
    const searchInput = document.getElementById('receiverSearchInput');
    const resultsArea = document.getElementById('receiverSearchResults');
    const receiversList = document.getElementById('selectedReceiversList');
    const addCategoryBtn = document.getElementById('addCategoryBtn');

    // Dynamically Inject Premium Drag Resizer Bar
    if (receiversList && !document.getElementById('receiversListResizer')) {
        const resizer = document.createElement('div');
        resizer.className = 'resizer-handle';
        resizer.id = 'receiversListResizer';
        resizer.innerHTML = '<i class="fa-solid fa-grip-lines"></i>';
        
        // Insert right after receiversList
        receiversList.parentNode.insertBefore(resizer, receiversList.nextSibling);

        let isResizing = false;
        let startY, startHeight;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = parseInt(document.defaultView.getComputedStyle(receiversList).height, 10);
            document.documentElement.addEventListener('mousemove', doDrag, false);
            document.documentElement.addEventListener('mouseup', stopDrag, false);
            resizer.classList.add('active');
            e.preventDefault();
        });

        function doDrag(e) {
            if (!isResizing) return;
            const currentHeight = startHeight + (e.clientY - startY);
            if (currentHeight >= 75 && currentHeight <= 250) {
                receiversList.style.height = `${currentHeight}px`;
            }
        }

        function stopDrag(e) {
            isResizing = false;
            document.documentElement.removeEventListener('mousemove', doDrag, false);
            document.documentElement.removeEventListener('mouseup', stopDrag, false);
            resizer.classList.remove('active');
        }
    }

    let currentReceivers = [];
    let selectedReceivers = []; // [{id, name, type: 'individual'|'bulk'}]

    if (composeBtn && composeArea) {
        composeBtn.addEventListener('click', () => {
            resetDetailView();
            document.getElementById('detailEmptyState')?.classList.add('hidden');
            document.getElementById('emptyView')?.classList.add('hidden');
            composeArea.classList.remove('hidden');
            
            // Reset form
            if (categorySelect) categorySelect.value = "";
            if (searchInput) {
                searchInput.value = "";
                searchInput.disabled = true;
            }
            if (resultsArea) resultsArea.classList.add('hidden');
            selectedReceivers = [];
            renderReceivers();
        });
    }

    const regionFilterContainer = document.getElementById('regionFilterContainer');
    const regionFilterSelect = document.getElementById('regionFilterSelect');

    if (categorySelect) {
        categorySelect.addEventListener('change', async (e) => {
            const cat = e.target.value;
            if (['local_boss', 'region_dealers', 'global'].includes(cat)) {
                regionFilterContainer?.classList.remove('hidden');
            } else {
                regionFilterContainer?.classList.add('hidden');
                if (regionFilterSelect) regionFilterSelect.value = "";
            }
            if (!cat) {
                searchInput.disabled = true;
                searchInput.value = "";
                return;
            }
            searchInput.disabled = false;
            searchInput.placeholder = "Yükleniyor...";
            currentReceivers = await loadReceiversByCategory(cat, regionFilterSelect?.value);
            searchInput.placeholder = "İsim, şirket veya bayi kodu ile ara...";
        });
    }

    if (regionFilterSelect) {
        regionFilterSelect.addEventListener('change', async () => {
            const cat = categorySelect.value;
            if (!cat) return;
            searchInput.placeholder = "Filtreleniyor...";
            currentReceivers = await loadReceiversByCategory(cat, regionFilterSelect.value);
            searchInput.placeholder = "İsim, şirket veya bayi kodu ile ara...";
        });
    }

    if (closeCompose) {
        closeCompose.addEventListener('click', () => {
            composeArea.classList.add('hidden');
            composeArea.classList.remove('minimized');
        });
    }

    const minimizeBtn = document.getElementById('minimizeCompose');
    if (minimizeBtn && composeArea) {
        minimizeBtn.addEventListener('click', () => {
            composeArea.classList.toggle('minimized');
            const icon = minimizeBtn.querySelector('i');
            if (composeArea.classList.contains('minimized')) {
                icon.className = 'fa-solid fa-window-maximize';
            } else {
                icon.className = 'fa-solid fa-minus';
            }
        });
    }

    // Dynamically Inject Top Resizer for the Entire Compose Area
    if (composeArea && !document.getElementById('composeTopResizer')) {
        const topResizer = document.createElement('div');
        topResizer.className = 'compose-top-resizer';
        topResizer.id = 'composeTopResizer';
        composeArea.appendChild(topResizer);

        let isResizingArea = false;
        let startY, startHeight;

        topResizer.addEventListener('mousedown', (e) => {
            if (composeArea.classList.contains('minimized')) return;
            isResizingArea = true;
            startY = e.clientY;
            startHeight = parseInt(document.defaultView.getComputedStyle(composeArea).height, 10);
            document.documentElement.addEventListener('mousemove', doDragArea, false);
            document.documentElement.addEventListener('mouseup', stopDragArea, false);
            topResizer.classList.add('active');
            e.preventDefault();
        });

        function doDragArea(e) {
            if (!isResizingArea) return;
            const currentHeight = startHeight - (e.clientY - startY);
            const maxHeight = window.innerHeight * 0.9;
            if (currentHeight >= 400 && currentHeight <= maxHeight) {
                composeArea.style.height = `${currentHeight}px`;
            }
        }

        function stopDragArea(e) {
            isResizingArea = false;
            document.documentElement.removeEventListener('mousemove', doDragArea, false);
            document.documentElement.removeEventListener('mouseup', stopDragArea, false);
            topResizer.classList.remove('active');
        }
    }

    if (regionFilterSelect) {
        regionFilterSelect.addEventListener('change', async () => {
            const cat = categorySelect.value;
            if (!cat) return;
            searchInput.placeholder = "Filtreleniyor...";
            currentReceivers = await loadReceiversByCategory(cat, regionFilterSelect.value);
            searchInput.placeholder = "İsim, şirket veya bayi kodu ile ara...";
        });
    }

    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', () => {
            const catVal = categorySelect.value;
            if (!catVal) {
                alert("Lütfen önce bir birim seçiniz.");
                return;
            }
            if (catVal === 'global' && !regionFilterSelect.value) {
                alert("Global birim tümüyle eklenemez, lütfen bölge seçiniz veya arama yapınız.");
                return;
            }
            const catText = categorySelect.options[categorySelect.selectedIndex].text;
            const regVal = regionFilterSelect.value || "";
            const regText = regVal ? ` (${regVal})` : '';
            // Use ':' as delimiter to avoid conflict with '_' in category names
            window.__selectReceiver(`BULK:${catVal}:${regVal}`, `📢 ${catText}${regText}`, 'bulk');
        });
    }

    window.__selectReceiver = (id, name, type, region = "", company = "", category = "", subRole = "", dealerCode = "") => {
        if (selectedReceivers.find(r => r.id === id)) {
            alert(`⚠️ ${name} zaten alıcı listenizde ekli!`);
            if (resultsArea) resultsArea.classList.add('hidden');
            if (searchInput) searchInput.value = "";
            return;
        }

        if (type === 'individual') {
            const isCovered = selectedReceivers.some(r => {
                if (r.type !== 'bulk') return false;
                const parts = r.id.split(':');
                const cat = parts[1];
                const reg = parts[2] || "";
                if (cat === 'local_boss') {
                    return category === 'local' && subRole === 'manager' && (reg ? region === reg : region === currentUserData.region);
                } else if (cat === 'local_colleagues') {
                    return region === currentUserData.region;
                } else if (cat === 'region_dealers') {
                    return category === 'regional' && (reg ? region === reg : region === currentUserData.region);
                } else if (cat === 'factory_hq') {
                    return category === 'factory';
                } else if (cat === 'global') {
                    return reg ? region === reg : true;
                }
                return false;
            });
            if (isCovered) {
                alert(`${name} zaten seçtiğiniz grup alıcıları (Toplu) içerisinde yer alıyor.`);
                if (resultsArea) resultsArea.classList.add('hidden');
                if (searchInput) searchInput.value = "";
                return;
            }
        } else if (type === 'bulk') {
            const parts = id.split(':');
            const cat = parts[1];
            const reg = parts[2] || "";
            
            selectedReceivers = selectedReceivers.filter(r => {
                if (r.type === 'bulk') return true;
                let isCovered = false;
                if (cat === 'local_boss') {
                    isCovered = r.category === 'local' && r.subRole === 'manager' && (reg ? r.region === reg : r.region === currentUserData.region);
                } else if (cat === 'local_colleagues') {
                    isCovered = r.region === currentUserData.region;
                } else if (cat === 'region_dealers') {
                    isCovered = r.category === 'regional' && (reg ? r.region === reg : r.region === currentUserData.region);
                } else if (cat === 'factory_hq') {
                    isCovered = r.category === 'factory';
                } else if (cat === 'global') {
                    isCovered = reg ? r.region === reg : true;
                }
                return !isCovered;
            });
        }

        selectedReceivers.push({ id, name, type, region, company, category, subRole, dealerCode });
        renderReceivers();
        
        if (resultsArea) resultsArea.classList.add('hidden');
        if (searchInput) {
            searchInput.value = "";
            searchInput.focus();
        }
    };

    function getRegionClass(region) {
        if (!region) return "";
        const r = region.toLowerCase();
        if (r.includes("marmara")) return "reg-marmara";
        if (r.includes("iç anadolu")) return "reg-icanadolu";
        if (r.includes("ege")) return "reg-ege";
        if (r.includes("akdeniz")) return "reg-akdeniz";
        if (r.includes("karadeniz")) return "reg-karadeniz";
        if (r.includes("doğu anadolu")) return "reg-dogu";
        if (r.includes("güneydoğu anadolu")) return "reg-guneydogu";
        return "";
    }

    function showCustomTooltip(e) {
        let tooltip = document.getElementById('receiverTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'receiverTooltip';
            tooltip.className = 'receiver-tooltip';
            document.body.appendChild(tooltip);
        }

        const ds = e.currentTarget.dataset;
        const name = ds.name || '';
        const company = ds.company || 'Bellona Kurumsal';
        const region = ds.region || 'Genel';
        const rawRole = ds.role || '';
        const category = ds.cat || '';
        const code = ds.code || '0000';

        let roleText = 'Mağaza Personeli';
        if (category === 'factory') roleText = 'Fabrika Yetkilisi';
        else if (category === 'regional') roleText = 'Bölge Sorumlusu';
        else if (rawRole === 'manager') roleText = 'Yönetici / Patron';

        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        tooltip.innerHTML = `
          <div class="tooltip-header">
            <div class="tooltip-avatar">${initials}</div>
            <div class="tooltip-title-area">
              <div class="tooltip-name">${name}</div>
              <div class="tooltip-role">${roleText}</div>
            </div>
          </div>
          <div class="tooltip-body">
            <div class="tooltip-info-row">
              <span class="info-label"><i class="fa-solid fa-building"></i> Şirket:</span>
              <span class="info-value">${company}</span>
            </div>
            <div class="tooltip-info-row">
              <span class="info-label"><i class="fa-solid fa-map-location-dot"></i> Bölge:</span>
              <span class="info-value">${region}</span>
            </div>
            <div class="tooltip-info-row">
              <span class="info-label"><i class="fa-solid fa-barcode"></i> Bayi Kodu:</span>
              <span class="info-value">#${code}</span>
            </div>
          </div>
        `;

        tooltip.classList.add('visible');
        positionCustomTooltip(e);
    }

    function positionCustomTooltip(e) {
        const tooltip = document.getElementById('receiverTooltip');
        if (!tooltip) return;

        const x = e.clientX + 15;
        const y = e.clientY + 15;

        // Check boundary
        const tooltipWidth = tooltip.offsetWidth || 290;
        const tooltipHeight = tooltip.offsetHeight || 150;

        let finalX = x;
        let finalY = y;

        if (x + tooltipWidth > window.innerWidth) {
            finalX = e.clientX - tooltipWidth - 15;
        }
        if (y + tooltipHeight > window.innerHeight) {
            finalY = e.clientY - tooltipHeight - 15;
        }

        tooltip.style.left = `${finalX}px`;
        tooltip.style.top = `${finalY}px`;
    }

    function hideCustomTooltip() {
        const tooltip = document.getElementById('receiverTooltip');
        if (tooltip) {
            tooltip.classList.remove('visible');
        }
    }

    function renderReceivers() {
        if (!receiversList) return;
        receiversList.innerHTML = selectedReceivers.map((r, index) => {
            const regClass = r.type === 'bulk' ? 'bulk' : getRegionClass(r.region);
            const unitLabel = r.type === 'bulk' ? 'GRUP' : (r.category === 'factory' ? 'FB' : (r.category === 'regional' ? 'BLG' : 'BYI'));
            
            return `
                <div class="receiver-chip ${regClass}" data-index="${index}" data-cat="${r.category || ''}" data-name="${r.name}" data-type="${r.type}" data-company="${r.company || ''}" data-region="${r.region || ''}" data-role="${r.subRole || ''}" data-code="${r.dealerCode || ''}">
                    <i class="fa-solid ${r.type === 'bulk' ? 'fa-users' : 'fa-user'}"></i>
                    <span>${r.name}</span>
                    <span class="unit-badge">${unitLabel}</span>
                    ${r.type === 'bulk' ? `<i class="fa-solid fa-expand-arrows-alt expand-trigger" title="Grubu Dağıt"></i>` : ''}
                    <i class="fa-solid fa-circle-xmark remove-chip-trigger" title="Kaldır"></i>
                </div>
            `;
        }).join('');

        // Auto-scroll to bottom
        receiversList.scrollTop = receiversList.scrollHeight;

        // Event delegation for chip actions
        receiversList.querySelectorAll('.receiver-chip').forEach(chip => {
            const index = parseInt(chip.getAttribute('data-index'));
            
            chip.querySelector('.remove-chip-trigger').onclick = (e) => {
                e.stopPropagation();
                // Hide tooltip if it was showing for this chip
                const tooltip = document.getElementById('receiverTooltip');
                if (tooltip) tooltip.classList.remove('visible');
                window.__removeReceiver(index);
            };

            const expandBtn = chip.querySelector('.expand-trigger');
            if (expandBtn) {
                expandBtn.onclick = (e) => {
                    e.stopPropagation();
                    window.__expandBulk(index);
                };
            }

            // Hover Tooltip Events
            if (chip.getAttribute('data-type') !== 'bulk') {
                chip.addEventListener('mouseenter', (e) => {
                    showCustomTooltip(e);
                });
                chip.addEventListener('mousemove', (e) => {
                    positionCustomTooltip(e);
                });
                chip.addEventListener('mouseleave', () => {
                    hideCustomTooltip();
                });
            }
        });
    }

    window.__expandBulk = async (index) => {
        const item = selectedReceivers[index];
        if (item.type !== 'bulk') return;

        const chipEl = receiversList.querySelector(`[data-index="${index}"]`);
        if (chipEl) chipEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor...';

        const parts = item.id.split(':');
        const cat = parts[1];
        const reg = parts[2] || "";
        
        const users = await loadReceiversByCategory(cat, reg);
        
        if (users.length === 0) {
            alert(`Bu grupta (${item.name}) kimse bulunamadı.`);
            renderReceivers();
            return;
        }

        selectedReceivers.splice(index, 1);
        users.forEach(u => {
            if (u.id !== currentUserData.id && !selectedReceivers.find(r => r.id === u.id)) {
                selectedReceivers.push({ 
                    id: u.id, 
                    name: `${u.name} ${u.surname || ''}`, 
                    type: 'individual',
                    region: u.region,
                    company: u.company,
                    category: u.category
                });
            }
        });

        renderReceivers();
    };

    window.__removeReceiver = (index) => {
        selectedReceivers.splice(index, 1);
        renderReceivers();
    };

    window.__getSelectedReceivers = () => selectedReceivers;
    window.__clearSelectedReceivers = () => { selectedReceivers = []; renderReceivers(); };

    if (closeCompose) {
        closeCompose.addEventListener('click', () => resetDetailView());
    }

    const composeForm = document.getElementById('composeForm');
    if (composeForm) {
        composeForm.addEventListener('submit', handleComposeSubmit);
    }

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', (e) => {
            handleComposeSubmit(e);
        });
    }

    const replyBtn = document.getElementById('sendReply');
    if (replyBtn) {
        replyBtn.addEventListener('click', handleReplySubmit);
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = cleanTextForSearch(e.target.value);
            if (!val) {
                resultsArea.classList.add('hidden');
                return;
            }

            const filtered = currentReceivers.filter(u => {
                const searchStr = cleanTextForSearch(`${u.name} ${u.surname || ''} ${u.company || ''} ${u.dealerCode || ''} ${u.city || ''}`);
                return searchStr.includes(val);
            }).slice(0, 10);

            let html = "";
            
            // Toplu Gönderim Opsiyonu
            const catVal = categorySelect.value;
            const catText = categorySelect.options[categorySelect.selectedIndex].text;
            const regVal = regionFilterSelect?.value || "";
            const regText = regVal ? ` (${regVal})` : '';
            
            if (currentReceivers.length > 1 && ("tumu".includes(val) || "herkes".includes(val) || val.length > 2)) {
                html += `
                    <div class="search-result-item bulk-option" onclick="window.__selectReceiver('BULK:${catVal}:${regVal}', '📢 ${catText}${regText}', 'bulk')">
                        <div class="item-title">📢 ${catText}${regText} (${currentReceivers.length} Kişi)</div>
                        <div class="item-subtitle">Filtrelenen birimdeki tüm personele mesaj gider.</div>
                    </div>
                `;
            }

            if (filtered.length > 0) {
                html += filtered.map(u => `
                    <div class="search-result-item" onclick="window.__selectReceiver('${u.id}', '${u.name} ${u.surname || ''}', 'individual', '${u.region || ''}', '${u.company || ''}', '${u.category || ''}', '${u.subRole || ''}', '${u.dealerCode || ''}')">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="item-title">${u.name} ${u.surname || ''}</span>
                            <span style="font-size:0.65rem; background:var(--primary-soft); color:var(--primary); padding:2px 6px; border-radius:4px; font-weight:700;">#${u.dealerCode || '0000'}</span>
                        </div>
                        <div class="item-subtitle">
                            <i class="fa-solid fa-building" style="font-size:0.7rem;"></i> ${u.company || 'Bellona'} 
                        </div>
                    </div>
                `).join('');
            }

            if (!html) html = '<div style="padding:1rem; text-align:center; font-size:0.8rem; color:var(--text-muted);">Sonuç bulunamadı.</div>';

            resultsArea.innerHTML = html;
            resultsArea.classList.remove('hidden');
        });
    }

    const aiSuggestBtn = document.getElementById('aiSuggestBtn');
    let lastOriginalText = ""; 

    if (aiSuggestBtn) {
        aiSuggestBtn.addEventListener('click', async () => {
            const bodyInput = document.getElementById('messageBodyInput');
            if (!bodyInput || selectedReceivers.length === 0) return;

            let currentText = bodyInput.value.trim();
            if (!currentText) return;

            if (!currentText.includes("✨") || !lastOriginalText) {
                lastOriginalText = currentText;
            }

            const receiverName = selectedReceivers[0].name.split('(')[0].trim();
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

    const aiReplySuggestBtn = document.getElementById('aiReplySuggestBtn');
    let lastOriginalReplyText = ""; 

    if (aiReplySuggestBtn) {
        aiReplySuggestBtn.addEventListener('click', async () => {
            const replyInput = document.getElementById('replyInput');
            if (!replyInput || !activeThreadData) return;

            let currentText = replyInput.value.trim();
            if (!currentText) return;

            if (!currentText.includes("✨") || !lastOriginalReplyText) {
                lastOriginalReplyText = currentText;
            }

            const receiverName = activeThreadData.senderId === currentUserData.id 
                ? activeThreadData.receiverName.split('(')[0].trim() 
                : activeThreadData.senderName.split('(')[0].trim();
                
            const myName = `${currentUserData.name} ${currentUserData.surname || ''}`;
            const myCompany = currentUserData.company || "Bellona";

            const statusEl = document.getElementById('replyAIStatus');
            if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Düzenleniyor...';

            try {
                const refinedText = await refineMessageWithAI(lastOriginalReplyText, {
                    receiverName,
                    senderName: myName,
                    senderCompany: myCompany
                });
                
                if (refinedText.error) throw new Error(refinedText.error);
                replyInput.value = "✨ " + refinedText;
                
                if (statusEl) {
                    statusEl.innerHTML = '<i class="fa-solid fa-check-circle" style="color:var(--success)"></i> Düzenlendi.';
                    setTimeout(() => statusEl.innerHTML = '', 3000);
                }
            } catch (err) {
                console.error("AI Reply Refine UI Error:", err);
                if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:var(--danger)"></i> Hata.';
            }
        });
    }
}

async function loadReceiversByCategory(category, regionFilter = "") {
    let q;
    const usersRef = collection(db, "users");

    if (category === 'local_boss') {
        if (regionFilter) {
            q = query(usersRef, where("category", "==", "local"), where("subRole", "==", "manager"), where("region", "==", regionFilter));
        } else {
            q = query(usersRef, where("region", "==", currentUserData.region), where("category", "==", "local"), where("subRole", "==", "manager"));
        }
    } else if (category === 'local_colleagues') {
        q = query(usersRef, where("region", "==", currentUserData.region));
    } else if (category === 'region_dealers') {
        if (regionFilter) {
            q = query(usersRef, where("category", "==", "regional"), where("region", "==", regionFilter));
        } else {
            q = query(usersRef, where("region", "==", currentUserData.region), where("category", "==", "regional"));
        }
    } else if (category === 'factory_hq') {
        q = query(usersRef, where("category", "==", "factory"));
    } else if (category === 'global') {
        if (regionFilter) {
            q = query(usersRef, where("region", "==", regionFilter));
        } else {
            q = query(usersRef);
        }
    } else {
        return [];
    }

    try {
        const snap = await getDocs(q);
        const users = [];
        snap.forEach(doc => {
            if (doc.id !== currentUserData.id) {
                users.push({ id: doc.id, ...doc.data() });
            }
        });
        return users;
    } catch (err) {
        console.error("Load receivers error:", err);
        return [];
    }
}

function customizeMessageForRecipient(body, recipientName) {
    const cleanName = recipientName.split('(')[0].trim();
    // Welcome regex matches: (optional ✨) followed by "Sayın" or "Merhaba" or "Sevgili" and then the old greeting text up to comma/newline
    const welcomeRegex = /^(✨\s*)?(Sayın|Merhaba|Sevgili)\s+[^,:\n]+([,\s:\n]*)/i;
    if (welcomeRegex.test(body)) {
        return body.replace(welcomeRegex, (match, spark, prefix, suffix) => {
            return `${spark || ''}Sayın ${cleanName}${suffix || ',\n\n'}`;
        });
    } else {
        // Prepend Sayın [Alıcı Adı],\n\n automatically
        return `Sayın ${cleanName},\n\n${body}`;
    }
}

async function handleComposeSubmit(e) {
    e.preventDefault();
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;

    try {
        const selected = window.__getSelectedReceivers();
        const subject = document.getElementById('subjectInput').value.trim() || 'Konu Yok';
        const body = document.getElementById('messageBodyInput').value.trim();

        if (selected.length === 0 || !body) {
            alert("Lütfen en az bir alıcı ve mesaj içeriğini doldurunuz.");
            if (sendBtn) sendBtn.disabled = false;
            return;
        }

        let attachmentUrl = null;
        let attachmentName = null;

        // Dosya Yükleme (Varsa)
        const fileInput = document.getElementById('fileInput');
        if (fileInput && fileInput.files[0]) {
            const file = fileInput.files[0];
            attachmentName = file.name;
            const fileRef = ref(storage, `messages/${Date.now()}_${file.name}`);
            const uploadResult = await uploadBytes(fileRef, file);
            attachmentUrl = await getDownloadURL(uploadResult.ref);
        }

        // Alıcıları Çözümle (Toplu grupları bireylere dök)
        const finalRecipients = new Map(); // id -> {name}

        for (const item of selected) {
            if (item.type === 'bulk') {
                const parts = item.id.split(':');
                const cat = parts[1];
                const reg = parts[2] || "";
                const users = await loadReceiversByCategory(cat, reg);
                users.forEach(u => finalRecipients.set(u.id, { name: `${u.name} ${u.surname || ''}` }));
            } else {
                finalRecipients.set(item.id, { name: item.name });
            }
        }

        if (finalRecipients.size === 0) throw new Error("Gönderilecek alıcı bulunamadı.");

        const batch = writeBatch(db);

        Array.from(finalRecipients.entries()).forEach(([tid, tdata]) => {
            const pArr = [currentUserData.id, tid];
            if (forwardOriginalSenderId && !pArr.includes(forwardOriginalSenderId)) {
                pArr.push(forwardOriginalSenderId);
            }
            
            // Customize salutation/greeting to recipient name for each email individually!
            const customizedBody = customizeMessageForRecipient(body, tdata.name);
            
            // Create a reference for a new document with an auto-generated ID inside the messages collection
            const newMsgRef = doc(collection(db, "messages"));
            
            batch.set(newMsgRef, {
                senderId: currentUserData.id,
                senderName: `${currentUserData.name} ${currentUserData.surname || ''}`,
                receiverId: tid,
                receiverName: tdata.name,
                participants: pArr,
                subject: subject,
                content: customizedBody,
                lastMessage: customizedBody,
                status: 'active',
                isRead: false,
                timestamp: serverTimestamp(),
                attachmentUrl,
                attachmentName,
                originalSenderId: forwardOriginalSenderId || null,
                originalSenderName: forwardOriginalSenderName || null
            });
        });

        await batch.commit();
        alert(`${finalRecipients.size} farklı alıcıya mesaj başarıyla gönderildi!`);
        
        // Reset forward state
        forwardOriginalMessageId = null;
        forwardOriginalSenderId = null;
        forwardOriginalSenderName = null;
        
        if (fileInput) fileInput.value = '';
        
        // Clear selected receivers list and form inputs completely
        window.__clearSelectedReceivers();
        if (document.getElementById('subjectInput')) document.getElementById('subjectInput').value = '';
        if (document.getElementById('messageBodyInput')) document.getElementById('messageBodyInput').value = '';
        
        resetDetailView();
    } catch (err) { 
        console.error("Send error:", err); 
        alert("Gönderim sırasında hata oluştu.");
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
}

async function openLoopInModal(threadId, threadData) {
    let backdrop = document.getElementById('loopinModalBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'loopinModalBackdrop';
        backdrop.className = 'loopin-modal-backdrop';
        backdrop.innerHTML = `
            <div class="loopin-modal">
                <div class="loopin-modal-header">
                    <h3><i class="fa-solid fa-users-gear"></i> Konuşmaya Yeni Kişi Ekle (Grup)</h3>
                    <button class="loopin-modal-close" onclick="document.getElementById('loopinModalBackdrop').classList.remove('active')">&times;</button>
                </div>
                <div class="loopin-modal-body">
                    <div class="loopin-select-group">
                        <label>1. Eklenecek Birim Seçin</label>
                        <select id="loopinCategorySelect">
                            <option value="">-- Birim Seçin --</option>
                            <option value="factory_hq">🏢 Fabrika Genel (HQ)</option>
                            <option value="region_dealers">🗺️ Bölge Sorumluları</option>
                            <option value="local_boss">🏪 Bayi Patronları</option>
                            <option value="global">🌐 Tüm intra-Mail Kullanıcıları</option>
                        </select>
                    </div>
                    <div class="loopin-select-group">
                        <label>2. Kullanıcı Arayın</label>
                        <input type="text" id="loopinSearchInput" placeholder="Birim seçtikten sonra arama yapın..." disabled>
                    </div>
                    <div class="loopin-results" id="loopinResults" style="max-height: 180px; overflow-y: auto; border: 1px solid var(--border); border-radius: 10px; margin-top: 0.5rem; display:none;">
                    </div>
                </div>
                <div class="loopin-modal-footer">
                    <button class="btn-loopin-cancel" onclick="document.getElementById('loopinModalBackdrop').classList.remove('active')">Vazgeç</button>
                    <button class="btn-loopin-confirm" id="btnLoopinConfirm" disabled>Katılımcı Olarak Ekle</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
    }

    const catSelect = document.getElementById('loopinCategorySelect');
    const searchInp = document.getElementById('loopinSearchInput');
    const resultsDiv = document.getElementById('loopinResults');
    const confirmBtn = document.getElementById('btnLoopinConfirm');
    
    catSelect.value = "";
    searchInp.value = "";
    searchInp.disabled = true;
    resultsDiv.innerHTML = "";
    resultsDiv.style.display = "none";
    confirmBtn.disabled = true;

    let loopinReceivers = [];
    let selectedUser = null;

    catSelect.onchange = async (e) => {
        const cat = e.target.value;
        if (!cat) {
            searchInp.disabled = true;
            searchInp.value = "";
            resultsDiv.style.display = "none";
            return;
        }
        searchInp.disabled = false;
        searchInp.placeholder = "Yükleniyor...";
        loopinReceivers = await loadReceiversByCategory(cat);
        searchInp.placeholder = "İsim veya şirket adı ile arayın...";
    };

    searchInp.oninput = (e) => {
        const val = cleanTextForSearch(e.target.value);
        if (!val) {
            resultsDiv.style.display = "none";
            return;
        }

        const filtered = loopinReceivers.filter(u => {
            const searchStr = cleanTextForSearch(`${u.name} ${u.surname || ''} ${u.company || ''}`);
            return searchStr.includes(val) && !threadData.participants.includes(u.id);
        }).slice(0, 8);

        if (filtered.length === 0) {
            resultsDiv.innerHTML = '<div style="padding:1rem; text-align:center; font-size:0.8rem; color:var(--text-muted);">Eklenebilecek kullanıcı bulunamadı.</div>';
        } else {
            resultsDiv.innerHTML = filtered.map(u => `
                <div class="loopin-result-item" data-uid="${u.id}" data-uname="${u.name} ${u.surname || ''}">
                    <span style="font-weight:600;">${u.name} ${u.surname || ''}</span>
                    <span style="font-size:0.7rem; background:var(--primary-soft); color:var(--primary); padding:2px 6px; border-radius:4px;">${u.company || 'Bellona'}</span>
                </div>
            `).join('');

            resultsDiv.querySelectorAll('.loopin-result-item').forEach(item => {
                item.onclick = () => {
                    resultsDiv.querySelectorAll('.loopin-result-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    selectedUser = {
                        id: item.getAttribute('data-uid'),
                        name: item.getAttribute('data-uname')
                    };
                    confirmBtn.disabled = false;
                };
            });
        }
        resultsDiv.style.display = "block";
    };

    confirmBtn.onclick = async () => {
        if (!selectedUser) return;
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Ekleniyor...';

        try {
            const docRef = doc(db, "messages", threadId);
            const docSnap = await getDoc(docRef);
            const currentData = docSnap.data();

            const pArr = currentData.participants || [];
            if (!pArr.includes(selectedUser.id)) {
                pArr.push(selectedUser.id);
            }

            const replies = currentData.replies || [];
            replies.push({
                authorName: "Sistem",
                isSystem: true,
                timestamp: new Date().toISOString(),
                text: `📢 <strong>${currentUserData.name} ${currentUserData.surname || ''}</strong> bu konuşmaya <strong>${selectedUser.name}</strong> kullanıcısını dahil etti. (Grup Mesajlaşması)`
            });

            await updateDoc(docRef, {
                participants: pArr,
                replies: replies,
                timestamp: serverTimestamp()
            });

            backdrop.classList.remove('active');
            alert(`🎉 ${selectedUser.name} konuşmaya başarıyla dahil edildi! Artık ortak grup olarak yazışabilirsiniz.`);
        } catch (err) {
            console.error("Loop-in error:", err);
            alert("Kullanıcı eklenirken hata oluştu.");
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = "Katılımcı Olarak Ekle";
        }
    };

    backdrop.classList.add('active');
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

    let finalReplyText = replyText;
    const targetSelect = document.getElementById('replyTargetSelect');
    
    try {
        const docRef = doc(db, "messages", activeThreadId);
        const docSnap = await getDoc(docRef);
        const data = docSnap.data();

        if (targetSelect && targetSelect.value) {
            replyObj.directedToId = targetSelect.value;
            const selectedOption = targetSelect.options[targetSelect.selectedIndex];
            replyObj.directedToName = selectedOption.getAttribute('data-name');
            finalReplyText = customizeMessageForRecipient(replyText, replyObj.directedToName);
            replyObj.text = finalReplyText;
        } else {
            const otherParticipants = [];
            if (data.senderId !== currentUserData.id) {
                otherParticipants.push(data.senderName);
            }
            if (data.receiverId !== currentUserData.id) {
                otherParticipants.push(data.receiverName);
            }
            if (data.originalSenderId && data.originalSenderId !== currentUserData.id && data.originalSenderName) {
                otherParticipants.push(data.originalSenderName);
            }
            if (data.replies) {
                data.replies.forEach(rep => {
                    if (rep.authorId && rep.authorId !== currentUserData.id && !otherParticipants.includes(rep.authorName)) {
                        otherParticipants.push(rep.authorName);
                    }
                });
            }
            
            const collectiveNames = otherParticipants.map(name => name.split('(')[0].trim()).join(', ');
            if (collectiveNames) {
                finalReplyText = customizeMessageForRecipient(replyText, collectiveNames);
                replyObj.text = finalReplyText;
            }
        }
        
        const replies = data.replies || [];
        replies.push(replyObj);

        await updateDoc(docRef, {
            replies: replies,
            lastMessage: finalReplyText,
            timestamp: serverTimestamp(),
            isRead: false,
            readAt: null
        });
        
        input.value = '';
    } catch (err) { console.error("Reply error:", err); }
}
