import { 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
  ref, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { auth, db, storage } from './firebase/config.js';
import { refineMessageWithAI } from './services/ai-service.js';

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
let currentFolder = 'inbox';
let forwardOriginalMessageId = null;
let forwardOriginalSenderId = null;

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
  loadFolder(currentFolder);
});

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
            // Inbox (Gelen Kutusu): Dahil olduğum tüm aktif mesajlar
            q = query(baseRef, where("participants", "array-contains", currentUserData.id), where("status", "==", "active"));
        }

        onSnapshot(q, (snapshot) => {
            let filteredDocs = [...snapshot.docs];

            if (folder === 'inbox') {
                filteredDocs = filteredDocs.filter(doc => {
                    const m = doc.data();
                    if (m.senderId === currentUserData.id) {
                        // I am the sender of this message
                        if (!m.replies || m.replies.length === 0) {
                            // No replies yet, so this belongs only in "Sent", not in Gelen Kutusu
                            return false;
                        }
                        // Only show in Gelen Kutusu if someone else replied to it
                        return m.replies.some(r => r.authorId !== currentUserData.id);
                    }
                    // I am the receiver, so it definitely belongs in Gelen Kutusu
                    return true;
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
    const docSnap = await getDoc(doc(db, "messages", id));
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    activeThreadData = data;

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
    const repliesBody = document.getElementById('detailBody');
    if (data.replies && data.replies.length > 0) {
        let repliesHtml = '<div class="replies-section" style="margin-top:2rem; border-top:1px solid var(--border); padding-top:1rem;">';
        repliesHtml += '<h4 style="font-size:0.8rem; color:var(--text-muted); margin-bottom:1rem; text-transform:uppercase;">Yanıtlar</h4>';
        data.replies.forEach(r => {
            const rDate = new Date(r.timestamp).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
            repliesHtml += `
                <div class="reply-item" style="margin-bottom:1.5rem; background:var(--bg-app); padding:1rem; border-radius:12px; border:1px solid var(--border);">
                    <div class="reply-header" style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.85rem;">
                        <span style="font-weight:700; color:var(--primary);"><i class="fa-solid fa-reply"></i> ${r.authorName}</span>
                        <span style="color:var(--text-muted);">${rDate}</span>
                    </div>
                    <div class="reply-text" style="line-height:1.6; color:var(--text-main); font-size:0.95rem;">${r.text}</div>
                </div>
            `;
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

    // Dynamic Forward Button Addition
    const btnGroup = document.querySelector('.meta-row .btn-group') || document.querySelector('.action-row .btn-group');
    if (btnGroup) {
        const existingFwd = document.getElementById('btnForward');
        if (existingFwd) existingFwd.remove();

        const fwdBtn = document.createElement('button');
        fwdBtn.id = 'btnForward';
        fwdBtn.className = 'btn-action';
        fwdBtn.title = 'İlet / Paylaş';
        fwdBtn.style.background = 'var(--primary-soft)';
        fwdBtn.style.color = 'var(--primary)';
        fwdBtn.style.marginLeft = '4px';
        fwdBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i>';
        fwdBtn.addEventListener('click', () => {
            handleForwardMessage(id, data);
        });
        btnGroup.appendChild(fwdBtn);
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
                originalSenderId: forwardOriginalSenderId || null
            });
        });

        await batch.commit();
        alert(`${finalRecipients.size} farklı alıcıya mesaj başarıyla gönderildi!`);
        
        // Reset forward state
        forwardOriginalMessageId = null;
        forwardOriginalSenderId = null;
        
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
