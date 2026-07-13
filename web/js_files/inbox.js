/**
 * @file inbox.js
 * @description Uygulamanın mesajlaşma altyapısını yöneten çekirdek dosyadır.
 * Gelen kutusu, mesaj okuma, mesaj gönderme (yanıtlama/iletme), mesaj filtreleme
 * (spam, arşiv, çöp) ve yapay zeka entegrasyonu fonksiyonlarını içerir.
 */

import { 
    onAuthStateChanged, signOut, reauthenticateWithCredential, EmailAuthProvider, updatePassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, getDocs, writeBatch, arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
  ref, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { auth, db, storage, messaging } from './firebase/config.js';
import { getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { refineMessageWithAI, summarizeThreadWithAI, getReplySuggestionsWithAI, getDetailedReplyDraftsWithAI } from './services/ai-service.js';

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

function toTitleCase(str) {
    if (!str) return "";
    return str.toLowerCase().split(' ').map(word => {
        if (!word) return '';
        const first = word.charAt(0);
        const trUpper = first === 'i' ? 'İ' : (first === 'ı' ? 'I' : first.toLocaleUpperCase('tr-TR'));
        return trUpper + word.slice(1);
    }).join(' ');
}

let currentUserData = null;
let activeThreadId = null;
let activeThreadData = null;
let activeThreadListener = null;
let currentFolder = 'inbox';
let forwardOriginalMessageId = null;
let forwardOriginalSenderId = null;
let forwardOriginalSenderName = null;
let bulkSelectedIds = new Set();
let bulkMode = false;
let currentDraftId = null;
let localDraftInterval = null;
let autosaveTimeout = null;
let selectedReceivers = [];
let renderReceivers;

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
  
  window.usersCache = {};
  try {
      const snap = await getDocs(collection(db, "users"));
      snap.forEach(d => { window.usersCache[d.id] = d.data(); });
  } catch(e) { console.error("Kullanici verileri yuklenemedi", e); }

  updateUI();
  initNavigation();
  initCompose();
  initBulkActions();
  initUnreadCounter(); // Okunmamış sayacını başlat
  initFCM(user.uid);   // Gerçek Zamanlı Bildirimleri (FCM) Başlat
  loadFolder(currentFolder);
  
  // Normalize scheduled messages format for this user
  normalizeScheduledMessages();
});

async function normalizeScheduledMessages() {
    try {
        const q = query(
            collection(db, "messages"),
            where("senderId", "==", currentUserData.id),
            where("status", "==", "active")
        );
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        let hasUpdates = false;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // If it is scheduled and in the wrong format (local format doesn't end with Z)
            if (data.scheduledFor && typeof data.scheduledFor === 'string' && !data.scheduledFor.endsWith('Z')) {
                const localDate = new Date(data.scheduledFor);
                if (!isNaN(localDate.getTime())) {
                    const isoString = localDate.toISOString();
                    batch.update(docSnap.ref, { scheduledFor: isoString });
                    hasUpdates = true;
                }
            }
        });

        if (hasUpdates) {
            await batch.commit();
            console.log("Normalized scheduled messages to ISO format successfully.");
            loadFolder(currentFolder);
        }
    } catch (err) {
        console.error("Error normalizing scheduled messages:", err);
    }
}

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
        where("participants", "array-contains", currentUserData.id)
    );

    onSnapshot(q, (snapshot) => {
        const nowStr = new Date().toISOString();
        let count = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Apply identical inbox filters as in loadFolder
            if ((data.trashedBy || []).includes(currentUserData.id)) return;
            if ((data.archivedBy || []).includes(currentUserData.id)) return;
            if (data.isDraft === true) return;
            if (data.status === 'trash' || data.status === 'archive' || data.status === 'spam') return;

            if (data.scheduledFor && data.scheduledFor > nowStr) return;

            if (data.senderId === currentUserData.id) {
                if (!data.replies || data.replies.length === 0) return;
            }

            // Only count if the last message in the thread is unread and not sent by current user
            let lastAuthorId = data.senderId;
            if (data.replies && data.replies.length > 0) {
                lastAuthorId = data.replies[data.replies.length - 1].authorId;
            }

            if (lastAuthorId !== currentUserData.id && data.isRead === false) {
                count++;
            }
        });
        const badge = document.getElementById('unreadCount');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    });
}

function updateUI() {
    let roleLabel = currentUserData.subRole === 'manager' ? 'Yönetici / Patron' : 'Mağaza Personeli';
    if (currentUserData.category === 'regional') {
        const regionStr = currentUserData.region ? `${currentUserData.region} ` : '';
        roleLabel = `${regionStr}Bölge Sorumlusu`;
    }
    if (currentUserData.category === 'factory') roleLabel = 'Fabrika Yetkilisi';
    if (currentUserData.category === 'admin' || currentUserData.role === 'admin' || currentUserData.subRole === 'admin') {
        roleLabel = 'Sistem Yöneticisi';
    }
    
    if (currentUserData.dealerCode) {
        if (currentUserData.category === 'admin' || currentUserData.role === 'admin' || currentUserData.subRole === 'admin') {
            roleLabel += ` (Kodu: ${currentUserData.dealerCode})`;
        } else if (currentUserData.category === 'factory') {
            roleLabel += ` (Çalışan Kodu: ${currentUserData.dealerCode})`;
        } else {
            roleLabel += ` (Bayi Kodu: ${currentUserData.dealerCode})`;
        }
    }

    const elements = {
        'userName': `${currentUserData.name} ${currentUserData.surname || ''}`,
        'userCompany': currentUserData.company || 'Bellona Kurumsal',
        'userRole': roleLabel
    };

    Object.entries(elements).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    });

    const avatarTextEl = document.getElementById('userAvatarText');
    const avatarImgEl = document.getElementById('userAvatarImg');
    
    if (currentUserData.profileImageUrl) {
        if (avatarTextEl) avatarTextEl.style.display = 'none';
        if (avatarImgEl) {
            avatarImgEl.src = currentUserData.profileImageUrl;
            avatarImgEl.style.display = 'block';
        }
    } else {
        if (avatarImgEl) avatarImgEl.style.display = 'none';
        if (avatarTextEl) {
            avatarTextEl.textContent = currentUserData.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
            avatarTextEl.style.display = 'inline';
        }
    }
}

// =====================
// PROFILE IMAGE UPLOAD
// =====================
const profileImgInput = document.getElementById('profileImageInput');
const userAvatarWrapper = document.getElementById('userAvatar');

