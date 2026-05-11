import { collection, query, onSnapshot, where, addDoc, getDocs, serverTimestamp, limit, orderBy, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, auth } from "../../firebase/config.js";
import { showToast } from "../ui/notifications.js";

const CHART_PALETTE = {
    brand: "#10b981", 
    accent: "#64748b",
    slate: "#1e293b",
    emerald: ["#059669", "#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5"]
};

let activeCharts = {};

// Register Plugins
if (typeof Chart !== 'undefined') {
    Chart.register({
        id: 'centerText',
        beforeDraw: (chart) => {
            if (chart.config.type !== 'doughnut') return;
            const config = chart.options.plugins?.centerText;
            if (!config || !config.display) return;
            const { ctx, chartArea: { top, left, width, height } } = chart;
            ctx.save();
            const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 28px "Plus Jakarta Sans"';
            ctx.fillStyle = '#1e293b';
            ctx.fillText(total.toString(), left + width / 2, top + height / 2 - 8);
            ctx.font = '800 11px "Inter"';
            ctx.fillStyle = '#64748b';
            ctx.fillText(config.label || "TOPLAM", left + width / 2, top + height / 2 + 18);
            ctx.restore();
        }
    });
}

export async function initDashboardPage() {
    setupRealtimeDashboard();

    // Manual Bday Trigger
    document.getElementById("upcomingBirthdayList")?.addEventListener("click", async (e) => {
        const btn = e.target.closest(".bday-send-btn");
        if (btn && !btn.disabled) {
            const { id, name, surname } = btn.dataset;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                // Fetch User Data first
                const userSnap = await getDoc(doc(collection(db, "users"), id));
                const userData = userSnap.data() || {};

                // 1. Check for Duplicate (By Subject/Receiver - avoids composite index)
                const today = new Date();
                const title = getBdayTitle(userData);
                const msgSubject = `Mutlu Yıllar ${name} ${title}! 🎂`;
                
                const checkQ = query(
                    collection(db, "messages"),
                    where("receiverId", "==", id),
                    where("subject", "==", msgSubject),
                    limit(5)
                );
                const checkSnap = await getDocs(checkQ);
                let alreadyHandled = false;
                checkSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.timestamp?.toDate().toDateString() === today.toDateString()) {
                        alreadyHandled = true;
                    }
                });

                if (alreadyHandled) {
                    showToast("Bu personele bugün zaten tebrik iletildi.", "info");
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> Gönderildi';
                    btn.classList.add("sent");
                    return;
                }

                // 2. Get Real Admin Info
                const adminId = auth.currentUser?.uid;
                if (!adminId) throw new Error("Admin oturumu geçersiz.");
                const adminDoc = await getDoc(doc(db, "users", adminId));
                const adminData = adminDoc.data() || { name: "Bellona", surname: "Admin" };
                const adminFullName = `${adminData.name} ${adminData.surname}`;

                // 3. Determine Content
                const bdayContent = `Doğum Gününüz Kutlu Olsun ${name} ${title}! 🌿\n\nDeğerli çalışma arkadaşımız ${name} ${surname}, Bellona ailesi olarak bugün seninle birlikte yeni bir yaşın heyecanını paylaşıyoruz. Ailenizle beraber sağlıklı, uzun ve başarı dolu bir ömür dileriz. Nice mutlu senelere! 🎈\n\nBellona Ailesi`;

                await addDoc(collection(db, "messages"), {
                    senderId: adminId,
                    senderName: adminFullName,
                    receiverId: id,
                    receiverName: `${name} ${surname}`,
                    participants: [adminId, id],
                    subject: `Mutlu Yıllar ${name} ${title}! 🎂`,
                    content: bdayContent,
                    lastMessage: `Doğum Gününüz Kutlu Olsun ${name} ${title}! 🌿`,
                    timestamp: serverTimestamp(),
                    status: "active",
                    isRead: false,
                    type: "birthday_manual"
                });

                btn.innerHTML = '<i class="fa-solid fa-check"></i> İletildi';
                btn.classList.add("sent");
                showToast("Tebrik mesajı başarıyla gönderildi ve kaydedildi.", "success");
            } catch (err) {
                console.error("Manual Bday Error:", err);
                btn.disabled = false;
                btn.innerHTML = "Hata!";
                showToast("Mesaj gönderilemedi: " + err.message, "error");
            }
        }
    });
}

