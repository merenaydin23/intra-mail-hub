import { collection, query, onSnapshot, where, addDoc, getDocs, serverTimestamp, limit, orderBy, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, auth } from "../../firebase/config.js";

const CHART_PALETTE = {
    // Ultra-Premium Vibrant Palette
    brand: "#10b981",
    mint: "#f0fdf4",
    indigo: "#6366f1",
    rose: "#f43f5e",
    slate: ["#0f172a", "#1e293b", "#334155", "#475569", "#64748b"],
    // Multi-color vibrant gradient
    emerald: ["#10b981", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef"]
};

let activeCharts = {};

const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: (chart) => {
        const { ctx, options } = chart;
        const config = options.plugins?.centerText;
        if (!config || !config.display) return;

        const { top, left, width, height } = chart.chartArea;
        ctx.save();
        
        const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        const text = total.toString();
        const label = config.label || "TOPLAM";
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw Number
        ctx.font = 'bold 28px "Plus Jakarta Sans"';
        ctx.fillStyle = '#1e293b';
        ctx.fillText(text, left + width / 2, top + height / 2 - 8);
        
        // Draw Label
        ctx.font = '800 11px "Inter"';
        ctx.fillStyle = '#64748b';
        ctx.fillText(label, left + width / 2, top + height / 2 + 18);
        ctx.restore();
    }
};

const dataLabelsPlugin = {
    id: 'dataLabels',
    afterDatasetsDraw: (chart) => {
        const { ctx, data, options } = chart;
        const config = options.plugins?.dataLabels;
        if (!config || !config.display) return;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = 'bold 11px "Inter"';
        ctx.fillStyle = '#475569';

        chart.getDatasetMeta(0).data.forEach((bar, index) => {
            const value = data.datasets[0].data[index];
            const isHorizontal = options.indexAxis === 'y';
            if (isHorizontal) {
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(value, bar.x + 8, bar.y);
            } else {
                ctx.fillText(value, bar.x, bar.y - 8);
            }
        });
        ctx.restore();
    }
};

// Global Registration
if (typeof Chart !== 'undefined') {
    Chart.register(centerTextPlugin, dataLabelsPlugin);
}

import { showToast } from "../ui/notifications.js";

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

function setupRealtimeDashboard() {
    const q = query(collection(db, "users"), where("role", "!=", "admin"));
    onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const activeUsers = users.filter(u => u.isActive !== false);
        updateDashboardUI(users);
        checkAndSendBirthdayMessages(activeUsers);
    });
}

function getBdayTitle(user) {
    if (user.gender === "female") return "Hanım";
    if (user.gender === "male") return "Bey";
    return "Bey";
}

async function checkAndSendBirthdayMessages(users) {
    const today = new Date();
    const todayStr = `${today.getMonth() + 1}-${today.getDate()}`;

    for (const user of users) {
        if (!user.birthDate) continue;
        const bday = new Date(user.birthDate);
        const bdayStr = `${bday.getMonth() + 1}-${bday.getDate()}`;

        if (todayStr === bdayStr) {
            const title = getBdayTitle(user);
            const msgSubject = `Mutlu Yıllar ${user.name} ${title}! 🎂`;
            
            const msgQ = query(
                collection(db, "messages"),
                where("receiverId", "==", user.id),
                where("subject", "==", msgSubject),
                limit(1)
            );
            
            const existing = await getDocs(msgQ);
            let alreadySentToday = false;
            existing.forEach(doc => {
                if (doc.data().timestamp?.toDate().toDateString() === today.toDateString()) alreadySentToday = true;
            });

            if (!alreadySentToday) {
                const bdayContent = `Doğum Gününüz Kutlu Olsun ${user.name} ${title}! 🌿\n\nDeğerli çalışma arkadaşımız ${user.name} ${user.surname}, Bellona ailesi olarak bugün seninle birlikte yeni bir yaşın heyecanını paylaşıyoruz. Ailenizle beraber sağlıklı, uzun ve başarı dolu bir ömür dileriz. Nice mutlu senelere! 🎈\n\nBellona Ailesi`;
                await addDoc(collection(db, "messages"), {
                    senderId: "system_bellona",
                    senderName: "Bellona İnsan Kaynakları",
                    receiverId: user.id,
                    receiverName: `${user.name} ${user.surname}`,
                    participants: ["system_bellona", user.id],
                    subject: msgSubject,
                    content: bdayContent,
                    lastMessage: `Doğum Gününüz Kutlu Olsun ${user.name} ${title}! 🌿`,
                    timestamp: serverTimestamp(),
                    status: "active",
                    isRead: false,
                    type: "birthday_auto"
                });
            }
        }
    }
}

