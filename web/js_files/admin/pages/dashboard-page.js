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
}

function setupRealtimeDashboard() {
    // 1. Users Stream
    const qUsers = query(collection(db, "users"), where("role", "!=", "admin"));
    onSnapshot(qUsers, (snapshot) => {
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboardUI(users);
        checkAndSendBirthdayMessages(users.filter(u => u.isActive !== false));
    });

    // 2. Messages Stream
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
                <td style="padding:1rem 0; font-weight:700; color:#1e293b;">${reg}</td>
                <td style="padding:1rem 0; color:#64748b; font-weight:600; text-align:center;">${count}</td>
                <td style="padding:1rem 0; text-align:right;">
                    <span style="background:#f1f5f9; color:#475569; font-weight:800; font-size:0.75rem; padding:4px 10px; border-radius:6px;">${pct}%</span>
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

    // 1. Region Donut
    destroy("regionChart");
    activeCharts["regionChart"] = new Chart(document.getElementById("regionChart"), {
        type: 'doughnut',
        data: {
            labels: data.sortedRegions.map(r => r[0]),
            datasets: [{ data: data.sortedRegions.map(r => r[1]), backgroundColor: CHART_PALETTE.emerald, borderWidth: 0, cutout: '70%' }]
        },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, centerText: { display: true, label: "BÖLGE" } } }
    });

    // 2. Category Donut
    destroy("categoryChart");
    activeCharts["categoryChart"] = new Chart(document.getElementById("categoryChart"), {
        type: 'doughnut',
        data: {
            labels: ["Fabrika", "Bölge", "Yerel"],
            datasets: [{ data: [data.factory.length, data.regional.length, data.local.length], backgroundColor: ['#10b981', '#6366f1', '#f59e0b'], borderWidth: 0, cutout: '70%' }]
        },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, centerText: { display: true, label: "KATEGORİ" } } }
    });

    // 3. Role Donut
    destroy("roleChart");
    const managers = data.users.filter(u => u.subRole === "manager").length;
    const employees = data.users.filter(u => u.subRole === "employee").length;
    activeCharts["roleChart"] = new Chart(document.getElementById("roleChart"), {
        type: 'doughnut',
        data: {
            labels: ["Yönetici", "Çalışan"],
            datasets: [{ data: [managers, employees], backgroundColor: ['#6366f1', '#e2e8f0'], borderWidth: 0, cutout: '70%' }]
        },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, centerText: { display: true, label: "ROL" } } }
    });

    // 4. Company Bar
    destroy("companyChart");
    const coStats = {};
    data.users.forEach(u => { if (u.company) coStats[u.company] = (coStats[u.company] || 0) + 1; });
    const sortedCos = Object.entries(coStats).sort((a,b) => b[1] - a[1]).slice(0, 8);
    activeCharts["companyChart"] = new Chart(document.getElementById("companyChart"), {
        type: 'bar',
        data: {
            labels: sortedCos.map(c => c[0]),
            datasets: [{ label: 'Personel', data: sortedCos.map(c => c[1]), backgroundColor: '#10b981', borderRadius: 8, barThickness: 32 }]
        },
        options: {
            ...baseOpts,
            scales: {
                y: { grid: { color: 'rgba(0,0,0,0.03)' }, ticks: { font: { weight: '600' } } },
                x: { grid: { display: false }, ticks: { font: { size: 10, weight: '600' } } }
            }
        }
    });

    // 5. Dept Bar
    destroy("deptChart");
    const deptStats = {};
    data.users.forEach(u => { if (u.department) deptStats[u.department] = (deptStats[u.department] || 0) + 1; });
    const sortedDepts = Object.entries(deptStats).sort((a,b) => b[1] - a[1]).slice(0, 6);
    activeCharts["deptChart"] = new Chart(document.getElementById("deptChart"), {
        type: 'bar',
        data: {
            labels: sortedDepts.map(d => d[0]),
            datasets: [{ label: 'Personel', data: sortedDepts.map(d => d[1]), backgroundColor: '#64748b', borderRadius: 4, barThickness: 12 }]
        },
        options: {
            ...baseOpts,
            indexAxis: 'y',
            scales: {
                x: { grid: { display: false }, ticks: { display: false } },
                y: { grid: { display: false }, ticks: { font: { weight: '600' } } }
            }
        }
    });
}

