import { getAuditLogs } from "../services/audit-service.js";
import { getAllMessages } from "../services/message-service.js";
import { renderAuditFeed, renderMessageFeed } from "../ui/renderers.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

export async function initMessagesPage() {
    // Audit logs for the right side
    const logs = await getAuditLogs(40);
    renderAuditFeed(document.getElementById("auditFeed"), logs);

    // Actual messages for the left side
    const messages = await getAllMessages(100);
    renderMessageFeed(document.getElementById("messageFeed"), messages);

    // Stats Calculation
    updateStats(messages);

    // CSV Export & Timer Logic
    const exportBtn = document.getElementById("btnExportCSV");
    if (exportBtn) {
        exportBtn.disabled = true; // Varsayılan olarak kapalı
        exportBtn.title = "Rapor sadece 16:50 - 17:00 saatleri arasında alınabilir.";
        exportBtn.style.opacity = "0.5";
        exportBtn.style.cursor = "not-allowed";

        const checkTime = () => {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes();
            
            // 16:50 - 17:00 arası kontrolü
            if (hours === 16 && minutes >= 50 && minutes < 60) {
                exportBtn.disabled = false;
                exportBtn.style.opacity = "1";
                exportBtn.style.cursor = "pointer";
                exportBtn.title = "Günlük raporu şimdi indirebilirsiniz.";
            } else {
                exportBtn.disabled = true;
                exportBtn.style.opacity = "0.5";
                exportBtn.style.cursor = "not-allowed";
            }
        };

        checkTime();
        setInterval(checkTime, 30000); // 30 saniyede bir kontrol et

        exportBtn.addEventListener("click", () => {
            if (!exportBtn.disabled) exportToCSV(messages);
        });
    }
}

function exportToCSV(messages) {
    const today = new Date().toLocaleDateString('tr-TR');
    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel
    csvContent += "Tarih;Gönderen;Alıcı;Konu;İçerik\n";

    messages.forEach(m => {
        const date = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleString('tr-TR') : '-';
        const sender = m.senderName || '-';
        const receiver = m.receiverName || '-';
        const subject = (m.subject || '-').replace(/;/g, ',');
        const content = (m.content || '-').replace(/;/g, ',').replace(/\n/g, ' ');
        
        csvContent += `${date};${sender};${receiver};${subject};${content}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Bellona_Gunluk_Rapor_${today}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function updateStats(messages) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMessages = messages.filter(m => {
        const ts = m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp);
        return ts >= today;
    });

    document.getElementById("todayCount").textContent = todayMessages.length;

    // Region Stats (requires user mapping)
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const userRegions = {};
        usersSnap.forEach(doc => {
            userRegions[doc.id] = doc.data().region || "Bilinmiyor";
        });

        const regionCounts = {};
        messages.forEach(m => {
            const reg = userRegions[m.senderId] || "Bilinmiyor";
            if (reg !== "Bilinmiyor") {
                regionCounts[reg] = (regionCounts[reg] || 0) + 1;
            }
        });

        let topRegion = "Veri Yok";
        let maxCount = 0;
        for (const [reg, count] of Object.entries(regionCounts)) {
            if (count > maxCount) {
                maxCount = count;
                topRegion = reg;
            }
        }

        document.getElementById("activeRegion").textContent = topRegion;
        
        // Intensity logic
        const intensityEl = document.getElementById("liveIntensity");
        if (todayMessages.length > 20) {
            intensityEl.textContent = "Yüksek";
            intensityEl.style.color = "#ef4444";
        } else if (todayMessages.length > 5) {
            intensityEl.textContent = "Orta";
            intensityEl.style.color = "#f59e0b";
        } else {
            intensityEl.textContent = "Düşük";
            intensityEl.style.color = "#10b981";
        }

    } catch (err) {
        console.error("Stats error:", err);
    }
}