function updateDashboardUI(users) {
    const activeUsers = users.filter(u => u.isActive !== false);
    const total = activeUsers.length;
    
    const factoryUsers = activeUsers.filter((u) => u.category === "factory");
    const regionalUsers = activeUsers.filter((u) => u.category === "regional");
    const localUsers = activeUsers.filter((u) => u.category === "local");
    const managers = activeUsers.filter((u) => u.subRole === "manager");
    const employees = activeUsers.filter((u) => u.subRole === "employee");

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    setEl("statTotal", total);
    setEl("statFactory", factoryUsers.length);
    setEl("statRegional", regionalUsers.length);
    setEl("statLocal", localUsers.length);
    setEl("roleChartTotal", total);
    setEl("categoryChartTotal", total);

    setHtml("statTotalSub", `${managers.length} Yönetici · ${employees.length} Çalışan`);
    setHtml("statFactorySub", `${[...new Set(factoryUsers.map((u) => u.department).filter(Boolean))].length} departman`);
    setHtml("statRegionalSub", `${[...new Set(regionalUsers.map((u) => u.company).filter(Boolean))].length} firma`);
    setHtml("statLocalSub", `${[...new Set(localUsers.map((u) => u.company).filter(Boolean))].length} mağaza`);

    const regionStats = {};
    activeUsers.forEach((u) => { if (u.region) regionStats[u.region] = (regionStats[u.region] || 0) + 1; });
    const sortedRegions = Object.entries(regionStats).sort((a, b) => b[1] - a[1]);
    
    const regionBody = document.getElementById("regionTableBody");
    if (regionBody) {
        regionBody.innerHTML = sortedRegions.map(([reg, count]) => {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
            return `<tr>
                <td style="padding:1.25rem 1.5rem; font-weight:700; color:var(--brand-ink);">${reg}</td>
                <td style="padding:1.25rem 0.5rem; color:var(--text-muted); font-weight:600; text-align:center;">${count}</td>
                <td style="padding:1.25rem 1.5rem; text-align:right;">
                    <span style="background:var(--brand-soft); color:var(--brand); font-weight:800; font-size:0.75rem; padding:4px 12px; border-radius:8px; white-space:nowrap;">${pct}%</span>
                </td>
            </tr>`;
        }).join("");
    }

    if (typeof Chart !== "undefined") {
        buildCharts({ sortedRegions, factoryUsers, regionalUsers, localUsers, users: activeUsers });
    }
    renderBirthdays(activeUsers);
    renderInsights(activeUsers);
}