function getBdayTitle(user) {
    if (user.gender === "female") return "Hanım";
    if (user.gender === "male") return "Bey";
    return "Bey";
}

function setupRealtimeDashboard() {
    const qUsers = query(collection(db, "users"), where("role", "!=", "admin"));
    onSnapshot(qUsers, (snapshot) => {
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboardUI(users);
        // We don't auto-send here to give admin control, or we can keep it as a background task
        checkAndSendBirthdayMessages(users.filter(u => u.isActive !== false));
    });

    const qMessages = query(collection(db, "messages"), orderBy("timestamp", "desc"), limit(1000));
    onSnapshot(qMessages, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        buildMessageCharts(messages);
    });
}

function updateDashboardUI(users) {
    const activeUsers = users.filter(u => u.isActive !== false);
    const total = activeUsers.length;
    
    const factory = activeUsers.filter(u => u.category === "factory");
    const regional = activeUsers.filter(u => u.category === "regional");
    const local = activeUsers.filter(u => u.category === "local");
    const managers = activeUsers.filter(u => u.subRole === "manager");
    const employees = activeUsers.filter(u => u.subRole === "employee");

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    setEl("statTotal", total);
    setEl("statFactory", factory.length);
    setEl("statRegional", regional.length);
    setEl("statLocal", local.length);
    
    setHtml("statTotalSub", `${managers.length} Yönetici · ${employees.length} Çalışan`);
    setHtml("statFactorySub", `${[...new Set(factory.map(u => u.department).filter(Boolean))].length} departman`);
    setHtml("statRegionalSub", `${[...new Set(regional.map(u => u.company).filter(Boolean))].length} firma`);
    setHtml("statLocalSub", `${[...new Set(local.map(u => u.company).filter(Boolean))].length} mağaza`);

    // Region Table
    const regionStats = {};
    activeUsers.forEach(u => { if (u.region) regionStats[u.region] = (regionStats[u.region] || 0) + 1; });
    const sortedRegions = Object.entries(regionStats).sort((a, b) => b[1] - a[1]);
    
    const regionBody = document.getElementById("regionTableBody");
    if (regionBody) {
        regionBody.innerHTML = sortedRegions.map(([reg, count]) => {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
            return `<tr>
                <td style="padding:0.75rem 0; font-weight:700; color:#1e293b; font-size:0.85rem; min-width:110px;">${reg}</td>
                <td style="padding:0.75rem 0; color:#64748b; font-weight:600; text-align:center; font-size:0.85rem;">${count}</td>
                <td style="padding:0.75rem 0; text-align:right;">
                    <span style="background:#f1f5f9; color:#475569; font-weight:800; font-size:0.7rem; padding:4px 10px; border-radius:6px;">${pct}%</span>
                </td>
            </tr>`;
        }).join("");
    }

    if (typeof Chart !== "undefined") {
        buildCharts({ sortedRegions, factory, regional, local, users: activeUsers });
    }
    renderBirthdays(activeUsers);
    renderInsights(activeUsers);
}

