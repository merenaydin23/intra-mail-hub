import { 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, getDocs 
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

    window.__selectReceiver = (id, name, type, region = "", company = "", category = "", subRole = "") => {
        if (selectedReceivers.find(r => r.id === id)) {
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

        selectedReceivers.push({ id, name, type, region, company, category, subRole });
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

    function renderReceivers() {
        if (!receiversList) return;
        receiversList.innerHTML = selectedReceivers.map((r, index) => {
            const regClass = r.type === 'bulk' ? 'bulk' : getRegionClass(r.region);
            const unitLabel = r.type === 'bulk' ? 'GRUP' : (r.category === 'factory' ? 'FB' : (r.category === 'regional' ? 'BLG' : 'BYI'));
            
            return `
                <div class="receiver-chip ${regClass}" data-index="${index}" data-cat="${r.category || ''}" title="${r.company || ''} ${r.region ? `(${r.region})` : ''}">
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
                window.__removeReceiver(index);
            };

            const expandBtn = chip.querySelector('.expand-trigger');
            if (expandBtn) {
                expandBtn.onclick = (e) => {
                    e.stopPropagation();
                    window.__expandBulk(index);
                };
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
                    <div class="search-result-item" onclick="window.__selectReceiver('${u.id}', '${u.name} ${u.surname || ''}', 'individual', '${u.region || ''}', '${u.company || ''}', '${u.category || ''}', '${u.subRole || ''}')">
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

        const promises = Array.from(finalRecipients.entries()).map(async ([tid, tdata]) => {
            return addDoc(collection(db, "messages"), {
                senderId: currentUserData.id,
                senderName: `${currentUserData.name} ${currentUserData.surname || ''}`,
                receiverId: tid,
                receiverName: tdata.name,
                participants: [currentUserData.id, tid],
                subject: subject,
                content: body,
                lastMessage: body,
                status: 'active',
                isRead: false,
                timestamp: serverTimestamp(),
                attachmentUrl,
                attachmentName
            });
        });

        await Promise.all(promises);
        alert(`${finalRecipients.size} farklı alıcıya mesaj başarıyla gönderildi!`);
        
        if (fileInput) fileInput.value = '';
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