function buildCharts(data) {
    Object.values(activeCharts).forEach(c => c.destroy());
    activeCharts = {};

    const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: { usePointStyle: true, font: { size: 11, family: "'Inter'" } }
            },
            tooltip: {
                backgroundColor: '#1f2937',
                titleFont: { size: 13, weight: 'bold' },
                padding: 12,
                cornerRadius: 8,
                displayColors: false
            }
        }
    };

    const createChart = (id, config) => {
        const canvas = document.getElementById(id);
        if (!canvas) return;
        
        // Ensure old instance is truly gone and canvas is clean
        if (activeCharts[id]) {
            activeCharts[id].destroy();
            delete activeCharts[id];
        }
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        activeCharts[id] = new Chart(canvas, config);
    };

    // Region Donut with Percentage Labels
    createChart("regionChart", {
        type: "doughnut",
        data: {
            labels: data.sortedRegions.map((r) => r[0]),
            datasets: [{ 
                data: data.sortedRegions.map((r) => r[1]), 
                backgroundColor: CHART_PALETTE.emerald,
                borderWidth: 3, 
                borderColor: "#fff",
                hoverOffset: 12
            }]
        },
        options: { 
            ...baseOptions, 
            cutout: "60%",
            plugins: { 
                ...baseOptions.plugins, 
                centerText: { display: true, label: "PERSONEL" },
                legend: { position: 'right', labels: { usePointStyle: true, pointStyleWidth: 10, font: { size: 11, family: "'Inter'" } } },
                tooltip: {
                    ...baseOptions.plugins.tooltip,
                    callbacks: {
                        label: (ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                            return ` ${ctx.label}: ${ctx.parsed} kişi (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Category Doughnut
    createChart("categoryChart", {
        type: "doughnut",
        data: {
            labels: ["Fabrika", "Bölge", "Yerel"],
            datasets: [{ 
                data: [data.factoryUsers.length, data.regionalUsers.length, data.localUsers.length], 
                backgroundColor: [CHART_PALETTE.brand, "#1e293b", "#64748b"], 
                borderColor: "#fff", 
                borderWidth: 4 
            }]
        },
        options: { ...baseOptions, cutout: "70%", plugins: { ...baseOptions.plugins, centerText: { display: true, label: "KATEGORİ" } } }
    });

    // Role Donut (Ultimate Style)
    const managers = data.users.filter(u => u.subRole === "manager").length;
    const employees = data.users.filter(u => u.subRole === "employee").length;
    createChart("roleChart", {
        type: "doughnut",
        data: {
            labels: ["Yöneticiler", "Çalışanlar"],
            datasets: [{ 
                data: [managers, employees], 
                backgroundColor: [CHART_PALETTE.brand, CHART_PALETTE.mint], 
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: { ...baseOptions, cutout: "82%", plugins: { ...baseOptions.plugins, legend: { position: 'bottom' }, centerText: { display: true, label: "YÖNETİM" } } }
    });

    // Dept Horizontal Bar (Ultimate Style with Gradient)
    const deptStats = {};
    data.users.forEach(u => { if (u.department) deptStats[u.department] = (deptStats[u.department] || 0) + 1; });
    const sortedDepts = Object.entries(deptStats).sort((a,b) => b[1] - a[1]).slice(0, 8);
    
    const deptCtx = document.getElementById("deptChart")?.getContext("2d");
    let deptGradient = CHART_PALETTE.brand;
    if (deptCtx) {
        deptGradient = deptCtx.createLinearGradient(0, 0, 400, 0);
        deptGradient.addColorStop(0, CHART_PALETTE.brand);
        deptGradient.addColorStop(1, "#334155");
    }

    createChart("deptChart", {
        type: "bar",
        data: {
            labels: sortedDepts.map(d => d[0]),
            datasets: [{ 
                label: "Personel Sayısı", 
                data: sortedDepts.map(d => d[1]), 
                backgroundColor: deptGradient, 
                borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 20, bottomRight: 20 },
                barThickness: 14
            }]
        },
        options: { 
            ...baseOptions, 
            indexAxis: 'y', 
            plugins: { ...baseOptions.plugins, legend: { display: false }, dataLabels: { display: true } },
            scales: { 
                x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
                y: { grid: { display: false }, border: { display: false }, ticks: { font: { weight: 'bold' } } }
            }
        }
    });

    // Company Bar (Rounded Tops & Vertical Gradient)
    const companyStats = {};
    data.users.forEach(u => { if (u.company) companyStats[u.company] = (companyStats[u.company] || 0) + 1; });
    const sortedCos = Object.entries(companyStats).sort((a,b) => b[1] - a[1]).slice(0, 6);

    const companyCtx = document.getElementById("companyChart")?.getContext("2d");
    let companyGradient = CHART_PALETTE.brand;
    if (companyCtx) {
        companyGradient = companyCtx.createLinearGradient(0, 0, 0, 300);
        companyGradient.addColorStop(0, CHART_PALETTE.brand);
        companyGradient.addColorStop(1, "#1e293b");
    }

    createChart("companyChart", {
        type: "bar",
        data: {
            labels: sortedCos.map(c => c[0]),
            datasets: [{ 
                label: "Personel", 
                data: sortedCos.map(c => c[1]), 
                backgroundColor: companyGradient, 
                borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 0, bottomRight: 0 },
                barThickness: 44,
                borderSkipped: false
            }]
        },
        options: { 
            ...baseOptions, 
            plugins: { ...baseOptions.plugins, legend: { display: false } },
            scales: {
                y: { grid: { display: true, color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { font: { weight: '700' } } },
                x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11, weight: '600' } } }
            },
            plugins: { ...baseOptions.plugins, dataLabels: { display: true } }
        }
    });
}

function renderInsights(users) {
    const regCos = {};
    users.filter(u => u.category === "regional").forEach(u => { if (u.company) regCos[u.company] = (regCos[u.company] || 0) + 1; });
    const sortedReg = Object.entries(regCos).sort((a,b) => b[1] - a[1]);
    const busyEl = document.getElementById("insightBusiestRegional");
    if (busyEl) {
        if (sortedReg.length) {
            const [name, count] = sortedReg[0];
            busyEl.innerHTML = `<div style="font-size:1.1rem; font-weight:800; color:var(--brand-ink);">${name}</div><div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.4rem;">${count} aktif personel ile lider.</div>`;
        } else busyEl.innerHTML = "Veri yok.";
    }

    const sortedAge = [...users].filter(u => u.birthDate).sort((a,b) => new Date(a.birthDate) - new Date(b.birthDate));
    const oldEl = document.getElementById("insightOldest");
    if (oldEl) {
        if (sortedAge.length) {
            const u = sortedAge[0];
            const age = new Date().getFullYear() - new Date(u.birthDate).getFullYear();
            oldEl.innerHTML = `<div style="font-size:1.1rem; font-weight:800; color:var(--brand-ink);">${u.name} ${u.surname}</div><div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.4rem;">${age} yaşında · Şirketin duayeni.</div>`;
        } else oldEl.innerHTML = "Veri yok.";
    }
}

function renderBirthdays(users) {
    const today = new Date();
    const upcoming = users.filter((u) => {
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
        list.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.85rem;">Yakın zamanda doğum günü yok.</div>';
        return;
    }

    list.innerHTML = upcoming.map(u => {
        const initials = `${u.name?.[0] || ""}${u.surname?.[0] || ""}`.toUpperCase();
        let statusClass = "bday-standard";
        if (u.daysRemaining <= 7) statusClass = "bday-alert";

        const isToday = u.daysRemaining === 0;
        const isTomorrow = u.daysRemaining === 1;
        const isActionable = isToday || isTomorrow;

        const actionBtn = isActionable
            ? `<button class="bday-send-btn" 
                data-id="${u.id}" 
                data-name="${u.name}" 
                data-surname="${u.surname}">
                <i class="fa-solid fa-paper-plane" style="font-size:0.8rem;"></i> Tebrik Gönder
               </button>`
            : `<span class="bday-pending-pill">
                <i class="fa-regular fa-clock" style="font-size:0.7rem;"></i> ${u.daysRemaining} gün
               </span>`;

        return `
            <div class="birthday-card">
                <div class="bday-avatar">${initials}</div>
                <div class="bday-content">
                    <span class="bday-user-name">${u.name} ${u.surname}</span>
                    <span class="bday-company">${u.company || 'Birim Bilgisi Yok'}</span>
                    <div class="bday-days-badge ${statusClass}">${isToday ? 'Bugün! 🎂' : isTomorrow ? 'Yarın! 🎉' : `${u.daysRemaining} Gün Kaldı`}</div>
                </div>
                ${actionBtn}
            </div>`;
    }).join("");
}