function buildCharts(data) {
    const destroy = (id) => { if (activeCharts[id]) activeCharts[id].destroy(); };
    const baseOpts = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#1e293b', padding: 12, cornerRadius: 8 }
        }
    };

    // Charts
    destroy("regionChart");
    activeCharts["regionChart"] = new Chart(document.getElementById("regionChart"), {
        type: 'doughnut', data: { labels: data.sortedRegions.map(r => r[0]), datasets: [{ data: data.sortedRegions.map(r => r[1]), backgroundColor: CHART_PALETTE.emerald, borderWidth: 0, cutout: '75%' }] },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, centerText: { display: true, label: "BÖLGE" } } }
    });

    destroy("categoryChart");
    activeCharts["categoryChart"] = new Chart(document.getElementById("categoryChart"), {
        type: 'doughnut', data: { labels: ["Fabrika", "Bölge", "Yerel"], datasets: [{ data: [data.factory.length, data.regional.length, data.local.length], backgroundColor: ['#10b981', '#6366f1', '#f59e0b'], borderWidth: 0, cutout: '75%' }] },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, centerText: { display: true, label: "KATEGORİ" } } }
    });

    destroy("roleChart");
    const managers = data.users.filter(u => u.subRole === "manager").length;
    const employees = data.users.filter(u => u.subRole === "employee").length;
    activeCharts["roleChart"] = new Chart(document.getElementById("roleChart"), {
        type: 'doughnut', data: { labels: ["Yönetici", "Çalışan"], datasets: [{ data: [managers, employees], backgroundColor: ['#6366f1', '#e2e8f0'], borderWidth: 0, cutout: '75%' }] },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, centerText: { display: true, label: "ROL" } } }
    });

    destroy("companyChart");
    const coStats = {};
    data.users.forEach(u => { if (u.company) coStats[u.company] = (coStats[u.company] || 0) + 1; });
    const sortedCos = Object.entries(coStats).sort((a,b) => b[1] - a[1]).slice(0, 10);
    activeCharts["companyChart"] = new Chart(document.getElementById("companyChart"), {
        type: 'bar',
        data: { labels: sortedCos.map(c => c[0]), datasets: [{ label: 'Personel', data: sortedCos.map(c => c[1]), backgroundColor: '#10b981', borderRadius: 12, barThickness: 40 }] },
        options: { ...baseOpts, scales: { y: { grid: { color: 'rgba(0,0,0,0.02)', drawBorder: false }, ticks: { font: { weight: '700' } } }, x: { grid: { display: false }, ticks: { font: { size: 10, weight: '700' } } } } }
    });

    destroy("deptChart");
    const deptStats = {};
    data.users.forEach(u => { if (u.department) deptStats[u.department] = (deptStats[u.department] || 0) + 1; });
    const sortedDepts = Object.entries(deptStats).sort((a,b) => b[1] - a[1]).slice(0, 6);
    activeCharts["deptChart"] = new Chart(document.getElementById("deptChart"), {
        type: 'bar', data: { labels: sortedDepts.map(d => d[0]), datasets: [{ label: 'Personel', data: sortedDepts.map(d => d[1]), backgroundColor: '#64748b', borderRadius: 6, barThickness: 14 }] },
        options: { ...baseOpts, indexAxis: 'y', scales: { x: { grid: { display: false }, ticks: { display: false } }, y: { grid: { display: false }, ticks: { font: { weight: '700' } } } } }
    });
}