function buildMessageCharts(messages) {
    // 1. Son 5 Günlük Mesaj Yoğunluğu (Bug Fix: Robust Normalization)
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
                datasets: [{
                    data: densityData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#10b981',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.03)' }, ticks: { stepSize: 1, font: { weight: '600' } } },
                    x: { grid: { display: false }, ticks: { font: { weight: '600' } } }
                }
            }
        });
    }

    // 2. Active Dealers Leaderboard
    const senderStats = {};
    messages.forEach(m => {
        if (m.senderName && m.senderName !== "BELLONA MERKEZ") {
            senderStats[m.senderName] = (senderStats[m.senderName] || 0) + 1;
        }
    });
    const topSenders = Object.entries(senderStats).sort((a,b) => b[1] - a[1]).slice(0, 5);

    const activeList = document.getElementById("activeDealersList");
    if (activeList) {
        if (!topSenders.length) activeList.innerHTML = '<p style="text-align:center; color:#64748b; padding:1rem;">Veri yok.</p>';
        else {
            activeList.innerHTML = topSenders.map(([name, count], index) => `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem; padding:0.5rem; background:#f8fafc; border-radius:12px;">
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <div style="width:28px; height:28px; background:#fff; border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.75rem; color:#10b981; border:1px solid #e2e8f0;">${index+1}</div>
                        <div style="font-weight:700; font-size:0.85rem; color:#1e293b;">${name}</div>
                    </div>
                    <div style="background:#ecfdf5; color:#059669; padding:4px 10px; border-radius:20px; font-size:0.7rem; font-weight:800;">${count} Mesaj</div>
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
                <div style="font-size:0.75rem; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:0.5rem;">En Kalabalık Bayi</div>
                <div style="font-size:1.1rem; font-weight:800; color:#1e293b;">${name}</div>
                <div style="font-size:0.85rem; color:#10b981; font-weight:700; margin-top:0.25rem;">${count} Aktif Personel</div>`;
        } else busyEl.innerHTML = "Veri yok.";
    }

    const sortedAge = [...users].filter(u => u.birthDate).sort((a,b) => new Date(a.birthDate) - new Date(b.birthDate));
    const oldEl = document.getElementById("insightOldest");
    if (oldEl) {
        if (sortedAge.length) {
            const u = sortedAge[0];
            const age = new Date().getFullYear() - new Date(u.birthDate).getFullYear();
            oldEl.innerHTML = `
                <div style="font-size:0.75rem; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:0.5rem;">Şirket Duayeni</div>
                <div style="font-size:1.1rem; font-weight:800; color:#1e293b;">${u.name} ${u.surname}</div>
                <div style="font-size:0.85rem; color:#6366f1; font-weight:700; margin-top:0.25rem;">${age} Yaşında</div>`;
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
        list.innerHTML = '<p style="text-align:center; color:#64748b; padding:2rem;">Yakın zamanda doğum günü yok.</p>';
        return;
    }

    list.innerHTML = upcoming.map(u => `
        <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1rem; padding:0.75rem; border:1px solid #f1f5f9; border-radius:12px;">
            <div style="width:40px; height:40px; background:#fdf4ff; border-radius:10px; display:flex; align-items:center; justify-content:center; color:#a21caf; font-weight:800;">${u.name[0]}${u.surname[0]}</div>
            <div style="flex:1;">
                <div style="font-weight:700; font-size:0.85rem; color:#1e293b;">${u.name} ${u.surname}</div>
                <div style="font-size:0.75rem; color:#64748b;">${u.company || "Birim Yok"}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.75rem; font-weight:800; color:${u.daysRemaining <= 1 ? '#e11d48' : '#a21caf'};">${u.daysRemaining === 0 ? 'BUGÜN' : u.daysRemaining === 1 ? 'YARIN' : u.daysRemaining + ' GÜN'}</div>
            </div>
        </div>
    `).join("");
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