if (userAvatarWrapper && profileImgInput) {
    userAvatarWrapper.addEventListener('click', () => profileImgInput.click());
    
    profileImgInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            // Temporary loading state
            const avatarTextEl = document.getElementById('userAvatarText');
            if (avatarTextEl) {
                avatarTextEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                avatarTextEl.style.display = 'inline';
            }
            const avatarImgEl = document.getElementById('userAvatarImg');
            if (avatarImgEl) avatarImgEl.style.display = 'none';

            // CORS hatasını kalıcı çözmek için Storage yerine resmi küçültüp Base64 yapıyoruz
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = async function() {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 150;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width *= MAX_SIZE / height;
                            height = MAX_SIZE;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const base64Url = canvas.toDataURL('image/jpeg', 0.8); // 80% quality

                    // Update firestore directly with Base64
                    const userDocRef = doc(db, "users", currentUserData.id);
                    await updateDoc(userDocRef, { profileImageUrl: base64Url });

                    currentUserData.profileImageUrl = base64Url;
                    updateUI();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);

        } catch (err) {
            console.error("Profile image upload error:", err);
            alert("Profil resmi yüklenirken bir hata oluştu.");
            updateUI(); // revert to previous state
        }
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
                const snap = await getDoc(docRef);
                if (!snap.exists()) return;
                const data = snap.data();
                const archivedBy = data.archivedBy || [];
                const uid = currentUserData.id;

                if (currentFolder === 'archive') {
                    // Arşivden çıkar
                    await updateDoc(docRef, {
                        archivedBy: archivedBy.filter(id => id !== uid)
                    });
                    alert("Mesaj Gelen Kutusuna geri taşındı!");
                } else {
                    // Arşive taşı
                    if (!archivedBy.includes(uid)) {
                        archivedBy.push(uid);
                    }
                    await updateDoc(docRef, { archivedBy });
                    alert("Mesaj başarıyla arşive taşındı!");
                }
                
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
            const snap = await getDoc(docRef);
            if (!snap.exists()) return;
            const data = snap.data();
            const trashedBy = data.trashedBy || [];
            const uid = currentUserData.id;

            if (currentFolder === 'trash') {
                // Çöpten geri yükle
                try {
                    await updateDoc(docRef, { 
                        trashedBy: trashedBy.filter(id => id !== uid)
                    });
                    alert("Mesaj Gelen Kutusuna geri yüklendi!");
                    resetDetailView();
                    loadFolder(currentFolder);
                } catch (err) {
                    console.error("Restore error:", err);
                    alert("Mesaj geri yüklenirken bir hata oluştu.");
                }
            } else {
                // Çöpe taşı
                if (confirm("Bu mesajı silmek (çöp kutusuna taşımak) istediğinize emin misiniz?")) {
                    try {
                        if (!trashedBy.includes(uid)) {
                            trashedBy.push(uid);
                        }
                        await updateDoc(docRef, { 
                            trashedBy,
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

    const permDeleteBtn = document.getElementById('btnPermanentDelete');
    if (permDeleteBtn) {
        permDeleteBtn.addEventListener('click', async () => {
            if (!activeThreadId) {
                alert("Lütfen önce işlem yapılacak bir mesaj seçin.");
                return;
            }
            if (confirm("Bu mesajı KALICI olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!")) {
                try {
                    const docRef = doc(db, "messages", activeThreadId);
                    const snap = await getDoc(docRef);
                    if (!snap.exists()) return;
                    const data = snap.data();
                    const uid = currentUserData.id;
                    
                    // Katılımcılardan kendini çıkar
                    const newParticipants = (data.participants || []).filter(id => id !== uid);
                    
                    if (newParticipants.length === 0) {
                        // Hiç katılımcı kalmadı, tamamen sil
                        await deleteDoc(docRef);
                    } else {
                        // Sadece kendini çıkar
                        await updateDoc(docRef, { 
                            participants: newParticipants,
                            trashedBy: (data.trashedBy || []).filter(id => id !== uid)
                        });
                    }
                    alert("Mesaj kalıcı olarak silindi!");
                    resetDetailView();
                    loadFolder(currentFolder);
                } catch (err) {
                    console.error("Permanent delete error:", err);
                    alert("Mesaj silinirken hata oluştu.");
                }
            }
        });
    }

    const importantBtn = document.getElementById('btnImportant');
    if (importantBtn) {
        importantBtn.addEventListener('click', async () => {
            if (!activeThreadId || !activeThreadData) return;
            try {
                const currentArr = activeThreadData.importantBy || [];
                const isImportant = currentArr.includes(currentUserData.id);
                let newArr = [...currentArr];
                if (isImportant) {
                    newArr = newArr.filter(id => id !== currentUserData.id);
                } else {
                    newArr.push(currentUserData.id);
                }
                // Mobil ile tam senkron: importantBy (web) + starredBy (mobil uyumu) her ikisi de güncellenir
                const currentStarredArr = activeThreadData.starredBy || [];
                let newStarredArr = [...currentStarredArr];
                if (isImportant) {
                    newStarredArr = newStarredArr.filter(id => id !== currentUserData.id);
                } else {
                    if (!newStarredArr.includes(currentUserData.id)) newStarredArr.push(currentUserData.id);
                }
                await updateDoc(doc(db, "messages", activeThreadId), { importantBy: newArr, starredBy: newStarredArr });
                
                activeThreadData.importantBy = newArr;
                activeThreadData.starredBy = newStarredArr;
                if (!isImportant) {
                    importantBtn.style.color = '#eab308';
                    importantBtn.innerHTML = '<i class="fa-solid fa-star"></i>';
                } else {
                    importantBtn.style.color = 'var(--text-muted)';
                    importantBtn.innerHTML = '<i class="fa-regular fa-star"></i>';
                }
            } catch (err) {
                console.error("Important toggle error:", err);
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

    const oldSwitcher = document.getElementById('bulkRecipientSwitcher');
    if (oldSwitcher) oldSwitcher.remove();

    const oldNotice = document.getElementById('scheduledNoticeBox');
    if (oldNotice) oldNotice.remove();

    const oldSuggestions = document.getElementById('replySuggestionsContainer');
    if (oldSuggestions) oldSuggestions.remove();

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
        // Tüm mesajları participants bazında çek, client-side filtrele
        q = query(baseRef, where("participants", "array-contains", currentUserData.id));

        onSnapshot(q, (snapshot) => {
            let filteredDocs = [...snapshot.docs];
            const uid = currentUserData.id;

            // Per-user folder filtering
            if (folder === 'trash') {
                // Sadece bu kullanıcı tarafından çöpe atılmış mesajlar
                filteredDocs = filteredDocs.filter(doc => {
                    const m = doc.data();
                    return (m.trashedBy || []).includes(uid);
                });
            } else if (folder === 'archive') {
                // Sadece bu kullanıcı tarafından arşivlenmiş mesajlar
                filteredDocs = filteredDocs.filter(doc => {
                    const m = doc.data();
                    return (m.archivedBy || []).includes(uid) && !(m.trashedBy || []).includes(uid);
                });
            } else if (folder === 'spam') {
                filteredDocs = filteredDocs.filter(doc => doc.data().status === 'spam');
            } else if (folder === 'drafts') {
                filteredDocs = filteredDocs.filter(doc => {
                    const m = doc.data();
                    return m.isDraft === true && m.senderId === uid && !(m.trashedBy || []).includes(uid);
                });
            } else {
                // Inbox, sent, scheduled, important vb. → aktif mesajlar (çöpte/arşivde olmayanlar)
                filteredDocs = filteredDocs.filter(doc => {
                    const m = doc.data();
                    if ((m.trashedBy || []).includes(uid)) return false;
                    if ((m.archivedBy || []).includes(uid)) return false;
                    if (m.isDraft === true) return false; // TASLAKLAR BURADA GIZLENIR
                    if (m.status === 'trash' || m.status === 'archive' || m.status === 'spam') return false;
                    return true;
                });
            }

            if (folder === 'inbox') {
                filteredDocs = filteredDocs.filter(doc => {
                    const m = doc.data();
                    if (m.scheduledFor && m.scheduledFor > new Date().toISOString()) {
                        return false;
                    }
                    if (m.senderId === currentUserData.id) {
                        return m.replies && m.replies.length > 0;
                    }
                    return true;
                });
            } else if (folder === 'sent') {
                filteredDocs = filteredDocs.filter(doc => {
                    const m = doc.data();
                    if (m.scheduledFor && m.scheduledFor > new Date().toISOString()) {
                        return false;
                    }
                    const isOriginalSender = m.senderId === currentUserData.id;
                    const hasMyReply = m.replies && m.replies.some(r => r.authorId === currentUserData.id);
                    return isOriginalSender || hasMyReply;
                });
            } else if (folder === 'scheduled') {
                filteredDocs = filteredDocs.filter(doc => {
                    const m = doc.data();
                    return m.senderId === currentUserData.id && m.scheduledFor && m.scheduledFor > new Date().toISOString();
                });
            } else if (folder === 'important') {
                filteredDocs = filteredDocs.filter(doc => {
                    const m = doc.data();
                    return (m.importantBy && m.importantBy.includes(currentUserData.id)) ||
                        (m.starredBy && m.starredBy.includes(currentUserData.id));
                });
            }

            if (filteredDocs.length === 0) {
                const emptyMessages = {
                    'inbox': 'Henüz bir mesaj almadınız.',
                    'sent': 'Henüz bir mesaj göndermediniz.',
                    'drafts': 'Taslağınız bulunmuyor.',
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
                const urgentA = a.data().isUrgent ? 1 : 0;
                const urgentB = b.data().isUrgent ? 1 : 0;
                if (urgentA !== urgentB) return urgentB - urgentA;
                
                const timeA = a.data().timestamp?.toMillis() || 0;
                const timeB = b.data().timestamp?.toMillis() || 0;
                return timeB - timeA;
            });

            const bulkGroups = {};
            const finalRenderList = [];

            sortedDocs.forEach(doc => {
                const m = doc.data();
                m._originalDocId = doc.id;

                // Sadece isBulk:true olarak gönderilmiş gerçek toplu mesajları grupla
                // Tek kişiye giden mesajlar asla "Toplu Gönderim" olarak görünmez
                if (folder === 'sent' && !m.threadId && m.isBulk === true && m.participants && m.participants.length === 2) {
                    const minuteKey = m.timestamp ? Math.floor(m.timestamp.seconds / 60) : 0;
                    const groupKey = `${m.senderId}_${m.subject}_${minuteKey}`;
                    if (!bulkGroups[groupKey]) {
                        bulkGroups[groupKey] = [];
                    }
                    bulkGroups[groupKey].push(m);
                } else {
                    finalRenderList.push(m);
                }
            });

            if (folder === 'sent') {
                Object.values(bulkGroups).forEach(group => {
                    if (group.length > 1) {
                        const baseMsg = { ...group[0] };
                        baseMsg._groupCount = group.length;
                        baseMsg._groupedRecipients = group.map(g => ({ id: g.receiverId, name: g.receiverName || 'Bilinmiyor' }));
                        baseMsg._allGroupIds = group.map(g => g._originalDocId).join(',');
                        finalRenderList.push(baseMsg);
                    } else if (group.length === 1) {
                        finalRenderList.push(group[0]);
                    }
                });

                finalRenderList.sort((a, b) => {
                    const urgentA = a.isUrgent ? 1 : 0;
                    const urgentB = b.isUrgent ? 1 : 0;
                    if (urgentA !== urgentB) return urgentB - urgentA;
                    
                    const timeA = a.timestamp?.toMillis() || 0;
                    const timeB = b.timestamp?.toMillis() || 0;
                    return timeB - timeA;
                });
            }

            listContainer.innerHTML = finalRenderList.map(m => {
                const docId = m._originalDocId;
                const isActive = docId === activeThreadId ? 'active' : '';
                
                // Tarih formatlama
                const dateObj = m.timestamp?.toDate();
                let timeStr = "--:--";
                if (dateObj) {
                    const today = new Date();
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    const timePart = dateObj.toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'});
                    if (dateObj.toDateString() === today.toDateString()) {
                        timeStr = `Bugün ${timePart}`;
                    } else if (dateObj.toDateString() === yesterday.toDateString()) {
                        timeStr = `Dün ${timePart}`;
                    } else {
                        const datePart = dateObj.toLocaleDateString('tr-TR', {day:'2-digit', month:'short'});
                        timeStr = `${datePart} ${timePart}`;
                    }
                }
                
                const isSentByMe = m.senderId === currentUserData.id;
                let onclickAction = "";
                let senderDisplay = "";
                
                // Draft title logic
                if (m.isDraft) {
                    senderDisplay = '<i class="fa-solid fa-file-signature" style="color:var(--text-muted);"></i> <span style="color:var(--text-muted); font-style:italic;">Taslak</span>';
                } else if (folder === 'sent' || isSentByMe) {
                    senderDisplay = '<i class="fa-solid fa-share" style="font-size:0.7rem; color:var(--primary)"></i> Kime: ' + (m._groupCount > 1 ? `Toplu Gönderim (${m._groupCount} Kişi)` : toTitleCase(m.receiverName));
                } else {
                    senderDisplay = toTitleCase(m.senderName);
                }
                
                // Read Receipt status check
                let receiptHtml = '';
                if (isSentByMe && !m.isDraft) {
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

                const isImportant = (m.importantBy && m.importantBy.includes(currentUserData.id)) ||
                    (m.starredBy && m.starredBy.includes(currentUserData.id));
                const importantHtml = isImportant ? `<i class="fa-solid fa-star" style="color:#eab308; margin-right:4px;" title="Yıldızlı Mesaj"></i>` : '';

                const urgentHtml = m.isUrgent ? `<span class="thread-count-badge" style="background:var(--danger); color:white; font-size:0.65rem; font-weight:700; padding:0.125rem 0.4rem; border-radius:12px; display:inline-flex; align-items:center; gap:0.25rem; border:none;" title="Acil"><i class="fa-solid fa-bolt"></i> Acil</span>` : '';

                const replyCount = m.replies ? m.replies.length : 0;
                const totalMessages = 1 + replyCount;
                const badgeHtml = replyCount > 0 
                    ? `<span class="thread-count-badge" style="background:var(--primary-soft); color:var(--primary); font-size:0.7rem; font-weight:700; padding:0.125rem 0.4rem; border-radius:12px; border:1px solid rgba(10, 46, 46, 0.1); display:inline-flex; align-items:center; gap:0.25rem;" title="${totalMessages} Mesaj"><i class="fa-solid fa-comments" style="font-size:0.6rem;"></i> ${totalMessages}</span>`
                    : '';

                const allIdsString = m._allGroupIds || docId;
                onclickAction = m.isDraft ? `window.__openDraft('${docId}')` : `window.selectThread('${docId}', '${allIdsString}')`;

                const isScheduled = m.scheduledFor && m.scheduledFor > new Date().toISOString();
                const scheduledBadgeHtml = isScheduled 
                    ? `<span class="thread-count-badge" style="background:#fef3c7; color:#d97706; font-size:0.65rem; font-weight:700; padding:0.125rem 0.4rem; border-radius:12px; display:inline-flex; align-items:center; gap:0.25rem; border:1px solid #f59e0b;" title="Gönderim Zamanlandı"><i class="fa-solid fa-clock"></i> Zamanlandı</span>` 
                    : '';

                let subMessagesHtml = '';
                
                // Parent checkbox visual state
                let parentChecked = '';
                const allIdsArray = allIdsString.split(',');
                const selectedCount = allIdsArray.filter(id => bulkSelectedIds.has(id)).length;
                if (selectedCount === allIdsArray.length && allIdsArray.length > 0) {
                    parentChecked = 'checked';
                }

                if (m._groupCount > 1 && m._groupedRecipients) {
                    const groupOnclick = `window.__toggleGroupAccordion(event, '${docId}')`;
                    
                    subMessagesHtml = `
                        <div class="group-accordion hidden" id="accordion_${docId}" style="margin-top: 0.5rem; padding-left: 1.5rem; border-left: 2px solid var(--border); padding-top:0.5rem; display:none;">
                            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.4rem; font-weight:600;"><i class="fa-solid fa-users"></i> Alıcı Listesi</div>
                            ${m._groupedRecipients.map((rec, idx) => {
                                const individualDocId = allIdsArray[idx] || docId;
                                const isSubChecked = bulkSelectedIds.has(individualDocId) ? 'checked' : '';
                                return `
                                    <div class="sub-msg-item" style="padding: 0.4rem 0.6rem; margin-bottom: 0.2rem; background: rgba(0,0,0,0.02); border-radius:6px; cursor:pointer; font-size:0.8rem; display:flex; align-items:center; gap:0.5rem; border:1px solid transparent; transition:all 0.2s;" onclick="selectThread('${individualDocId}'); event.stopPropagation();" onmouseover="this.style.background='rgba(0,0,0,0.04)'; this.style.borderColor='var(--border)';" onmouseout="this.style.background='rgba(0,0,0,0.02)'; this.style.borderColor='transparent';">
                                        <label class="bulk-checkbox-wrap" onclick="event.stopPropagation()" style="padding:0; margin-right:4px;">
                                            <input type="checkbox" class="bulk-checkbox sub-bulk-checkbox" data-id="${individualDocId}" data-parent-id="${docId}" ${isSubChecked} onchange="window.__toggleSubBulkItem(this)" />
                                        </label>
                                        <i class="fa-solid fa-reply" style="color:var(--primary); font-size:0.6rem; transform:rotate(180deg);"></i>
                                        <span>${rec.name}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                }

                return `
                    <div class="msg-item ${isActive}" data-msg-id="${docId}">
                        <div style="display:flex; align-items:flex-start; gap:0.5rem;">
                            <label class="bulk-checkbox-wrap" onclick="event.stopPropagation()">
                                <input type="checkbox" class="bulk-checkbox parent-bulk-checkbox" data-id="${docId}" data-all-ids="${allIdsString}" ${parentChecked} onchange="window.__toggleBulkItem(this)" />
                            </label>
                            <div style="flex:1; min-width:0; cursor:pointer;" onclick="${onclickAction}">
                                <div class="msg-header">
                                    <span class="msg-sender" ${
                                        (function(){
                                            if (m.senderId && window.usersCache && window.usersCache[m.senderId]) {
                                                const su = window.usersCache[m.senderId];
                                                const suRole = su.category === 'admin' ? 'Sistem Yöneticisi' : (su.category === 'factory' ? 'Fabrika Yetkilisi' : (su.category === 'regional' ? 'Bölge Sorumlusu' : (su.subRole === 'manager' ? 'Yönetici' : 'Personel')));
                                                const regionStr = su.region ? `\nBölge: ${su.region}` : '';
                                                return `title="Gönderen: ${su.name} ${su.surname || ''}\nŞirket: ${su.company || '-'}\nRol: ${suRole}${regionStr}"`;
                                            }
                                            return `title="Gönderen: ${m.senderName}"`;
                                        })()
                                    }>${senderDisplay}</span>
                                    <div class="msg-meta-wrapper" style="position:relative; display:flex; align-items:center;">
                                        <div class="msg-meta-side" style="display:flex; align-items:center; gap:0.5rem; transition: opacity 0.2s;">
                                            ${urgentHtml}
                                            ${importantHtml}
                                            ${scheduledBadgeHtml}
                                            ${badgeHtml}
                                            <span class="msg-time">${timeStr}${receiptHtml}</span>
                                        </div>
                                        <div class="msg-quick-actions" style="position:absolute; right:0; background:var(--surface); display:none; align-items:center; gap:0.4rem; padding-left:0.5rem;">
                                            <button type="button" class="quick-btn" onclick="window.__quickArchive('${docId}', '${allIdsString}', event)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding:0.3rem 0.4rem; border-radius:6px; font-size:0.9rem; transition:all 0.2s;" title="Arşivle" onmouseover="this.style.color='var(--primary)'; this.style.background='rgba(13, 148, 136, 0.1)';" onmouseout="this.style.color='var(--text-muted)'; this.style.background='transparent';"><i class="fa-solid fa-box-archive"></i></button>
                                            <button type="button" class="quick-btn" onclick="window.__quickTrash('${docId}', '${allIdsString}', event)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding:0.3rem 0.4rem; border-radius:6px; font-size:0.9rem; transition:all 0.2s;" title="Sil" onmouseover="this.style.color='var(--danger)'; this.style.background='rgba(239, 68, 68, 0.1)';" onmouseout="this.style.color='var(--text-muted)'; this.style.background='transparent';"><i class="fa-solid fa-trash-can"></i></button>
                                        </div>
                                    </div>
                                </div>
                                <div class="msg-subj">${m.subject || 'Konu Yok'}</div>
                                <p class="msg-preview">${(m.lastMessage || m.content || '').substring(0, 45).replace(/<[^>]*>?/gm, '')}...</p>
                                ${subMessagesHtml}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            updateBulkToolbar();
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

window.selectThread = async (id, allGroupIdsStr = null) => {
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
        
    const btnEditScheduled = document.getElementById('btnEditScheduled');
    if (btnEditScheduled && currentFolder === 'scheduled') {
        btnEditScheduled.classList.remove('hidden');
        btnEditScheduled.onclick = () => openEditScheduledModal(id, data);
    } else if (btnEditScheduled) {
        btnEditScheduled.classList.add('hidden');
    }

        let lastAuthorId = data.senderId;
        if (data.replies && data.replies.length > 0) {
            // Check the author of the very last message in the thread
            lastAuthorId = data.replies[data.replies.length - 1].authorId;
        }

        // Only mark as read if the current user is NOT the person who sent the last message
        let needsUpdate = false;
        let updateFields = {};

        if (lastAuthorId !== currentUserData.id && !data.isRead) {
            updateFields.isRead = true;
            updateFields.readAt = serverTimestamp();
            needsUpdate = true;
        }

        // Also check individual replies and mark any unread replies sent by others as read
        if (data.replies && data.replies.length > 0) {
            let repliesModified = false;
            const updatedReplies = data.replies.map(rep => {
                if (rep.authorId && rep.authorId !== currentUserData.id && !rep.isRead) {
                    repliesModified = true;
                    return {
                        ...rep,
                        isRead: true,
                        readAt: new Date().toISOString()
                    };
                }
                return rep;
            });
            if (repliesModified) {
                updateFields.replies = updatedReplies;
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            try {
                await updateDoc(docRef, updateFields);
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

        // Add "Kişi Ekle" Button Dynamically
        const addPersonBtnGroup = document.querySelector('.action-row .btn-group');
        if (addPersonBtnGroup) {
            let addPersonBtn = document.getElementById('btnAddPerson');
            if (!addPersonBtn) {
                addPersonBtn = document.createElement('button');
                addPersonBtn.id = 'btnAddPerson';
                addPersonBtn.className = 'btn-action';
                addPersonBtn.title = 'Kişi Ekle';
                addPersonBtn.style.color = 'var(--primary)';
                addPersonBtn.style.borderColor = 'var(--primary)';
                addPersonBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Ekle';
                const btnArchive = document.getElementById('btnArchive');
                if (btnArchive) addPersonBtnGroup.insertBefore(addPersonBtn, btnArchive);
                else addPersonBtnGroup.appendChild(addPersonBtn);
            }
            addPersonBtn.onclick = () => openLoopInModal(id, data);
        }

        const dateObj = data.timestamp?.toDate();
        const fullDate = dateObj ? dateObj.toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';

        let receiverDisplay = `Alıcı: <strong>${data.receiverName || 'Bilinmiyor'}</strong>`;
        if (data._groupCount > 1 && data._groupedRecipients) {
            receiverDisplay = `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">` + data._groupedRecipients.map(r => `
                <div class="modern-chip" data-name="${r.name}" data-id="${r.id}" style="cursor:pointer;" onmouseenter="showCustomTooltip(event)" onmousemove="positionCustomTooltip(event)" onmouseleave="hideCustomTooltip()">
                    <i class="fa-solid fa-user"></i>
                    <span>${r.name}</span>
                </div>
            `).join('') + `</div>`;
        }

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

        let urgentBadgeHtml = '';
        if (data.isUrgent) {
            if (data.senderId === currentUserData.id || data.originalSenderId === currentUserData.id) {
                urgentBadgeHtml = `<span onclick="window.__removeUrgency('${id}', event)" class="thread-count-badge" style="background:var(--danger); color:white; font-size:0.75rem; font-weight:700; padding:0.15rem 0.5rem; border-radius:12px; margin-right:0.5rem; display:inline-flex; align-items:center; gap:0.25rem; border:none; cursor:pointer; transition: 0.2s opacity;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'" title="İşlem tamamlandı: Aciliyeti Kaldır"><i class="fa-solid fa-bolt"></i> Acil <i class="fa-solid fa-times" style="margin-left:4px; font-size:0.8em; opacity:0.9;"></i></span>`;
            } else {
                urgentBadgeHtml = `<span class="thread-count-badge" style="background:var(--danger); color:white; font-size:0.75rem; font-weight:700; padding:0.15rem 0.5rem; border-radius:12px; margin-right:0.5rem; display:inline-flex; align-items:center; gap:0.25rem; border:none;" title="Acil"><i class="fa-solid fa-bolt"></i> Acil</span>`;
            }
        }

        const map = {
            'detailSubject': urgentBadgeHtml + data.subject,
            'detailSenderName': data.senderName,
            'detailSenderEmail': receiverDisplay,
            'detailDate': fullDate + detailReceiptHtml,
            'detailBody': data.content
        };

        Object.entries(map).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = val || '';
        });

        // Set the detail avatar
        const detailAvatarEl = document.getElementById('detailAvatar');
        if (detailAvatarEl) {
            detailAvatarEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:0.8rem; color:white;"></i>';
            detailAvatarEl.style.backgroundImage = 'none';
            detailAvatarEl.style.backgroundSize = 'cover';
            detailAvatarEl.style.backgroundPosition = 'center';
            detailAvatarEl.style.backgroundColor = 'var(--primary)';
            
            getDoc(doc(db, "users", data.senderId)).then(userDoc => {
                if (userDoc.exists() && userDoc.data().profileImageUrl) {
                    detailAvatarEl.innerHTML = '';
                    detailAvatarEl.style.backgroundImage = `url(${userDoc.data().profileImageUrl})`;
                } else {
                    detailAvatarEl.textContent = data.senderName.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
                }
            }).catch(() => {
                detailAvatarEl.textContent = data.senderName.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
            });
        }

        // Yıldız butonunu başlangıç durumunda güncelle (hem importantBy hem starredBy kontrol edilir)
        const _importantBtn = document.getElementById('btnImportant');
        if (_importantBtn && currentUserData) {
            const _isStarred = ((data.importantBy || []).includes(currentUserData.id)) ||
                               ((data.starredBy || []).includes(currentUserData.id));
            if (_isStarred) {
                _importantBtn.style.color = '#eab308';
                _importantBtn.innerHTML = '<i class="fa-solid fa-star"></i>';
                _importantBtn.title = 'Yıldızı Kaldır';
            } else {
                _importantBtn.style.color = 'var(--text-muted)';
                _importantBtn.innerHTML = '<i class="fa-regular fa-star"></i>';
                _importantBtn.title = 'Yıldızla / Önemli İşaretle';
            }
        }

        // Build Scheduled Notice Banner if this is a future scheduled message
        const isScheduledInFuture = data.scheduledFor && data.scheduledFor > new Date().toISOString();
        let scheduledNoticeHtml = '';
        if (isScheduledInFuture) {
            const schDateObj = new Date(data.scheduledFor);
            const schDateStr = schDateObj.toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            scheduledNoticeHtml = `
                <div style="background: linear-gradient(135deg, #fef3c7, #fffbeb); border: 1.2px solid #f59e0b; color: #b45309; padding: 0.85rem 1.1rem; border-radius: 12px; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.6rem; font-size: 0.85rem; font-weight: 600; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
                    <i class="fa-solid fa-clock-rotate-left" style="font-size: 1.15rem; color: #d97706;"></i>
                    <div>
                        <strong>Bu mesaj henüz iletilmedi.</strong> Belirlenen tarihte alıcıya otomatik olarak ulaştırılacaktır: <span style="text-decoration: underline;">${schDateStr}</span>
                    </div>
                </div>
            `;
        }

        // Remove existing scheduled notice first
        const oldNotice = document.getElementById('scheduledNoticeBox');
        if (oldNotice) oldNotice.remove();

        if (scheduledNoticeHtml) {
            const noticeDiv = document.createElement('div');
            noticeDiv.id = 'scheduledNoticeBox';
            noticeDiv.innerHTML = scheduledNoticeHtml;
            const repliesBody = document.getElementById('detailBody');
            if (repliesBody) {
                repliesBody.parentNode.insertBefore(noticeDiv, repliesBody);
            }
        }

        // Build Group Switcher if this is a bulk message
        let groupChipsHtml = '';
        if (allGroupIdsStr && allGroupIdsStr.includes(',')) {
            try {
                const ids = allGroupIdsStr.split(',');
                const docsData = await Promise.all(ids.map(async (gid) => {
                    const snap = await getDoc(doc(db, "messages", gid));
                    return snap.exists() ? { id: gid, name: snap.data().receiverName } : null;
                }));
                
                const validDocs = docsData.filter(d => d !== null);
                
                const chips = validDocs.map(d => {
                    const isActive = d.id === id;
                    const activeStyle = isActive 
                        ? 'background: rgba(13, 148, 136, 0.15); color: var(--primary); border-color: var(--primary); box-shadow: 0 2px 4px rgba(13,148,136,0.1);' 
                        : 'background: white; color: var(--text-main); border-color: var(--border);';
                    return `
                        <button onclick="window.selectThread('${d.id}', '${allGroupIdsStr}')" style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.9rem; border-radius: 10px; border: 1.2px solid ${isActive ? 'var(--primary)' : 'var(--border)'}; font-family: inherit; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s; ${activeStyle}" onmouseover="this.style.opacity='0.85'; this.style.transform='translateY(-1px)';" onmouseout="this.style.opacity='1'; this.style.transform='none';">
                            <i class="fa-solid fa-user${isActive ? '-check' : ''}" style="${isActive ? 'color: var(--primary);' : 'color: var(--text-muted);'}"></i>
                            <span>${d.name}</span>
                        </button>
                    `;
                }).join('');
                
                groupChipsHtml = `
                    <div class="bulk-recipient-switcher" style="background: linear-gradient(135deg, rgba(13,148,136,0.03), rgba(13,148,136,0.05)); border: 1.2px solid rgba(13, 148, 136, 0.15); border-radius: 14px; padding: 0.85rem 1.1rem; margin-bottom: 1.25rem; display: flex; flex-direction: column; gap: 0.6rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 0.45rem;">
                            <i class="fa-solid fa-people-arrows" style="font-size:0.95rem;"></i>
                            <span>Toplu Gönderim Görüşmeleri (Alıcının adına tıklayarak kişisel sohbeti görüntüleyin):</span>
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.6rem;">
                            ${chips}
                        </div>
                    </div>
                `;
            } catch (err) {
                console.error("Error loading switcher chips:", err);
            }
        }

        // Remove existing switcher first
        const oldSwitcher = document.getElementById('bulkRecipientSwitcher');
        if (oldSwitcher) oldSwitcher.remove();

        if (groupChipsHtml) {
            const switcherDiv = document.createElement('div');
            switcherDiv.id = 'bulkRecipientSwitcher';
            switcherDiv.innerHTML = groupChipsHtml;
            const repliesBody = document.getElementById('detailBody');
            if (repliesBody) {
                repliesBody.parentNode.insertBefore(switcherDiv, repliesBody);
            }
        }

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
                    
                    let replyReceiptHtml = '';
                    if (r.authorId === currentUserData.id) {
                        if (r.isRead) {
                            const rReadDate = r.readAt ? new Date(r.readAt).toLocaleString('tr-TR') : '--';
                            replyReceiptHtml = `<span style="margin-right: 6px; display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.72rem; color: #00a4ad; font-weight: 600;" title="Okunma Zamanı: ${rReadDate}"><i class="fas fa-check-double" style="color: #00a4ad;"></i> Okundu (${rReadDate})</span>`;
                        } else {
                            replyReceiptHtml = `<span style="margin-right: 6px; display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.72rem; color: var(--text-muted); opacity: 0.8;" title="İletildi (Okunmadı)"><i class="fas fa-check"></i> İletildi</span>`;
                        }
                    }

                    let replyAttachmentHtml = '';
                    if (r.attachmentUrl) {
                        replyAttachmentHtml = `
                            <div style="margin-top:0.5rem;">
                                <a href="${r.attachmentUrl}" download="${r.attachmentName || 'Ekli_Dosya'}" target="_blank" style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.4rem 0.8rem; background:rgba(20, 184, 166, 0.1); color:#14B8A6; border-radius:8px; text-decoration:none; font-size:0.8rem; font-weight:600;">
                                    <i class="fa-solid fa-paperclip"></i> ${r.attachmentName || 'Ekli Dosya'}
                                </a>
                            </div>
                        `;
                    }
                    
                    repliesHtml += `
                        <div class="${itemClass}">
                            <div class="reply-header" style="display:flex; align-items:center; width:100%; gap:0.5rem;">
                                <span class="reply-author" style="display:flex; align-items:center; gap:0.5rem; flex-shrink:0;">
                                    <i class="fa-solid fa-user-pen" style="color:var(--primary); font-size:0.85rem;"></i> 
                                    <strong>${r.authorName}</strong>
                                </span>
                                ${targetBadge}
                                <span class="reply-date" style="font-size:0.75rem; color:var(--text-muted); font-weight:500; margin-left:auto; flex-shrink:0; display:inline-flex; align-items:center; gap:0.25rem;">
                                    ${replyReceiptHtml}
                                    <span>${rDate}</span>
                                </span>
                            </div>
                            <div class="reply-text" style="margin-top:0.75rem;">${r.text}</div>
                            ${replyAttachmentHtml}
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
                            <a href="${data.attachmentUrl}" download="${data.attachmentName || 'Ekli_Dosya'}" target="_blank" class="btn-download">
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
            const addParticipant = (id, name) => {
                if (id && id !== currentUserData.id && id !== "SYSTEM" && !otherParticipants.find(p => p.id === id)) {
                    otherParticipants.push({ id, name });
                }
            };

            addParticipant(data.senderId, data.senderName);
            addParticipant(data.receiverId, data.receiverName);
            addParticipant(data.originalSenderId, data.originalSenderName);
            
            if (data._groupedRecipients) {
                data._groupedRecipients.forEach(r => addParticipant(r.id, r.name));
            }
            
            if (data.addedParticipants) {
                data.addedParticipants.forEach(p => addParticipant(p.id, p.name));
            }
            
            if (data.replies) {
                data.replies.forEach(rep => {
                    addParticipant(rep.authorId, rep.authorName);
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

            if (otherParticipants.length <= 1) {
                targetWrapper.style.display = 'none';
            } else {
                targetWrapper.style.display = 'flex';
            }

            replyActionsRow.parentNode.insertBefore(targetWrapper, replyActionsRow);

            const missingIds = (data.participants || []).filter(pid => 
                pid !== currentUserData.id && !otherParticipants.find(p => p.id === pid)
            );
            
            if (missingIds.length > 0) {
                Promise.all(missingIds.map(async (pid) => {
                    const snap = await getDoc(doc(db, "users", pid));
                    if (snap.exists()) {
                        const d = snap.data();
                        addParticipant(pid, d.name + (d.surname ? ' ' + d.surname : ''));
                    }
                })).then(() => {
                    let newHtml = '<option value="">📢 Herkese Açık (Genel)</option>';
                    otherParticipants.forEach(p => {
                        newHtml += `<option value="${p.id}" data-name="${p.name}">🎯 ${p.name} (Öncelikli)</option>`;
                    });
                    const tSel = targetWrapper.querySelector('#replyTargetSelect');
                    if (tSel) tSel.innerHTML = newHtml;

                    if (otherParticipants.length <= 1) {
                        targetWrapper.style.display = 'none';
                    } else {
                        targetWrapper.style.display = 'flex';
                    }
                });
            }

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

        // Removed the extra dynamic btnForward since btnAddPerson handles it.

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

        const permDeleteBtn = document.getElementById('btnPermanentDelete');
        if (permDeleteBtn) {
            if (currentFolder === 'trash') {
                permDeleteBtn.classList.remove('hidden');
            } else {
                permDeleteBtn.classList.add('hidden');
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

                // Render dynamic AI smart reply suggestions & detailed response drafts
                (async () => {
                    const suggestionsContainer = document.getElementById('replySuggestionsContainer');
                    if (suggestionsContainer) suggestionsContainer.remove();

                    // Only suggest if the last message in the thread was sent by someone else
                    let lastAuthorId = data.senderId;
                    if (data.replies && data.replies.length > 0) {
                        lastAuthorId = data.replies[data.replies.length - 1].authorId;
                    }
                    if (lastAuthorId === currentUserData.id) return;

                    const wrapper = document.createElement('div');
                    wrapper.id = 'replySuggestionsContainer';
                    wrapper.style.cssText = 'margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.85rem; background: var(--bg-card); border: 1px solid var(--border-color); padding: 1rem; border-radius: 12px;';
                    wrapper.innerHTML = `
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 0.4rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 0.25rem;">
                            <i class="fa-solid fa-wand-magic-sparkles" style="color: #0d9488;"></i> Yapay Zeka Destekli Yanıt Önerileri
                        </div>
                        
                        <!-- 3 Short Chips -->
                        <div style="display: flex; flex-direction: column; gap: 0.35rem;">
                            <div style="font-size: 0.76rem; font-weight: 600; color: var(--text-muted); display: flex; align-items: center; gap: 0.25rem;">
                                <i class="fa-solid fa-bolt-lightning" style="font-size: 0.7rem; color: #eab308;"></i> Hızlı Yanıt Önerileri (3 Seçenek):
                            </div>
                            <div id="aiSuggestionsButtons" style="display: flex; flex-wrap: wrap; gap: 0.5rem; min-height: 32px;">
                                <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;"><i class="fa-solid fa-circle-notch fa-spin"></i> Öneriler hazırlanıyor...</span>
                            </div>
                        </div>

                        <!-- 2 Detailed Drafts -->
                        <div style="display: flex; flex-direction: column; gap: 0.45rem; border-top: 1px dashed var(--border-color); padding-top: 0.75rem;">
                            <div style="font-size: 0.76rem; font-weight: 600; color: var(--text-muted); display: flex; align-items: center; gap: 0.25rem;">
                                <i class="fa-solid fa-file-pen" style="font-size: 0.7rem; color: var(--primary);"></i> Detaylı Cevap Taslakları (2 Alternatif):
                            </div>
                            <div id="aiDetailedDraftsList" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; min-height: 60px;">
                                <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic; grid-column: span 2;"><i class="fa-solid fa-circle-notch fa-spin"></i> Taslaklar hazırlanıyor...</span>
                            </div>
                        </div>
                    `;
                    
                    const replyInputArea = document.querySelector('.reply-input-wrapper');
                    if (replyInputArea) {
                        replyInputArea.insertBefore(wrapper, document.getElementById('replyInput'));
                    }

                    try {
                        const [suggestions, drafts] = await Promise.all([
                            getReplySuggestionsWithAI(
                                data.subject,
                                data.senderName,
                                data.receiverName,
                                data.content,
                                data.replies || []
                            ).catch(e => { console.error(e); return null; }),
                            getDetailedReplyDraftsWithAI(
                                data.subject,
                                data.senderName,
                                data.receiverName,
                                data.content,
                                data.replies || []
                            ).catch(e => { console.error(e); return null; })
                        ]);
                        
                        const buttonsArea = document.getElementById('aiSuggestionsButtons');
                        if (buttonsArea) {
                            if (suggestions && suggestions.length > 0) {
                                buttonsArea.innerHTML = suggestions.map(s => `
                                    <button type="button" class="btn-ai-suggestion-chip" style="background: rgba(13, 148, 136, 0.05); color: var(--primary); border: 1.2px solid rgba(13, 148, 136, 0.18); padding: 0.45rem 0.9rem; border-radius: 20px; font-family: inherit; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.3rem;" onmouseover="this.style.background='rgba(13, 148, 136, 0.12)'; this.style.borderColor='var(--primary)';" onmouseout="this.style.background='rgba(13, 148, 136, 0.05)'; this.style.borderColor='rgba(13, 148, 136, 0.18)';" onclick="const inp = document.getElementById('replyInput'); if(inp) { inp.value = '${s.replace(/'/g, "\\'")}'; inp.dispatchEvent(new Event('input')); } const container = document.getElementById('replySuggestionsContainer'); if(container) { container.remove(); }">
                                        <i class="fa-solid fa-bolt-lightning" style="font-size: 0.65rem; color: #eab308;"></i>
                                        <span>${s}</span>
                                    </button>
                                `).join('');
                            } else {
                                buttonsArea.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted);">Hızlı öneri üretilemedi.</span>';
                            }
                        }

                        const draftsArea = document.getElementById('aiDetailedDraftsList');
                        if (draftsArea) {
                            if (drafts && drafts.length > 0) {
                                draftsArea.innerHTML = drafts.map((d, index) => `
                                    <div class="ai-draft-card" style="background: var(--bg-hover); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 8px; font-size: 0.78rem; color: var(--text-color); cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; justify-content: space-between; gap: 0.5rem; position: relative;" onmouseover="this.style.borderColor='var(--primary)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)';" onmouseout="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none';" onclick="const inp = document.getElementById('replyInput'); if(inp) { inp.value = '${d.replace(/'/g, "\\'").replace(/\n/g, "\\n")}'; inp.dispatchEvent(new Event('input')); } const container = document.getElementById('replySuggestionsContainer'); if(container) { container.remove(); }">
                                        <div style="font-style: italic; line-height: 1.4; flex-grow: 1; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
                                            "${d}"
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; font-weight: 700; color: var(--primary); margin-top: 0.25rem; border-top: 1px solid rgba(0,0,0,0.03); padding-top: 0.25rem;">
                                            <span><i class="fa-solid fa-wand-magic-sparkles"></i> Seçenek ${index + 1}</span>
                                            <span style="opacity: 0.75;"><i class="fa-solid fa-circle-plus"></i> Kullan</span>
                                        </div>
                                    </div>
                                `).join('');
                            } else {
                                draftsArea.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted); grid-column: span 2;">Detaylı taslak üretilemedi.</span>';
                            }
                        }
                    } catch (err) {
                        console.error("AI Suggestions/Drafts render error:", err);
                        const buttonsArea = document.getElementById('aiSuggestionsButtons');
                        const draftsArea = document.getElementById('aiDetailedDraftsList');
                        if (buttonsArea) buttonsArea.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted);">Öneriler yüklenemedi.</span>';
                        if (draftsArea) draftsArea.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted); grid-column: span 2;">Taslaklar yüklenemedi.</span>';
                    }
                })();
            }
        }
    });
};

window.__openDraft = async (id) => {
    const docRef = doc(db, "messages", id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    
    currentDraftId = id;
    resetDetailView();
    document.getElementById('detailEmptyState')?.classList.add('hidden');
    document.getElementById('emptyView')?.classList.add('hidden');
    const composeArea = document.getElementById('composeArea');
    composeArea.classList.remove('hidden');
    
    document.getElementById('subjectInput').value = data.subject;
    document.getElementById('messageBodyInput').value = data.content;
    
    if (data._draftReceivers) {
        selectedReceivers = JSON.parse(data._draftReceivers);
        renderReceivers();
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
    selectedReceivers = []; // [{id, name, type: 'individual'|'bulk'}]

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
            
            // Initialize scheduledTimeInput with today's date and time
            const timeInp = document.getElementById('scheduledTimeInput');
            if (timeInp) {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                timeInp.value = now.toISOString().slice(0, 16);
            }
            selectedReceivers = [];
            renderReceivers();

            // ── RBAC: Kullanıcı rolüne göre dropdown seçeneklerini filtrele ──
            filterComposeOptions(categorySelect);
        });
    }

    /**
     * Kullanıcının Firebase'deki category + subRole bilgisine göre
     * "Alıcı Birimi" dropdown seçeneklerini dinamik filtreler.
     * Hiçbir zaman yetkisiz bir hedefe mesaj gönderilmesine izin vermez.
     */
    function filterComposeOptions(select) {
        if (!select || !currentUserData) return;

        const cat      = currentUserData.category  || 'local';   // local | regional | factory | admin
        const subRole  = currentUserData.subRole   || 'employee'; // employee | manager | admin

        // Tüm seçenekleri önce gizle
        Array.from(select.options).forEach(o => o.style.display = 'none');

        // "Birim seçiniz..." placeholder her zaman görünür
        const placeholder = select.querySelector('option[value=""]');
        if (placeholder) placeholder.style.display = '';

        const show = (val) => {
            const opt = select.querySelector(`option[value="${val}"]`);
            if (opt) opt.style.display = '';
        };

        if (cat === 'admin' || subRole === 'admin' || currentUserData.role === 'admin') {
            // FABRIKA PATRON / ADMİN (God Mode) → Hepsi
            ['local_colleagues', 'local_boss', 'region_dealers', 'factory_hq', 'global'].forEach(show);
            const c = select.querySelector('option[value="local_colleagues"]');
            if (c) c.textContent = 'Tüm Bayi Personelleri';
            const b = select.querySelector('option[value="local_boss"]');
            if (b) b.textContent = 'Tüm Bayi Patronları';
            const r = select.querySelector('option[value="region_dealers"]');
            if (r) r.textContent = 'Tüm Bölge Müdürleri';
            const f = select.querySelector('option[value="factory_hq"]');
            if (f) f.textContent = 'Fabrika İçi Personel';

        } else if (cat === 'factory') {
            // FABRİKA ÇALIŞANI → Fabrika içi + Bölge Müdürleri
            ['factory_hq', 'region_dealers'].forEach(show);
            // Fabrika içi seçeneğin label'ını anlamlı yap
            const factoryOpt = select.querySelector('option[value="factory_hq"]');
            if (factoryOpt) factoryOpt.textContent = 'Fabrika İçi';
            const regionOpt = select.querySelector('option[value="region_dealers"]');
            if (regionOpt) regionOpt.textContent = 'Bölge Müdürlüğü';

        } else if (cat === 'regional') {
            if (subRole === 'manager') {
                // BÖLGE PATRON → Kendi bölgesi + Diğer bölgeler + Fabrika
                ['local_colleagues', 'local_boss', 'region_dealers', 'factory_hq', 'global'].forEach(show);
                const c = select.querySelector('option[value="local_colleagues"]');
                if (c) c.textContent = 'Bölge Çalışanlarım';
                const b = select.querySelector('option[value="local_boss"]');
                if (b) b.textContent = 'Bölgemdeki Bayi Patronları';
                const r = select.querySelector('option[value="region_dealers"]');
                if (r) r.textContent = 'Diğer Bölge Müdürleri';
            } else {
                // BÖLGE ÇALIŞANI → Kendi bölgesi + Fabrika (direkt iletişim eklendi)
                ['local_colleagues', 'local_boss', 'region_dealers', 'factory_hq'].forEach(show);
                const c = select.querySelector('option[value="local_colleagues"]');
                if (c) c.textContent = 'Bölgedeki Çalışma Arkadaşlarım';
                const b = select.querySelector('option[value="local_boss"]');
                if (b) b.textContent = 'Bölgemdeki Bayi Patronları';
                const r = select.querySelector('option[value="region_dealers"]');
                if (r) r.textContent = 'Bölge Yöneticilerim';
            }

        } else if (cat === 'local') {
            if (subRole === 'manager') {
                // YEREL PATRON (Bayi Yöneticisi) → Kendi çalışanları + Diğer bayi patronları + Bölge müdürü
                ['local_colleagues', 'local_boss', 'region_dealers'].forEach(show);
                const c = select.querySelector('option[value="local_colleagues"]');
                if (c) c.textContent = 'Kendi Çalışanlarım';
                const b = select.querySelector('option[value="local_boss"]');
                if (b) b.textContent = 'Diğer Bayi Patronları';
                const r = select.querySelector('option[value="region_dealers"]');
                if (r) r.textContent = 'Bölge Yönetimim';
            } else {
                // YEREL ÇALIŞAN → Sadece kendi arkadaşları ve bayi patronu
                ['local_colleagues', 'local_boss'].forEach(show);
                const c = select.querySelector('option[value="local_colleagues"]');
                if (c) c.textContent = 'İş Arkadaşlarım';
                const b = select.querySelector('option[value="local_boss"]');
                if (b) b.textContent = 'Patronum';
            }
        }
    }

    const regionFilterContainer = document.getElementById('regionFilterContainer');
    const regionFilterSelect = document.getElementById('regionFilterSelect');

    if (categorySelect) {
        categorySelect.addEventListener('change', async (e) => {
            const cat = e.target.value;
            const userCat = currentUserData?.category || 'local';
            const userSubRole = currentUserData?.subRole || 'employee';
            
            // Sadece diğer bölgelere mesaj atabilme yetkisi olanlar bölge filtresi görür
            const needsRegionFilter = (userCat === 'admin' || userSubRole === 'admin') || 
                                      (userCat === 'factory') || 
                                      (userCat === 'regional' && userSubRole === 'manager');
            
            if (needsRegionFilter && ['local_boss', 'region_dealers', 'global', 'local_colleagues'].includes(cat)) {
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
        closeCompose.addEventListener('click', async () => {
            const subject = document.getElementById('subjectInput').value.trim();
            const body = document.getElementById('messageBodyInput').value.trim();
            
            if (subject || body || selectedReceivers.length > 0) {
                try {
                    const originalIcon = closeCompose.innerHTML;
                    closeCompose.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                    
                    if (currentDraftId) {
                        await updateDoc(doc(db, "messages", currentDraftId), {
                            subject: subject || "İsimsiz Taslak",
                            content: body || "",
                            timestamp: serverTimestamp(),
                            _draftReceivers: JSON.stringify(selectedReceivers)
                        });
                    } else {
                        await addDoc(collection(db, "messages"), {
                            senderId: currentUserData.id,
                            senderName: `${currentUserData.name} ${currentUserData.surname || ''}`,
                            subject: subject || "İsimsiz Taslak",
                            content: body || "",
                            timestamp: serverTimestamp(),
                            isDraft: true,
                            participants: [currentUserData.id],
                            _draftReceivers: JSON.stringify(selectedReceivers)
                        });
                    }
                    
                    // Show a non-blocking toast if available
                    if (typeof showToast === 'function') {
                        showToast("Taslak otomatik olarak kaydedildi.", "info");
                    }
                    
                    closeCompose.innerHTML = originalIcon;
                } catch (err) {
                    console.error("Taslak kaydetme hatası:", err);
                }
            } else {
                if (currentDraftId) {
                    try { await deleteDoc(doc(db, "messages", currentDraftId)); } catch(e){}
                }
            }
            
            document.getElementById('composeForm').reset();
            const timeInp = document.getElementById('scheduledTimeInput');
            if (timeInp) {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                timeInp.value = now.toISOString().slice(0, 16);
            }
            selectedReceivers = [];
            renderReceivers();
            currentDraftId = null;
            
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

    window.__selectReceiver = async (id, name, type, region = "", company = "", category = "", subRole = "", dealerCode = "") => {
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
                    if (currentUserData.category === 'local' && currentUserData.dealerCode && !reg) {
                        return category === 'local' && subRole === 'manager' && dealerCode === currentUserData.dealerCode;
                    }
                    return category === 'local' && subRole === 'manager' && (reg ? region === reg : region === currentUserData.region);
                } else if (cat === 'local_colleagues') {
                    if (currentUserData.category === 'local' && currentUserData.dealerCode && !reg) {
                        return category === 'local' && dealerCode === currentUserData.dealerCode && subRole === (currentUserData.subRole || "employee");
                    }
                    return region === currentUserData.region && category === (currentUserData.category || "local") && subRole === (currentUserData.subRole || "employee");
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
            
            const users = await loadReceiversByCategory(cat, reg);
            if (users.length === 1) {
                const u = users[0];
                return window.__selectReceiver(u.id, `${u.name} ${u.surname || ''}`, 'individual', u.region, u.company, u.category, u.subRole, u.dealerCode);
            } else if (users.length === 0) {
                alert("Bu grupta seçilecek kimse bulunamadı.");
                return;
            }
            
            selectedReceivers = selectedReceivers.filter(r => {
                if (r.type === 'bulk') return true;
                let isCovered = false;
                if (cat === 'local_boss') {
                    if (currentUserData.category === 'local' && currentUserData.dealerCode && !reg) {
                        isCovered = r.category === 'local' && r.subRole === 'manager' && r.dealerCode === currentUserData.dealerCode;
                    } else {
                        isCovered = r.category === 'local' && r.subRole === 'manager' && (reg ? r.region === reg : r.region === currentUserData.region);
                    }
                } else if (cat === 'local_colleagues') {
                    if (currentUserData.category === 'local' && currentUserData.dealerCode && !reg) {
                        isCovered = r.category === 'local' && r.dealerCode === currentUserData.dealerCode && r.subRole === (currentUserData.subRole || "employee");
                    } else {
                        isCovered = r.region === currentUserData.region && r.category === (currentUserData.category || "local") && r.subRole === (currentUserData.subRole || "employee");
                    }
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

    async function showCustomTooltip(e) {
        let tooltip = document.getElementById('receiverTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'receiverTooltip';
            tooltip.className = 'receiver-tooltip';
            document.body.appendChild(tooltip);
        }

        const ds = e.currentTarget.dataset;
        let name = ds.name || '';
        let company = ds.company || '';
        let region = ds.region || '';
        let rawRole = ds.role || '';
        let category = ds.cat || '';
        let code = ds.code || '';

        tooltip.innerHTML = `<div style="padding:1rem;text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...</div>`;
        tooltip.classList.add('visible');
        positionCustomTooltip(e);

        if (ds.id && !ds.company) {
            try {
                const uDoc = await getDoc(doc(db, "users", ds.id));
                if (uDoc.exists()) {
                    const uData = uDoc.data();
                    company = uData.company || 'Bellona Kurumsal';
                    region = uData.region || 'Genel';
                    rawRole = uData.subRole || '';
                    category = uData.category || '';
                    code = uData.dealerCode || '0000';
                    if (!name) name = `${uData.name} ${uData.surname || ''}`;
                }
            } catch (err) {
                console.error("Tooltip user fetch error", err);
            }
        }
        
        company = company || 'Bellona Kurumsal';
        region = region || 'Genel';
        code = code || '0000';

        let roleText = 'Personel';
        let customBadge = '';
        if (rawRole === 'manager') {
            roleText = 'Yönetici / Patron';
            customBadge = '<span style="background:linear-gradient(135deg, #1e293b, #0f172a); color:#fbbf24; padding:2px 6px; border-radius:4px; font-size:0.65rem; font-weight:700;"><i class="fa-solid fa-user-tie"></i> YÖNETİCİ</span>';
        } else if (category === currentUserData.category && region === currentUserData.region) {
            roleText = 'Mesai Arkadaşı (Aynı Birim)';
            customBadge = '<span style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; padding:2px 6px; border-radius:4px; font-size:0.65rem; font-weight:700;"><i class="fa-solid fa-user-group"></i> MESAİ ARKADAŞI</span>';
        } else if (category === 'factory') {
            roleText = 'Fabrika Yetkilisi';
        } else if (category === 'regional') {
            roleText = 'Bölge Sorumlusu';
        }

        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        tooltip.innerHTML = `
          <div class="tooltip-header">
            <div class="tooltip-avatar">${initials}</div>
            <div class="tooltip-title-area">
              <div class="tooltip-name" style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">${name} ${customBadge}</div>
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

    renderReceivers = () => {
        if (!receiversList) return;
        receiversList.innerHTML = selectedReceivers.map((r, index) => {
            const regClass = r.type === 'bulk' ? 'bulk' : getRegionClass(r.region);
            const unitLabel = r.type === 'bulk' ? 'GRUP' : (r.category === 'factory' ? 'FB' : (r.category === 'regional' ? 'BLG' : 'BYI'));
            
            let customStyle = '';
            let iconHtml = `<i class="fa-solid ${r.type === 'bulk' ? 'fa-users' : 'fa-user'}"></i>`;
            
            if (r.type !== 'bulk') {
                if (r.subRole === 'manager') {
                    customStyle = 'background: linear-gradient(135deg, #1e293b, #0f172a); color: #f8fafc; border: 1px solid #334155; box-shadow: 0 2px 4px rgba(0,0,0,0.15);';
                    iconHtml = `<i class="fa-solid fa-user-tie" style="color: #fbbf24;"></i>`;
                } else if (r.category === currentUserData.category && r.region === currentUserData.region) {
                    customStyle = 'background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0;';
                    iconHtml = `<i class="fa-solid fa-user-group" style="color: #16a34a;"></i>`;
                }
            } else {
                customStyle = 'background: linear-gradient(135deg, #0284c7, #0369a1); color: white; border: none;';
                iconHtml = `<i class="fa-solid fa-users" style="color: #bae6fd;"></i>`;
            }
            
            return `
                <div class="modern-chip ${regClass}" data-index="${index}" data-cat="${r.category || ''}" data-name="${r.name}" data-type="${r.type}" data-company="${r.company || ''}" data-region="${r.region || ''}" data-role="${r.subRole || ''}" data-code="${r.dealerCode || ''}" style="${customStyle}">
                    ${iconHtml}
                    <span style="${customStyle ? 'color:inherit;' : ''}">${r.name}</span>
                    <span class="unit-badge" style="${customStyle ? (r.subRole === 'manager' || r.type === 'bulk' ? 'background:rgba(255,255,255,0.15); color:inherit;' : 'background:rgba(22,163,74,0.15); color:inherit;') : ''}">${unitLabel}</span>
                    ${r.type === 'bulk' ? `<i class="fa-solid fa-expand-arrows-alt expand-trigger" title="Grubu Dağıt" style="color:inherit;"></i>` : ''}
                    <i class="fa-solid fa-circle-xmark chip-remove remove-chip-trigger" title="Kaldır" style="color:inherit;"></i>
                </div>
            `;
        }).join('');

        // Auto-scroll to bottom
        receiversList.scrollTop = receiversList.scrollHeight;

        triggerDraftAutosave();

        // Event delegation for chip actions
        receiversList.querySelectorAll('.modern-chip').forEach(chip => {
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

            // Hover and Touch Tooltip Events
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
                // Mobil cihazlar için tıklayınca tooltip'i göster/gizle
                chip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const tooltip = document.getElementById('receiverTooltip');
                    if (tooltip && tooltip.classList.contains('visible')) {
                        hideCustomTooltip();
                    } else {
                        showCustomTooltip(e);
                    }
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
                    category: u.category,
                    subRole: u.subRole,
                    dealerCode: u.dealerCode
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

    
    const scheduledTimeInput = document.getElementById('scheduledTimeInput');
    const clearTimeBtn = document.getElementById('clearTimeBtn');
    
    if (scheduledTimeInput) {
        // Default to today's date
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        scheduledTimeInput.value = now.toISOString().slice(0, 16);
    }

    document.querySelectorAll('.quick-time-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!scheduledTimeInput) return;
            const action = e.target.getAttribute('data-time');
            if (!action) {
                if (e.target.id === 'clearTimeBtn') {
                    scheduledTimeInput.value = '';
                    clearTimeBtn.style.display = 'none';
                }
                return;
            }
            
            const d = new Date();
            if (action === 'tomorrow_08') {
                d.setDate(d.getDate() + 1);
                d.setHours(8, 0, 0, 0);
            } else if (action === 'tomorrow_12') {
                d.setDate(d.getDate() + 1);
                d.setHours(12, 0, 0, 0);
            } else if (action === 'today_17') {
                d.setHours(17, 0, 0, 0);
            }
            
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            scheduledTimeInput.value = d.toISOString().slice(0, 16);
            if (clearTimeBtn) clearTimeBtn.style.display = 'inline-block';
        });
    });

    if (scheduledTimeInput) {
        scheduledTimeInput.addEventListener('change', () => {
            if (scheduledTimeInput.value && clearTimeBtn) clearTimeBtn.style.display = 'inline-block';
        });
    }

    const composeForm = document.getElementById('composeForm');
    if (composeForm) {
        composeForm.addEventListener('submit', handleComposeSubmit);
    }

    const subjectInput = document.getElementById('subjectInput');
    const messageBodyInput = document.getElementById('messageBodyInput');
    if (subjectInput) {
        subjectInput.addEventListener('input', triggerDraftAutosave);
    }
    if (messageBodyInput) {
        messageBodyInput.addEventListener('input', triggerDraftAutosave);
    }
    
    const btnUrgentToggle = document.getElementById('btnUrgentToggle');
    if (btnUrgentToggle) {
        btnUrgentToggle.addEventListener('click', () => {
            btnUrgentToggle.classList.toggle('is-urgent');
            if (btnUrgentToggle.classList.contains('is-urgent')) {
                btnUrgentToggle.style.background = 'var(--danger)';
                btnUrgentToggle.style.color = 'white';
            } else {
                btnUrgentToggle.style.background = 'transparent';
                btnUrgentToggle.style.color = 'var(--danger)';
            }
        });
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
                html += filtered.map(u => {
                    let customBg = '';
                    let roleIcon = '<i class="fa-solid fa-building" style="font-size:0.7rem;"></i>';
                    let roleText = 'Personel';
                    
                    if (u.subRole === 'manager') {
                        customBg = 'background: linear-gradient(to right, #1e293b, #0f172a); color: #f8fafc; border-left: 4px solid #fbbf24;';
                        roleIcon = '<i class="fa-solid fa-user-tie" style="color: #fbbf24;"></i>';
                        roleText = 'Yönetici';
                    } else if (u.category === currentUserData.category && u.region === currentUserData.region) {
                        customBg = 'background: #f0fdf4; border-left: 4px solid #22c55e;';
                        roleIcon = '<i class="fa-solid fa-user-group" style="color: #16a34a;"></i>';
                        roleText = 'Mesai Arkadaşı';
                    }
                    
                    return `
                    <div class="search-result-item" style="${customBg}" onclick="window.__selectReceiver('${u.id}', '${u.name} ${u.surname || ''}', 'individual', '${u.region || ''}', '${u.company || ''}', '${u.category || ''}', '${u.subRole || ''}', '${u.dealerCode || ''}')">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="item-title" style="${u.subRole === 'manager' ? 'color:#f8fafc;' : ''}">${u.name} ${u.surname || ''}</span>
                            <span style="font-size:0.65rem; background:var(--primary-soft); color:var(--primary); padding:2px 6px; border-radius:4px; font-weight:700;">#${u.dealerCode || '0000'}</span>
                        </div>
                        <div class="item-subtitle" style="${u.subRole === 'manager' ? 'color:#cbd5e1;' : ''}">
                            ${roleIcon} ${u.company || 'Bellona'} - <strong>${roleText}</strong>
                        </div>
                    </div>
                `}).join('');
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
            if (!bodyInput) return;
            
            if (selectedReceivers.length === 0) {
                alert("Lütfen yapay zekanın size uygun kurumsal hitap ve tonu belirleyebilmesi için önce bir alıcı seçiniz.");
                return;
            }

            let currentText = bodyInput.value.trim();
            if (!currentText) {
                alert("Lütfen düzenlenmesi için önce bir mesaj içeriği yazınız.");
                return;
            }

            if (!currentText.includes("✨") || !lastOriginalText) {
                lastOriginalText = currentText;
            }

            const receiverName = selectedReceivers[0].name.split('(')[0].trim();
            const myName = `${currentUserData.name} ${currentUserData.surname || ''}`;
            const myCompany = currentUserData.company || "Bellona";

            const originalBtnHtml = aiSuggestBtn.innerHTML;
            aiSuggestBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor...';
            aiSuggestBtn.disabled = true;

            try {
                const refinedText = await refineMessageWithAI(lastOriginalText, {
                    receiverName,
                    senderName: myName,
                    senderCompany: myCompany
                });
                
                if (refinedText.error) throw new Error(refinedText.error);

                let finalText = refinedText;
                const subjectMatch = finalText.match(/^(?:Konu|Subject):\s*([^\n]+)/i);
                
                if (subjectMatch) {
                    const subjectInput = document.getElementById('subjectInput');
                    if (subjectInput) {
                        subjectInput.value = subjectMatch[1].trim();
                        finalText = finalText.replace(subjectMatch[0], '').trim();
                    }
                }

                bodyInput.value = "✨ " + finalText;
                
                aiSuggestBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Düzenlendi';
                setTimeout(() => {
                    aiSuggestBtn.innerHTML = originalBtnHtml;
                    aiSuggestBtn.disabled = false;
                }, 3000);
            } catch (err) {
                console.error("AI Refine UI Error:", err);
                alert("Yapay zeka düzenlemesinde bir hata oluştu: " + err.message);
                aiSuggestBtn.innerHTML = originalBtnHtml;
                aiSuggestBtn.disabled = false;
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
                    senderCompany: myCompany,
                    isReply: true
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
            if (currentUserData.category === 'local' && currentUserData.dealerCode) {
                q = query(usersRef, where("category", "==", "local"), where("subRole", "==", "manager"), where("dealerCode", "==", currentUserData.dealerCode));
            } else {
                q = query(usersRef, where("region", "==", currentUserData.region), where("category", "==", "local"), where("subRole", "==", "manager"));
            }
        }
    } else if (category === 'local_colleagues') {
        const mySubRole = currentUserData.subRole || "employee";
        if (currentUserData.category === 'local' && currentUserData.dealerCode) {
            q = query(usersRef, where("category", "==", "local"), where("dealerCode", "==", currentUserData.dealerCode), where("subRole", "==", mySubRole));
        } else {
            q = query(usersRef, where("region", "==", currentUserData.region), where("category", "==", currentUserData.category || "local"), where("subRole", "==", mySubRole));
        }
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
    // Matches optional sparkle, greeting word, everything else on the first line, and any trailing newlines
    const welcomeRegex = /^(✨\s*)?(Sayın|Merhaba|Sevgili|Değerli|Saygıdeğer)[^\n]*(\n\s*\n|\n|$)/i;
    
    if (welcomeRegex.test(body)) {
        return body.replace(welcomeRegex, (match, spark) => {
            return `${spark || ''}Sayın ${cleanName},\n\n`;
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
        const subject = document.getElementById('subjectInput').value.trim();
        const body = document.getElementById('messageBodyInput').value.trim();
        
        const btnUrgentToggle = document.getElementById('btnUrgentToggle');
        const isUrgent = btnUrgentToggle ? btnUrgentToggle.classList.contains('is-urgent') : false;

        if (!subject) {
            alert("Lütfen mesaj konusunu doldurunuz.");
            if (sendBtn) sendBtn.disabled = false;
            return;
        }

        if (selected.length === 0 || !body) {
            alert("Lütfen en az bir alıcı ve mesaj içeriğini doldurunuz.");
            if (sendBtn) sendBtn.disabled = false;
            return;
        }

        const scheduledTimeInput = document.getElementById('scheduledTimeInput');
        const scheduledFor = scheduledTimeInput && scheduledTimeInput.value ? new Date(scheduledTimeInput.value).toISOString() : null;

        let attachmentUrl = null;
        let attachmentName = null;

        // Dosya Yükleme (Varsa)
        const fileInput = document.getElementById('fileInput');
        if (fileInput && fileInput.files[0]) {
            const file = fileInput.files[0];
            attachmentName = file.name;
            
            let useStandardUpload = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

            try {
                if (useStandardUpload) {
                    console.log("[Storage] Attempting standard Firebase Storage upload...");
                    const fileRef = ref(storage, `messages/${Date.now()}_${file.name}`);
                    const uploadResult = await uploadBytes(fileRef, file);
                    attachmentUrl = await getDownloadURL(uploadResult.ref);
                    console.log("[Storage] Standard upload successful! URL:", attachmentUrl);
                } else {
                    throw new Error("Localhost detected, skipping Firebase Storage to avoid CORS policy block.");
                }
            } catch (storageErr) {
                console.warn("[Storage] Firebase Storage failed/skipped. Executing Base64 Local Fallback...", storageErr);
                
                // Firestore limit is 1MB per document, so we limit local Base64 attachments to 900KB
                if (file.size > 900 * 1024) {
                    alert("Seçilen dosya çok büyük. Localhost üzerinden test ederken lütfen 1MB'dan küçük dosyalar (örneğin ufak bir PDF veya resim) seçin.");
                    if (sendBtn) sendBtn.disabled = false;
                    return;
                }
                
                // Read as Base64 Data URL
                attachmentUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsDataURL(file);
                });
                console.log("[Storage] Base64 fallback successful! Length:", attachmentUrl.length);
            }
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
            
            // Audit Log for the transaction history
            const auditRef = doc(collection(db, "auditLogs"));
            batch.set(auditRef, {
                actorUid: currentUserData.id,
                actorName: `${currentUserData.name} ${currentUserData.surname || ''}`,
                actorEmail: currentUserData.email || "-",
                action: "BIREYSEL_MESAJ",
                targetType: "user",
                targetId: tid,
                detail: `"${tdata.name}" adlı kullanıcıya personel içi mesaj gönderildi.`,
                createdAt: serverTimestamp()
            });

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
                scheduledFor,
                attachmentUrl,
                attachmentName,
                isBulk: finalRecipients.size > 1,
                originalSenderId: forwardOriginalSenderId || null,
                originalSenderName: forwardOriginalSenderName || null,
                isUrgent: isUrgent
            });
        });

        await batch.commit();
        alert(`${finalRecipients.size} farklı alıcıya mesaj başarıyla gönderildi!`);
        
        // Reset forward state
        forwardOriginalMessageId = null;
        forwardOriginalSenderId = null;
        forwardOriginalSenderName = null;
        
        if (fileInput) fileInput.value = '';
        if (scheduledTimeInput) {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            scheduledTimeInput.value = now.toISOString().slice(0, 16);
        }
        
        // Clear selected receivers list and form inputs completely
        window.__clearSelectedReceivers();
        if (document.getElementById('subjectInput')) document.getElementById('subjectInput').value = '';
        if (document.getElementById('messageBodyInput')) document.getElementById('messageBodyInput').value = '';
        
        if (currentDraftId) {
            try {
                await deleteDoc(doc(db, "messages", currentDraftId));
            } catch(e) {}
            currentDraftId = null;
        }
        
        resetDetailView();
    } catch (err) { 
        console.error("Send error:", err); 
        alert("Gönderim sırasında hata oluştu.");
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
}

async function openEditScheduledModal(id, data) {
    let backdrop = document.getElementById('editScheduledModalBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'editScheduledModalBackdrop';
        backdrop.className = 'loopin-modal-backdrop';
        backdrop.innerHTML = `
            <div class="loopin-modal">
                <div class="loopin-modal-header">
                    <h3><i class="fa-solid fa-calendar-days"></i> Zamanlanmış Mesajı Düzenle</h3>
                    <button class="loopin-modal-close" onclick="document.getElementById('editScheduledModalBackdrop').classList.remove('active')">&times;</button>
                </div>
                <div class="loopin-modal-body">
                    <div class="loopin-select-group" style="margin-bottom: 1rem;">
                        <label style="font-weight: 600; display: block; margin-bottom: 0.4rem;">Konu</label>
                        <input type="text" id="editScheduledSubjectInput" class="modern-input" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div class="loopin-select-group" style="margin-bottom: 1rem;">
                        <label style="font-weight: 600; display: block; margin-bottom: 0.4rem;">Gönderim Tarihi ve Saati</label>
                        <input type="datetime-local" id="editScheduledTimeInput" class="modern-input" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div class="loopin-select-group">
                        <label style="font-weight: 600; display: block; margin-bottom: 0.4rem;">Mesaj İçeriği</label>
                        <textarea id="editScheduledContentInput" class="modern-input" style="width: 100%; height: 120px; resize: none; box-sizing: border-box;"></textarea>
                    </div>
                </div>
                <div class="loopin-modal-footer">
                    <button class="btn-loopin-cancel" onclick="document.getElementById('editScheduledModalBackdrop').classList.remove('active')">Vazgeç</button>
                    <button class="btn-loopin-confirm" id="btnEditScheduledConfirm" style="background: var(--primary); color: white;">Güncelle</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
    }

    const subjectInput = document.getElementById('editScheduledSubjectInput');
    const timeInput = document.getElementById('editScheduledTimeInput');
    const contentInput = document.getElementById('editScheduledContentInput');
    const confirmBtn = document.getElementById('btnEditScheduledConfirm');

    subjectInput.value = data.subject || '';
    contentInput.value = data.content || '';
    
    if (data.scheduledFor) {
        timeInput.value = data.scheduledFor.substring(0, 16);
    } else {
        timeInput.value = '';
    }

    backdrop.classList.add('active');

    confirmBtn.onclick = async () => {
        const newSubject = subjectInput.value.trim();
        const newTime = timeInput.value;
        const newContent = contentInput.value.trim();

        if (!newSubject) {
            alert("Lütfen bir konu başlığı girin.");
            return;
        }
        if (!newTime) {
            alert("Lütfen gönderim tarihini girin.");
            return;
        }
        
        const scheduledDate = new Date(newTime);
        if (scheduledDate <= new Date()) {
            alert("Zamanlama geçmiş bir tarih olamaz!");
            return;
        }
        if (!newContent) {
            alert("Lütfen mesaj içeriğini girin.");
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = "Güncelleniyor...";

        try {
            const docRef = doc(db, "messages", id);
            await updateDoc(docRef, {
                subject: newSubject,
                scheduledFor: new Date(newTime).toISOString(),
                content: newContent,
                lastMessage: newContent
            });
            
            alert("Zamanlanmış mesaj başarıyla güncellendi!");
            backdrop.classList.remove('active');
            
            resetDetailView();
            loadFolder(currentFolder);
        } catch (err) {
            console.error("Zamanlanmış mesaj güncellenirken hata:", err);
            alert("Güncelleme işlemi sırasında bir hata oluştu.");
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Güncelle";
        }
    };
}

function triggerDraftAutosave() {
    if (autosaveTimeout) clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(async () => {
        const composeArea = document.getElementById('composeArea');
        if (composeArea && !composeArea.classList.contains('hidden')) {
            const subject = document.getElementById('subjectInput').value.trim();
            const body = document.getElementById('messageBodyInput').value.trim();
            
            if (subject || body || selectedReceivers.length > 0) {
                try {
                    const uid = currentUserData.id;
                    if (currentDraftId) {
                        const docRef = doc(db, "messages", currentDraftId);
                        await updateDoc(docRef, {
                            subject: subject || "İsimsiz Taslak",
                            content: body || "",
                            timestamp: serverTimestamp(),
                            _draftReceivers: JSON.stringify(selectedReceivers)
                        });
                    } else {
                        const docRef = await addDoc(collection(db, "messages"), {
                            senderId: uid,
                            senderName: `${currentUserData.name} ${currentUserData.surname || ''}`,
                            subject: subject || "İsimsiz Taslak",
                            content: body || "",
                            timestamp: serverTimestamp(),
                            isDraft: true,
                            participants: [uid],
                            _draftReceivers: JSON.stringify(selectedReceivers)
                        });
                        currentDraftId = docRef.id;
                    }
                    console.log("Draft auto-saved successfully. ID:", currentDraftId);
                } catch (err) {
                    console.error("Autosave draft error:", err);
                }
            }
        }
    }, 2000); // Trigger auto-save 2 seconds after the user stops typing
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
                text: `📢 ${toTitleCase(selectedUser.name)} bu konuşmaya eklendi.`
            });

            const addedParticipants = currentData.addedParticipants || [];
            if (!addedParticipants.find(p => p.id === selectedUser.id)) {
                addedParticipants.push({ id: selectedUser.id, name: selectedUser.name });
            }

            await updateDoc(docRef, {
                participants: pArr,
                replies: replies,
                addedParticipants: addedParticipants,
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
    
    let attachmentUrl = null;
    let attachmentName = null;
    const replyFileInput = document.getElementById('replyFileInput');
    if (replyFileInput && replyFileInput.files && replyFileInput.files.length > 0) {
        const file = replyFileInput.files[0];
        attachmentName = file.name;
        // Basic fallback upload (for testing without full setup)
        attachmentUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
        });
    }
    
    const replyObj = {
        authorName: `${currentUserData.name} ${currentUserData.surname || ''}`,
        authorId: currentUserData.id,
        text: replyText,
        timestamp: now.toISOString(),
        attachmentUrl: attachmentUrl,
        attachmentName: attachmentName
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
        if (replyFileInput) replyFileInput.value = '';
    } catch (err) { console.error("Reply error:", err); }
}

// =====================
// BULK ACTIONS (Toplu İşlemler)
// =====================
function initBulkActions() {
    // Inject floating bulk toolbar
    if (document.getElementById('bulkToolbar')) return;
    
    const toolbar = document.createElement('div');
    toolbar.id = 'bulkToolbar';
    toolbar.className = 'bulk-toolbar hidden';
    toolbar.innerHTML = `
        <div class="bulk-toolbar-inner">
            <div class="bulk-info">
                <input type="checkbox" id="bulkSelectAll" class="bulk-checkbox" title="Tümünü Seç/Kaldır" />
                <span id="bulkCount">0 mesaj seçili</span>
            </div>
            <div class="bulk-actions">
                <button class="bulk-btn bulk-btn-archive" id="bulkArchiveBtn" title="Seçilenleri Arşivle">
                    <i class="fa-solid fa-box-archive"></i> Arşivle
                </button>
                <button class="bulk-btn bulk-btn-trash" id="bulkTrashBtn" title="Seçilenleri Çöpe Taşı">
                    <i class="fa-solid fa-trash-can"></i> Sil
                </button>
                <button class="bulk-btn bulk-btn-cancel" id="bulkCancelBtn" title="Seçimi İptal Et">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(toolbar);

    // Inject CSS for bulk actions
    const style = document.createElement('style');
    style.textContent = `
        .bulk-toolbar {
            position: fixed;
            bottom: 2rem;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            z-index: 9999;
            background: linear-gradient(135deg, #064e3b, #065f46);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1) inset;
            opacity: 0;
            pointer-events: none;
            transition: all 0.2s ease-out;
        }
        .bulk-toolbar.visible {
            opacity: 1;
            pointer-events: all;
            transform: translateX(-50%) translateY(0);
        }
        .bulk-toolbar.hidden { display: block; }
        .bulk-toolbar-inner {
            display: flex;
            align-items: center;
            gap: 1.5rem;
        }
        .bulk-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-weight: 700;
            font-size: 0.9rem;
        }
        .bulk-info .bulk-checkbox {
            width: 18px;
            height: 18px;
            accent-color: #34d399;
            cursor: pointer;
        }
        .bulk-actions {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .bulk-btn {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.5rem 1rem;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 10px;
            background: rgba(255,255,255,0.1);
            color: white;
            font-size: 0.82rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
        }
        .bulk-btn:hover {
            background: rgba(255,255,255,0.2);
            transform: translateY(-1px);
        }
        .bulk-btn-trash { border-color: #fca5a5; color: #fecaca; }
        .bulk-btn-trash:hover { background: #dc2626; border-color: #dc2626; color: white; }
        .bulk-btn-cancel { padding: 0.5rem 0.6rem; }

        .bulk-checkbox-wrap {
            display: flex;
            align-items: center;
            padding-top: 0.3rem;
            flex-shrink: 0;
        }
        .bulk-checkbox {
            width: 18px;
            height: 18px;
            accent-color: var(--primary, #0d9488);
            cursor: pointer;
            border-radius: 4px;
        }
        .msg-item.bulk-selected {
            background: rgba(16, 185, 129, 0.08) !important;
            border-left: 3px solid #10b981 !important;
        }
    `;
    document.head.appendChild(style);

    document.getElementById('bulkSelectAll').addEventListener('change', (e) => {
        const parentCheckboxes = document.querySelectorAll('.msg-item .parent-bulk-checkbox');
        parentCheckboxes.forEach(cb => {
            cb.checked = e.target.checked;
            const allIdsStr = cb.getAttribute('data-all-ids') || cb.getAttribute('data-id');
            const ids = allIdsStr.split(',');
            
            if (e.target.checked) {
                ids.forEach(id => bulkSelectedIds.add(id));
            } else {
                ids.forEach(id => bulkSelectedIds.delete(id));
            }
            // Toggle visual selection
            const item = cb.closest('.msg-item');
            if (item) item.classList.toggle('bulk-selected', e.target.checked);
        });
        updateBulkToolbar();
    });

    document.getElementById('bulkTrashBtn').addEventListener('click', async () => {
        if (bulkSelectedIds.size === 0) return;

        const confirmMsg = currentFolder === 'trash' 
            ? "Seçilen mesajları KALICI olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!"
            : null;
            
        if (confirmMsg && !confirm(confirmMsg)) return;
        
        const btn = document.getElementById('bulkTrashBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor...';
        btn.disabled = true;

        try {
            const uid = currentUserData.id;
            const batch = writeBatch(db);

            for (const id of bulkSelectedIds) {
                const docRef = doc(db, "messages", id);
                if (currentFolder === 'trash') {
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        const newParticipants = (data.participants || []).filter(pid => pid !== uid);
                        if (newParticipants.length === 0) {
                            batch.delete(docRef);
                        } else {
                            batch.update(docRef, {
                                participants: newParticipants,
                                trashedBy: (data.trashedBy || []).filter(pid => pid !== uid)
                            });
                        }
                    }
                } else {
                    batch.update(docRef, { 
                        trashedBy: arrayUnion(uid), 
                        deletedAt: serverTimestamp() 
                    });
                }
            }

            await batch.commit();
            bulkSelectedIds.clear();
            updateBulkToolbar();
            resetDetailView();
            loadFolder(currentFolder);
        } catch (err) {
            console.error("Bulk trash error:", err);
            alert("Toplu silme sırasında hata oluştu.");
        } finally {
            btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Sil';
            btn.disabled = false;
        }
    });

    document.getElementById('bulkArchiveBtn').addEventListener('click', async () => {
        if (bulkSelectedIds.size === 0) return;
        
        const btn = document.getElementById('bulkArchiveBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor...';
        btn.disabled = true;

        try {
            const uid = currentUserData.id;
            const batch = writeBatch(db);

            for (const id of bulkSelectedIds) {
                const docRef = doc(db, "messages", id);
                batch.update(docRef, { 
                    archivedBy: arrayUnion(uid)
                });
            }

            await batch.commit();
            bulkSelectedIds.clear();
            updateBulkToolbar();
            resetDetailView();
            loadFolder(currentFolder);
        } catch (err) {
            console.error("Bulk archive error:", err);
            alert("Toplu arşivleme sırasında hata oluştu.");
        } finally {
            btn.innerHTML = '<i class="fa-solid fa-box-archive"></i> Arşivle';
            btn.disabled = false;
        }
    });

    document.getElementById('bulkCancelBtn').addEventListener('click', () => {
        bulkSelectedIds.clear();
        document.querySelectorAll('.bulk-checkbox').forEach(cb => cb.checked = false);
        document.querySelectorAll('.msg-item.bulk-selected').forEach(el => el.classList.remove('bulk-selected'));
        updateBulkToolbar();
    });
}

window.__toggleBulkItem = (checkboxElem) => {
    const isChecked = checkboxElem.checked;
    const docId = checkboxElem.getAttribute('data-id');
    const allIdsStr = checkboxElem.getAttribute('data-all-ids') || docId;
    const ids = allIdsStr.split(',');

    if (isChecked) {
        ids.forEach(id => bulkSelectedIds.add(id));
    } else {
        ids.forEach(id => bulkSelectedIds.delete(id));
    }
    
    updateBulkToolbar();
};

window.__toggleSubBulkItem = (checkboxElem) => {
    const isChecked = checkboxElem.checked;
    const docId = checkboxElem.getAttribute('data-id');
    
    if (isChecked) {
        bulkSelectedIds.add(docId);
    } else {
        bulkSelectedIds.delete(docId);
    }
    
    updateBulkToolbar();
};

function updateBulkToolbar() {
    const toolbar = document.getElementById('bulkToolbar');
    const countEl = document.getElementById('bulkCount');
    if (!toolbar || !countEl) return;
    
    // Parent checkbox indeterminate/checked sync
    const parentBoxes = document.querySelectorAll('.parent-bulk-checkbox');
    parentBoxes.forEach(pbox => {
        const allIds = (pbox.getAttribute('data-all-ids') || '').split(',');
        const selectedCount = allIds.filter(id => bulkSelectedIds.has(id)).length;
        
        if (selectedCount === 0) {
            pbox.checked = false;
            pbox.indeterminate = false;
        } else if (selectedCount === allIds.length) {
            pbox.checked = true;
            pbox.indeterminate = false;
        } else {
            pbox.checked = false;
            pbox.indeterminate = true;
        }
        
        // Sync sub-checkboxes visual state
        const docId = pbox.getAttribute('data-id');
        const subBoxes = document.querySelectorAll(`.sub-bulk-checkbox[data-parent-id="${docId}"]`);
        subBoxes.forEach(sub => {
            sub.checked = bulkSelectedIds.has(sub.getAttribute('data-id'));
        });
        
        // Parent msg-item background toggle
        const item = pbox.closest('.msg-item');
        if (item) {
            item.classList.toggle('bulk-selected', selectedCount > 0);
        }
    });

    const displayCount = bulkSelectedIds.size;

    countEl.textContent = `${displayCount} mesaj seçili`;
    
    if (displayCount > 0) {
        toolbar.classList.add('visible');
        toolbar.classList.remove('hidden');
    } else {
        toolbar.classList.remove('visible');
        // Delay hiding to allow animation
        setTimeout(() => {
            if (document.querySelectorAll('.msg-item .bulk-checkbox:checked').length === 0) {
                toolbar.classList.add('hidden');
            }
        }, 200);
    }

    // Sync select-all checkbox
    let totalIndividualIds = 0;
    const allParentBoxes = document.querySelectorAll('.parent-bulk-checkbox');
    allParentBoxes.forEach(pbox => {
        totalIndividualIds += (pbox.getAttribute('data-all-ids') || '').split(',').length;
    });

    const selectAll = document.getElementById('bulkSelectAll');
    if (selectAll && totalIndividualIds > 0) {
        selectAll.checked = displayCount === totalIndividualIds && displayCount > 0;
        selectAll.indeterminate = displayCount > 0 && displayCount < totalIndividualIds;
    }
}

// Quick Actions Implementation
const quickActionsStyle = document.createElement('style');
quickActionsStyle.textContent = `
    .msg-item:hover .msg-meta-side { opacity: 0; pointer-events: none; }
    .msg-item:hover .msg-quick-actions { display: flex !important; }
`;
document.head.appendChild(quickActionsStyle);

window.__quickTrash = async (docId, allIdsString, event) => {
    event.stopPropagation();
    const ids = allIdsString.split(',');
    
    const confirmMsg = currentFolder === 'trash' 
        ? "Seçilen mesajları KALICI olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!"
        : null;
        
    if (confirmMsg && !confirm(confirmMsg)) return;

    try {
        const uid = currentUserData.id;
        const batch = writeBatch(db);
        
        for (const id of ids) {
            const docRef = doc(db, "messages", id);
            if (currentFolder === 'trash') {
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    const newParticipants = (data.participants || []).filter(pid => pid !== uid);
                    if (newParticipants.length === 0) {
                        batch.delete(docRef);
                    } else {
                        batch.update(docRef, {
                            participants: newParticipants,
                            trashedBy: (data.trashedBy || []).filter(pid => pid !== uid)
                        });
                    }
                }
            } else {
                batch.update(docRef, { trashedBy: arrayUnion(uid), deletedAt: serverTimestamp() });
            }
        }
        await batch.commit();
        // Remove locally from UI if present
        ids.forEach(id => bulkSelectedIds.delete(id));
        updateBulkToolbar();
        loadFolder(currentFolder);
    } catch (err) {
        console.error(err);
        alert("Silme sırasında hata oluştu.");
    }
};

window.__quickArchive = async (docId, allIdsString, event) => {
    event.stopPropagation();
    const ids = allIdsString.split(',');
    try {
        const uid = currentUserData.id;
        const batch = writeBatch(db);
        ids.forEach(id => {
            const docRef = doc(db, "messages", id);
            batch.update(docRef, { archivedBy: arrayUnion(uid) });
        });
        await batch.commit();
        // Remove locally from UI if present
        ids.forEach(id => bulkSelectedIds.delete(id));
        updateBulkToolbar();
        loadFolder(currentFolder);
    } catch (err) {
        console.error(err);
        alert("Arşivleme sırasında hata oluştu.");
    }
};

window.__toggleGroupAccordion = (event, docId) => {
    // Prevent the click from propagating if they click the accordion background
    if (event.target.closest('.sub-msg-item') || event.target.closest('.bulk-checkbox-wrap')) {
        return;
    }
    
    const acc = document.getElementById('accordion_' + docId);
    if (acc) {
        if (acc.style.display === 'none' || acc.classList.contains('hidden')) {
            acc.style.display = 'block';
            acc.classList.remove('hidden');
        } else {
            acc.style.display = 'none';
            acc.classList.add('hidden');
        }
    }
};

window.__removeUrgency = async (threadId, event) => {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!confirm("Bu yazışmanın aciliyeti sona erdi mi? (İşlem Tamamlandı)")) return;

    try {
        const docRef = doc(db, "messages", threadId);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return;
        
        const currentData = docSnap.data();
        const replies = currentData.replies || [];
        
        replies.push({
            authorId: "SYSTEM",
            authorName: "Sistem Mesajı",
            text: `✅ <strong>${currentUserData.name} ${currentUserData.surname || ''}</strong> bu yazışmanın <strong>"Acil"</strong> durumunu kaldırdı (İşlem Tamamlandı).`,
            timestamp: new Date().toISOString(),
            isSystem: true
        });

        await updateDoc(docRef, {
            isUrgent: false,
            replies: replies,
            timestamp: serverTimestamp()
        });
        
    } catch (err) {
        console.error("Aciliyet kaldırma hatası:", err);
        alert("Aciliyet güncellenirken hata oluştu.");
    }
};


