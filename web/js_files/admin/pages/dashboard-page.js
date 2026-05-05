import { collection, query, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

const CHART_PALETTE = {
    // Vibrant & Distinct Colors
    region: ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1", "#e2e8f0", "#f1f5f9"],
    category: ["#0d9488", "#06b6d4", "#22d3ee"],
    company: ["#1e293b", "#334155", "#475569", "#64748b", "#94a3b8"]
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

    list.innerHTML = upcoming.map(u => `
        <div class="celebration-item">
            <div class="bday-icon"><i class="fa-solid fa-cake-candles"></i></div>
            <div class="bday-info">
                <span class="bday-name">${u.name} ${u.surname}</span>
                <span class="bday-meta">${u.company || 'Birim Bilgisi Yok'}</span>
            </div>
            <div class="bday-badge ${u.daysRemaining === 0 ? 'bday-today' : 'bday-soon'}">
                ${u.daysRemaining === 0 ? 'Bugün!' : `${u.daysRemaining} Gün`}
            </div>
        </div>
    `).join("");
}
