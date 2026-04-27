import { getAllUsers } from "../services/user-service.js";

export async function initDashboardPage() {
    let users = [];
    try {
        users = (await getAllUsers()).filter((u) => u.role !== "admin");
    } catch (err) {
        console.error("Dashboard veri çekme hatası:", err);
        return;
    }

    const total = users.length;
    const factoryUsers = users.filter((u) => u.category === "factory");
    const regionalUsers = users.filter((u) => u.category === "regional");
    const localUsers = users.filter((u) => u.category === "local");
    const managers = users.filter((u) => u.subRole === "manager");
    const employees = users.filter((u) => u.subRole === "employee");
    const companies = [...new Set(users.map((u) => u.company).filter(Boolean))];
    const departments = [...new Set(users.map((u) => u.department).filter(Boolean))];

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    setEl("statTotal", total);
    setEl("statFactory", factoryUsers.length);
    setEl("statRegional", regionalUsers.length);
    setEl("statLocal", localUsers.length);
    setHtml("statTotalSub", `${managers.length} Yönetici · ${employees.length} Çalışan`);
    setHtml("statFactorySub", `${[...new Set(factoryUsers.map((u) => u.department).filter(Boolean))].length} farklı departman`);
    setHtml("statRegionalSub", `${[...new Set(regionalUsers.map((u) => u.company).filter(Boolean))].length} farklı firma`);
    setHtml("statLocalSub", `${[...new Set(localUsers.map((u) => u.company).filter(Boolean))].length} farklı mağaza`);

    const hlMgr = document.querySelector("#hlManagerCount .hl-value");
    const hlEmp = document.querySelector("#hlEmployeeCount .hl-value");
    const hlComp = document.querySelector("#hlCompanyCount .hl-value");
    const hlDept = document.querySelector("#hlDeptCount .hl-value");
    if (hlMgr) hlMgr.textContent = managers.length;
    if (hlEmp) hlEmp.textContent = employees.length;
    if (hlComp) hlComp.textContent = companies.length;
    if (hlDept) hlDept.textContent = departments.length;

    const regionStats = {};
    users.forEach((u) => { if (u.region) regionStats[u.region] = (regionStats[u.region] || 0) + 1; });
    const sortedRegions = Object.entries(regionStats).sort((a, b) => b[1] - a[1]);
    const regionBody = document.getElementById("regionTableBody");
    if (regionBody) {
        regionBody.innerHTML = sortedRegions.map(([reg, count]) => {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
            return `<tr><td><strong>${reg}</strong></td><td>${count}</td><td>${pct}%</td></tr>`;
        }).join("");
    }

    if (typeof Chart !== "undefined") {
        buildCharts({ sortedRegions, factoryUsers, regionalUsers, localUsers, managers, employees, users });
    }

    renderInsights({ users, localUsers, regionalUsers });
    renderBirthdays(users);
}

