import { collection, query, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

const CHART_PALETTE = {
    region: ["#155e75", "#0891b2", "#22d3ee", "#67e8f9", "#0e7490", "#164e63", "#06b6d4"],
    category: ["#155e75", "#06b6d4", "#a5f3fc"],
    company: ["#155e75", "#0e7490", "#0891b2", "#06b6d4", "#22d3ee", "#67e8f9", "#a5f3fc"],
    role: ["#155e75", "#a5f3fc"],
    department: "#0e7490"
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
    }, (error) => {
        console.error("Dashboard Real-time Error:", error);
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
    const companies = [...new Set(activeUsers.map((u) => u.company).filter(Boolean))];
    const departments = [...new Set(activeUsers.map((u) => u.department).filter(Boolean))];

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

    const hlMgr = document.querySelector("#hlManagerCount .hl-value");
    const hlEmp = document.querySelector("#hlEmployeeCount .hl-value");
    const hlComp = document.querySelector("#hlCompanyCount .hl-value");
    const hlDept = document.querySelector("#hlDeptCount .hl-value");
    if (hlMgr) hlMgr.textContent = managers.length;
    if (hlEmp) hlEmp.textContent = employees.length;
    if (hlComp) hlComp.textContent = companies.length;
    if (hlDept) hlDept.textContent = departments.length;

    const regionStats = {};
    activeUsers.forEach((u) => { if (u.region) regionStats[u.region] = (regionStats[u.region] || 0) + 1; });
    const sortedRegions = Object.entries(regionStats).sort((a, b) => b[1] - a[1]);
    const regionBody = document.getElementById("regionTableBody");
    if (regionBody) {
        regionBody.innerHTML = sortedRegions.map(([reg, count]) => {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
            return `<tr><td><strong>${reg}</strong></td><td>${count}</td><td>${pct}%</td></tr>`;
        }).join("");
    }

    renderCityCoverage(activeUsers);
    
    if (typeof Chart !== "undefined") {
        buildCharts({ sortedRegions, factoryUsers, regionalUsers, localUsers, managers, employees, users: activeUsers });
    }

    renderInsights({ users: activeUsers, localUsers, regionalUsers });
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
        if (leadBadge) leadBadge.textContent = "Şehir verisi bulunamadı";
        list.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#7b8b91;padding:1.2rem;">Şehir verisi henüz yok.</td></tr>`;
        return;
    }

    const [topCity, topCount] = sortedCities[0];
    if (leadBadge) leadBadge.textContent = `${topCity} şehrinde ${topCount} çalışan`;
    list.innerHTML = sortedCities.slice(0, 10).map(([city, count]) => {
        const note = city === "Kayseri" ? "Fabrika merkezi" : "Bayi yoğunluğu";
        return `<tr><td><strong>${city}</strong></td><td>${count}</td><td>${note}</td></tr>`;
    }).join("");
}

function buildCharts(data) {
    // Destroy previous charts to avoid overlapping on real-time update
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
            datasets: [{ data: data.sortedRegions.map((r) => r[1]), backgroundColor: CHART_PALETTE.region, borderWidth: 2, borderColor: "#fff" }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top" } } }
    });

    createChart("categoryChart", {
        type: "doughnut",
        data: {
            labels: ["Fabrika", "Bölge Bayisi", "Yerel Bayi"],
            datasets: [{ data: [data.factoryUsers.length, data.regionalUsers.length, data.localUsers.length], backgroundColor: CHART_PALETTE.category, borderColor: "#fff", borderWidth: 3 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: "60%" }
    });

    const companyStats = {};
    data.users.forEach((u) => { if (u.company) companyStats[u.company] = (companyStats[u.company] || 0) + 1; });
    const topCompanies = Object.entries(companyStats).sort((a, b) => b[1] - a[1]).slice(0, 10);
    createChart("companyChart", {
        type: "bar",
        data: {
            labels: topCompanies.map((c) => c[0].length > 22 ? `${c[0].substring(0, 20)}…` : c[0]),
            datasets: [{ data: topCompanies.map((c) => c[1]), backgroundColor: CHART_PALETTE.company, borderRadius: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } } }
    });
}

function renderInsights({ users, localUsers, regionalUsers }) {
    const insightLocal = document.getElementById("insightBusiestLocal");
    if (insightLocal) {
        const localStats = {};
        localUsers.forEach((u) => { if (u.company) localStats[u.company] = (localStats[u.company] || 0) + 1; });
        const top = Object.entries(localStats).sort((a, b) => b[1] - a[1])[0];
        insightLocal.innerHTML = top ? `<div class="insight-big"><strong>${top[0]}</strong><br><small>${top[1]} Personel</small></div>` : "-";
    }

    const insightOldest = document.getElementById("insightOldest");
    if (insightOldest) {
        const oldest = [...users].filter((u) => u.birthDate).sort((a, b) => new Date(a.birthDate) - new Date(b.birthDate))[0];
        // REMOVED initials avatar here as requested
        insightOldest.innerHTML = oldest ? `<div class="insight-big"><strong>${oldest.name} ${oldest.surname}</strong><br><small>${oldest.company || "-"}</small></div>` : "-";
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
    if (list) list.innerHTML = upcoming.map(u => `<div class="birthday-item"><span>${u.name} ${u.surname}</span> <strong>${u.daysRemaining === 0 ? "🎉 Bugün!" : `${u.daysRemaining} gün`}</strong></div>`).join("");
}
