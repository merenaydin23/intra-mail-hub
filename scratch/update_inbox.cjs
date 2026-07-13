const fs = require('fs');
const path = require('path');

const filePath = 'c:/Users/HP/Desktop/intra-mail-hub-main/web/js_files/inbox.js';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add "scheduled" folder to loadMessages
content = content.replace(
    /\} else if \(folder === 'sent'\) \{\s*filteredDocs = filteredDocs\.filter\(doc => doc\.data\(\)\.senderId === currentUserData\.id\);\s*\}/,
    `} else if (folder === 'sent') {
                filteredDocs = filteredDocs.filter(doc => doc.data().senderId === currentUserData.id && (!doc.data().scheduledFor || doc.data().scheduledFor <= new Date().toISOString()));
            } else if (folder === 'scheduled') {
                filteredDocs = filteredDocs.filter(doc => doc.data().senderId === currentUserData.id && doc.data().scheduledFor && doc.data().scheduledFor > new Date().toISOString());
            }`
);

// 2. Handle quick time buttons and default datetime
const quickButtonsLogic = `
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
`;

content = content.replace(
    /const composeForm = document\.getElementById\('composeForm'\);/,
    `${quickButtonsLogic}\n    const composeForm = document.getElementById('composeForm');`
);

// 3. Edit button logic for scheduled messages
const editLogic = `
    const btnEditScheduled = document.getElementById('btnEditScheduled');
    if (btnEditScheduled && currentFolder === 'scheduled') {
        btnEditScheduled.classList.remove('hidden');
        btnEditScheduled.onclick = async () => {
            const newText = prompt("Zamanlanmış mesaj içeriğini düzenleyin:", data.content);
            if (newText !== null && newText.trim() !== "") {
                try {
                    const docRef = doc(db, "messages", id);
                    await updateDoc(docRef, { content: newText, lastMessage: newText });
                    alert("Zamanlanmış mesaj güncellendi!");
                    document.getElementById('detailBody').innerHTML = newText;
                } catch(e) {
                    alert("Güncelleme hatası.");
                    console.error(e);
                }
            }
        };
    } else if (btnEditScheduled) {
        btnEditScheduled.classList.add('hidden');
    }
`;

content = content.replace(
    /if \(data\.receiverId === currentUserData\.id && data\.isRead === false\) \{/,
    `${editLogic}\n        if (data.receiverId === currentUserData.id && data.isRead === false) {`
);

// 4. Update the folder name header
content = content.replace(
    /const folderNames = \{\s*inbox: "Gelen Kutusu",\s*sent: "G\u00f6nderilenler",\s*archive: "Ar\u015fiv",\s*trash: "\u00c7\u00f6p Kutusu"\s*\};/,
    `const folderNames = {
        inbox: "Gelen Kutusu",
        sent: "Gönderilenler",
        scheduled: "Zamanlanmış",
        archive: "Arşiv",
        trash: "Çöp Kutusu"
    };`
);

fs.writeFileSync(filePath, content);
console.log("Updated inbox.js");