function buildMessageCharts(messages) {
    const now = new Date();
    now.setHours(0,0,0,0);
    const last5Days = [];
    for (let i = 4; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        last5Days.push(d);
    }

    const densityData = last5Days.map(targetDay => {
        const targetTime = targetDay.getTime();
        return messages.filter(m => {
            const ts = m.timestamp?.toDate ? m.timestamp.toDate() : null;
            if (!ts) return false;
            const msgDate = new Date(ts);
            msgDate.setHours(0,0,0,0);
            return msgDate.getTime() === targetTime;
        }).length;
    });

    const canvas = document.getElementById("messageDensityChart");
    if (canvas) {
        if (activeCharts["msgDensity"]) activeCharts["msgDensity"].destroy();
        activeCharts["msgDensity"] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: last5Days.map(d => d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })),
                datasets: [{ data: densityData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.08)', fill: true, tension: 0.45, pointRadius: 6, pointBackgroundColor: '#fff', pointBorderColor: '#10b981', pointBorderWidth: 3 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        grid: { color: 'rgba(0,0,0,0.03)' }, 
                        suggestedMax: Math.max(...densityData) + 2,
                        ticks: { stepSize: 1, font: { weight: '700' } } 
                    }, 
                    x: { grid: { display: false }, ticks: { font: { weight: '700' } } } 
                }
            }
        });
    }

    // Leaderboard
    const senderStats = {};
    messages.forEach(m => { if (m.senderName && m.senderName !== "BELLONA MERKEZ") senderStats[m.senderName] = (senderStats[m.senderName] || 0) + 1; });
    const topSenders = Object.entries(senderStats).sort((a,b) => b[1] - a[1]).slice(0, 5);

    const activeList = document.getElementById("activeDealersList");
    if (activeList) {
        if (!topSenders.length) activeList.innerHTML = '<p style="text-align:center; color:#94a3b8;">Veri yok.</p>';
        else {
            activeList.innerHTML = topSenders.map(([name, count], index) => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem; background:#fff; border:1px solid #f1f5f9; border-radius:18px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.02);">
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <div style="width:32px; height:32px; background:#f1f5f9; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.8rem; color:#10b981;">${index+1}</div>
                        <div style="font-weight:700; font-size:0.9rem; color:#1e293b;">${name}</div>
                    </div>
                    <div style="background:#ecfdf5; color:#059669; padding:4px 12px; border-radius:20px; font-size:0.75rem; font-weight:800;">${count} Mesaj</div>
                </div>
            `).join("");
        }
    }
}

function renderInsights(users) {
    const regional = users.filter(u => u.category === "regional");
    const regCos = {};
    regional.forEach(u => { if (u.company) regCos[u.company] = (regCos[u.company] || 0) + 1; });
    const sortedReg = Object.entries(regCos).sort((a,b) => b[1] - a[1]);
    
    const busyEl = document.getElementById("insightBusiestRegional");
    if (busyEl) {
        if (sortedReg.length) {
            const [name, count] = sortedReg[0];
            busyEl.innerHTML = `
                <div style="font-size:0.7rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:0.75rem; letter-spacing:0.05em;">Lider Bölge Bayisi</div>
                <div style="font-size:1.25rem; font-weight:800; color:#1e293b; line-height:1.2;">${name}</div>
                <div style="display:flex; align-items:center; gap:8px; margin-top:1rem;">
                    <div style="width:8px; height:8px; background:#10b981; border-radius:50%;"></div>
                    <span style="font-size:0.9rem; color:#10b981; font-weight:700;">${count} Aktif Personel</span>
                </div>`;
        } else busyEl.innerHTML = "Veri yok.";
    }

    const sortedAge = [...users].filter(u => u.birthDate).sort((a,b) => new Date(a.birthDate) - new Date(b.birthDate));
    const oldEl = document.getElementById("insightOldest");
    if (oldEl) {
        if (sortedAge.length) {
            const u = sortedAge[0];
            const age = new Date().getFullYear() - new Date(u.birthDate).getFullYear();
            oldEl.innerHTML = `
                <div style="font-size:0.7rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:0.75rem; letter-spacing:0.05em;">Şirketin Duayeni</div>
                <div style="font-size:1.25rem; font-weight:800; color:#1e293b; line-height:1.2;">${u.name} ${u.surname}</div>
                <div style="display:flex; align-items:center; gap:8px; margin-top:1rem;">
                    <div style="width:8px; height:8px; background:#6366f1; border-radius:50%;"></div>
                    <span style="font-size:0.9rem; color:#6366f1; font-weight:700;">${age} Yaşında</span>
                </div>`;
        } else oldEl.innerHTML = "Veri yok.";
    }
}

function renderBirthdays(users) {
    const today = new Date();
    const upcoming = users.filter(u => {
        if (!u.birthDate) return false;
        const bday = new Date(u.birthDate);
        const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
        if (thisYear < today) thisYear.setFullYear(today.getFullYear() + 1);
        const diffDays = Math.ceil((thisYear - today) / (1000 * 60 * 60 * 24));
        u.daysRemaining = diffDays;
        return diffDays <= 30;
    }).sort((a, b) => a.daysRemaining - b.daysRemaining);

    const badge = document.getElementById("statBirthdays");
    if (badge) badge.textContent = upcoming.length;
    
    const list = document.getElementById("upcomingBirthdayList");
    if (!list) return;
    if (!upcoming.length) {
        list.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:3rem;">Yakın zamanda doğum günü yok.</p>';
        return;
    }

    list.innerHTML = upcoming.map(u => {
        const isToday = u.daysRemaining === 0;
        const isTomorrow = u.daysRemaining === 1;
        const isActionable = isToday || isTomorrow;
        
        const actionBtn = isActionable 
            ? `<button class="bday-send-btn" data-id="${u.id}" data-name="${u.name}" data-surname="${u.surname}" 
                style="background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; padding:8px 16px; border-radius:12px; font-size:0.75rem; font-weight:800; cursor:pointer; transition:0.2s; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-paper-plane"></i> Tebrik Et
               </button>`
            : `<div style="background:#f1f5f9; color:#64748b; padding:6px 12px; border-radius:10px; font-size:0.75rem; font-weight:800;">${u.daysRemaining} Gün</div>`;

        return `
            <div style="display:flex; align-items:center; gap:1.25rem; padding:1.25rem; background:white; border:1px solid #f1f5f9; border-radius:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.02); transition:0.2s;">
                <div style="width:48px; height:48px; background:#fdf4ff; border-radius:14px; display:flex; align-items:center; justify-content:center; color:#a21caf; font-weight:800; font-size:1rem; border:1px solid rgba(162,28,175,0.1);">${u.name[0]}${u.surname[0]}</div>
                <div style="flex:1;">
                    <div style="font-weight:800; font-size:0.95rem; color:#1e293b; margin-bottom:2px;">${u.name} ${u.surname}</div>
                    <div style="font-size:0.8rem; color:#94a3b8; font-weight:600;">${u.company || "Birim Bilgisi Yok"}</div>
                    ${isToday ? '<div style="color:#e11d48; font-size:0.7rem; font-weight:900; margin-top:4px; text-transform:uppercase; letter-spacing:0.05em;">🎂 Bugün Kutlanıyor</div>' : ''}
                    ${isTomorrow ? '<div style="color:#a21caf; font-size:0.7rem; font-weight:900; margin-top:4px; text-transform:uppercase; letter-spacing:0.05em;">🎉 Yarın Kutlanacak</div>' : ''}
                </div>
                ${actionBtn}
            </div>
        `;
    }).join("");
}

async function checkAndSendBirthdayMessages(users) {
    const today = new Date();
    const todayStr = `${today.getMonth() + 1}-${today.getDate()}`;

    for (const user of users) {
        if (!user.birthDate) continue;
        const bday = new Date(user.birthDate);
        if (`${bday.getMonth() + 1}-${bday.getDate()}` === todayStr) {
            const title = user.gender === "female" ? "Hanım" : "Bey";
            const msgSubject = `Mutlu Yıllar ${user.name} ${title}! 🎂`;
            const q = query(collection(db, "messages"), where("receiverId", "==", user.id), where("subject", "==", msgSubject), limit(1));
            const snap = await getDocs(q);
            let sent = false;
            snap.forEach(d => { if (d.data().timestamp?.toDate().toDateString() === today.toDateString()) sent = true; });
            if (!sent) {
                await addDoc(collection(db, "messages"), {
                    senderId: "system_bellona", senderName: "Bellona İK",
                    receiverId: user.id, receiverName: `${user.name} ${user.surname}`,
                    participants: ["system_bellona", user.id],
                    subject: msgSubject, content: `Doğum Gününüz Kutlu Olsun ${user.name} ${title}! 🌿\n\nNice mutlu senelere!`,
                    timestamp: serverTimestamp(), status: "active", isRead: false, type: "birthday_auto"
                });
            }
        }
    }
}
