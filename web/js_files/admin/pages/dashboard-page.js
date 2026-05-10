import { collection, query, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

const CHART_PALETTE = {
    // SaaS Professional Palette
    region: ["#059669", "#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5", "#ecfdf5"],
    category: ["#0f172a", "#334155", "#64748b"],
    company: ["#064e3b", "#065f46", "#047857", "#059669", "#10b981"]
};

let activeCharts = {};

export async function initDashboardPage() {
    setupRealtimeDashboard();
}

function setupRealtimeDashboard() {
    const q = query(collection(db, "users"), where("role", "!=", "admin"));
    onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboardUI(users);
    });
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
            return `<tr><td><strong>${reg}</strong></td><td>${count}</td><td style="color:var(--text-muted); font-weight:700;">${pct}%</td></tr>`;
        }).join("");
    }

    renderCityCoverage(activeUsers);
    if (typeof Chart !== "undefined") {
        buildCharts({ sortedRegions, factoryUsers, regionalUsers, localUsers, users: activeUsers });
    }
    renderBirthdays(activeUsers);
    renderInsights(activeUsers);
}

function renderCityCoverage(users) {
    const cityStats = {};
    users.forEach((u) => {
        const city = u.category === "factory" ? "Kayseri" : (u.city || "");
        if (!city) return;
        cityStats[city] = (cityStats[city] || 0) + 1;
    });

    const sortedCities = Object.entries(cityStats).sort((a, b) => b[1] - a[1]);
    const leadBadge = document.getElementById("cityCoverageLead");
    const list = document.getElementById("cityCoverageList");
    if (!list) return;

    if (!sortedCities.length) {
        if (leadBadge) leadBadge.textContent = "Veri yok";
        list.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#7b8b91;padding:1.2rem;">Şehir verisi yok.</td></tr>`;
        return;
    }

    const [topCity, topCount] = sortedCities[0];
    if (leadBadge) leadBadge.textContent = `${topCity} Lider`;
    list.innerHTML = sortedCities.slice(0, 10).map(([city, count]) => {
        const note = city === "Kayseri" ? "Merkez" : "Aktif Bölge";
        return `<tr><td><strong>${city}</strong></td><td>${count}</td><td><span class="badge" style="background:#f1f5f9; color:#475569; border:none;">${note}</span></td></tr>`;
    }).join("");
}

function buildCharts(data) {
    Object.values(activeCharts).forEach(c => c.destroy());
    activeCharts = {};

    const createChart = (id, config) => {
        const ctx = document.getElementById(id);
        if (ctx) activeCharts[id] = new Chart(ctx, config);
    };

    createChart("regionChart", {
        type: "pie",
        data: {
            labels: data.sortedRegions.map((r) => r[0]),
            datasets: [{ data: data.sortedRegions.map((r) => r[1]), backgroundColor: CHART_PALETTE.region, borderWidth: 4, borderColor: "#fff" }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { usePointStyle: true, boxWidth: 6, font: { size: 10 } } } } }
    });

    createChart("categoryChart", {
        type: "doughnut",
        data: {
            labels: ["Fabrika", "Bölge", "Yerel"],
            datasets: [{ data: [data.factoryUsers.length, data.regionalUsers.length, data.localUsers.length], backgroundColor: CHART_PALETTE.category, borderColor: "#fff", borderWidth: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: "75%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 6 } } } }
    });

    // Company Chart
    const companyStats = {};
    data.users.forEach(u => { if (u.company) companyStats[u.company] = (companyStats[u.company] || 0) + 1; });
    const sortedCos = Object.entries(companyStats).sort((a,b) => b[1] - a[1]).slice(0, 8);
    createChart("companyChart", {
        type: "bar",
        data: {
            labels: sortedCos.map(c => c[0]),
            datasets: [{ label: "Personel Sayısı", data: sortedCos.map(c => c[1]), backgroundColor: CHART_PALETTE.company, borderRadius: 8 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } } }
    });

    // Role Chart
    const managers = data.users.filter(u => u.subRole === "manager").length;
    const employees = data.users.filter(u => u.subRole === "employee").length;
    createChart("roleChart", {
        type: "pie",
        data: {
            labels: ["Yönetici", "Çalışan"],
            datasets: [{ data: [managers, employees], backgroundColor: ["#059669", "#cbd5e1"], borderWidth: 4, borderColor: "#fff" }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
    });

    // Dept Chart
    const deptStats = {};
    data.users.forEach(u => { if (u.department) deptStats[u.department] = (deptStats[u.department] || 0) + 1; });
    const sortedDepts = Object.entries(deptStats).sort((a,b) => b[1] - a[1]).slice(0, 10);
    createChart("deptChart", {
        type: "doughnut",
        data: {
            labels: sortedDepts.map(d => d[0]),
            datasets: [{ data: sortedDepts.map(d => d[1]), backgroundColor: CHART_PALETTE.region, borderWidth: 2, borderColor: "#fff" }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: "60%", plugins: { legend: { display: false } } }
    });
}

function renderInsights(users) {
    // Busiest Regional
    const regCos = {};
    users.filter(u => u.category === "regional").forEach(u => { if (u.company) regCos[u.company] = (regCos[u.company] || 0) + 1; });
    const sortedReg = Object.entries(regCos).sort((a,b) => b[1] - a[1]);
    const busyEl = document.getElementById("insightBusiestRegional");
    if (busyEl) {
        if (sortedReg.length) {
            const [name, count] = sortedReg[0];
            busyEl.innerHTML = `
                <div style="font-size:1.1rem; font-weight:800; color:var(--brand-ink);">${name}</div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.4rem;">${count} aktif personel ile lider konumda.</div>
            `;
        } else busyEl.innerHTML = "Veri yok.";
    }

    // Oldest Member (Longest Tenured or Birth Year)
    const sortedAge = [...users].filter(u => u.birthDate).sort((a,b) => new Date(a.birthDate) - new Date(b.birthDate));
    const oldEl = document.getElementById("insightOldest");
    if (oldEl) {
        if (sortedAge.length) {
            const u = sortedAge[0];
            const age = new Date().getFullYear() - new Date(u.birthDate).getFullYear();
            oldEl.innerHTML = `
                <div style="font-size:1.1rem; font-weight:800; color:var(--brand-ink);">${u.name} ${u.surname}</div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.4rem;">${age} yaşında · Şirketin tecrübe abidesi.</div>
            `;
        } else oldEl.innerHTML = "Doğum tarihi verisi yok.";
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
        u.upcomingDate = thisYear;
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
        let statusClass = "bday-days-safe";
        if (u.daysRemaining <= 3) statusClass = "bday-days-critical";
        else if (u.daysRemaining <= 7) statusClass = "bday-days-soon";

        return `
            <div class="birthday-card">
                <div class="bday-avatar">${initials}</div>
                <div class="bday-content">
                    <span class="bday-user-name">${u.name} ${u.surname}</span>
                    <span class="bday-company">${u.company || 'Birim Bilgisi Yok'}</span>
                    <div class="bday-days-badge ${statusClass}">
                        ${u.daysRemaining === 0 ? 'Bugün! 🎂' : `${u.daysRemaining} Gün Kaldı`}
                    </div>
                </div>
            </div>
        `;
    }).join("");
}