function buildCharts({ sortedRegions, factoryUsers, regionalUsers, localUsers, managers, employees, users }) {
    const regionCtx = document.getElementById("regionChart");
    if (regionCtx) {
        new Chart(regionCtx, {
            type: "pie",
            data: {
                labels: sortedRegions.map((r) => r[0]),
                datasets: [{
                    data: sortedRegions.map((r) => r[1]),
                    backgroundColor: ["#007b7b", "#169e9e", "#43bcbc", "#74cfd0", "#93b9cf", "#80a1bb"],
                    borderWidth: 2,
                    borderColor: "#fff"
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const catCtx = document.getElementById("categoryChart");
    if (catCtx) {
        new Chart(catCtx, {
            type: "doughnut",
            data: {
                labels: ["Fabrika", "Bölge Bayisi", "Yerel Bayi"],
                datasets: [{ data: [factoryUsers.length, regionalUsers.length, localUsers.length], backgroundColor: ["#007b7b", "#249eb4", "#6f8fb0"], borderColor: "#fff", borderWidth: 3 }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: "60%" }
        });
    }

    const companyStats = {};
    users.forEach((u) => { if (u.company) companyStats[u.company] = (companyStats[u.company] || 0) + 1; });
    const topCompanies = Object.entries(companyStats).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const compCtx = document.getElementById("companyChart");
    if (compCtx) {
        new Chart(compCtx, {
            type: "bar",
            data: {
                labels: topCompanies.map((c) => c[0].length > 22 ? `${c[0].substring(0, 20)}…` : c[0]),
                datasets: [{ data: topCompanies.map((c) => c[1]), backgroundColor: "#007b7b", borderRadius: 6, borderSkipped: false }]
            },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } } }
        });
    }

    const roleCtx = document.getElementById("roleChart");
    if (roleCtx) {
        new Chart(roleCtx, {
            type: "doughnut",
            data: { labels: ["Yönetici / Patron", "Çalışan"], datasets: [{ data: [managers.length, employees.length], backgroundColor: ["#007b7b", "#9fd8d8"], borderColor: "#fff", borderWidth: 3 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: "55%" }
        });
    }

    const deptStats = {};
    users.forEach((u) => { if (u.department) deptStats[u.department] = (deptStats[u.department] || 0) + 1; });
    const topDepts = Object.entries(deptStats).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const deptCtx = document.getElementById("deptChart");
    if (deptCtx) {
        new Chart(deptCtx, {
            type: "bar",
            data: {
                labels: topDepts.map((d) => d[0].length > 25 ? `${d[0].substring(0, 23)}…` : d[0]),
                datasets: [{ data: topDepts.map((d) => d[1]), backgroundColor: "#2a9db2", borderRadius: 6, borderSkipped: false }]
            },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } } }
        });
    }
}

function renderInsights({ users, localUsers, regionalUsers }) {
    const localCompanyStats = {};
    localUsers.forEach((u) => { if (u.company) localCompanyStats[u.company] = (localCompanyStats[u.company] || 0) + 1; });
    const busiestLocal = Object.entries(localCompanyStats).sort((a, b) => b[1] - a[1])[0];
    const insightLocal = document.getElementById("insightBusiestLocal");
    if (insightLocal) {
        insightLocal.innerHTML = busiestLocal
            ? `<div class="insight-big"><div class="insight-company-name"><i class="fa-solid fa-store"></i> ${busiestLocal[0]}</div><div class="insight-metric"><span class="insight-metric-label">Toplam Personel</span><span class="insight-metric-value">${busiestLocal[1]} kişi</span></div></div>`
            : "<p style='text-align:center;color:var(--text-muted);padding:1rem;'>Yerel bayi verisi bulunamadı.</p>";
    }

    const regCompanyStats = {};
    regionalUsers.forEach((u) => { if (u.company) regCompanyStats[u.company] = (regCompanyStats[u.company] || 0) + 1; });
    const busiestRegional = Object.entries(regCompanyStats).sort((a, b) => b[1] - a[1])[0];
    const insightRegional = document.getElementById("insightBusiestRegional");
    if (insightRegional) {
        insightRegional.innerHTML = busiestRegional
            ? `<div class="insight-big"><div class="insight-company-name"><i class="fa-solid fa-map-location-dot"></i> ${busiestRegional[0]}</div><div class="insight-metric"><span class="insight-metric-label">Toplam Personel</span><span class="insight-metric-value">${busiestRegional[1]} kişi</span></div></div>`
            : "<p style='text-align:center;color:var(--text-muted);padding:1rem;'>Bölge bayisi verisi bulunamadı.</p>";
    }

    const oldest = [...users].filter((u) => u.birthDate).sort((a, b) => new Date(a.birthDate) - new Date(b.birthDate))[0];
    const insightOldest = document.getElementById("insightOldest");
    if (insightOldest) {
        insightOldest.innerHTML = oldest
            ? `<div class="insight-big"><div class="insight-person"><div class="insight-avatar">${((oldest.name?.[0] || "") + (oldest.surname?.[0] || "")).toUpperCase()}</div><div class="insight-person-info"><span class="insight-person-name">${oldest.name} ${oldest.surname}</span><span class="insight-person-detail">${oldest.company || "-"}</span></div></div></div>`
            : "<p style='text-align:center;color:var(--text-muted);padding:1rem;'>Doğum tarihi bilgisi bulunamadı.</p>";
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
    list.innerHTML = upcoming.length
        ? upcoming.map((u) => `<div class="birthday-item"><div class="bday-left"><span class="bday-name">${u.name} ${u.surname}</span><span class="bday-company">${u.company || "-"}</span></div><div class="bday-right"><span class="bday-countdown ${u.daysRemaining === 0 ? "today" : ""}">${u.daysRemaining === 0 ? "🎉 BUGÜN!" : `${u.daysRemaining} gün`}</span><span class="bday-date">${u.upcomingDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}</span></div></div>`).join("")
        : "<p style='text-align:center;padding:2rem;color:var(--text-muted);'>Yakın 30 gün içinde doğum günü yok.</p>";
}
