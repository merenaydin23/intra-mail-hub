import { getAllUsers } from "../services/user-service.js";

const CHART_PALETTE = {
    region: ["#155e75", "#0891b2", "#22d3ee", "#67e8f9", "#0e7490", "#164e63", "#06b6d4"],
    category: ["#155e75", "#06b6d4", "#a5f3fc"],
    company: ["#155e75", "#0e7490", "#0891b2", "#06b6d4", "#22d3ee", "#67e8f9", "#a5f3fc"],
    role: ["#155e75", "#a5f3fc"],
    department: "#0e7490"
};

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

    renderCityCoverage(users);

    if (typeof Chart !== "undefined") {
        buildCharts({ sortedRegions, factoryUsers, regionalUsers, localUsers, managers, employees, users });
    }

    renderInsights({ users, localUsers, regionalUsers });
    renderBirthdays(users);
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
        list.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#7b8b91;padding:1.2rem;">Şehir verisi henüz oluşturulmamış.</td></tr>`;
        return;
    }

    const [topCity, topCount] = sortedCities[0];
    if (leadBadge) leadBadge.textContent = `${topCity} şehrinde ${topCount} çalışan`;
    list.innerHTML = sortedCities.slice(0, 10).map(([city, count]) => {
        const note = city === "Kayseri" ? "Fabrika merkezi" : "Bayi yoğunluğu";
        return `<tr><td><strong>${city}</strong></td><td>${count}</td><td>${note}</td></tr>`;
    }).join("");
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
                    backgroundColor: CHART_PALETTE.region,
                    borderWidth: 2,
                    borderColor: "#fff"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "top",
                        labels: {
                            usePointStyle: true,
                            pointStyle: "circle",
                            boxWidth: 8,
                            padding: 12,
                            color: "#4b5b60",
                            font: { size: 11, family: "Inter", weight: "600" }
                        }
                    }
                }
            }
        });
    }

    const catCtx = document.getElementById("categoryChart");
    if (catCtx) {
        new Chart(catCtx, {
            type: "doughnut",
            data: {
                labels: ["Fabrika", "Bölge Bayisi", "Yerel Bayi"],
                datasets: [{
                    data: [factoryUsers.length, regionalUsers.length, localUsers.length],
                    backgroundColor: CHART_PALETTE.category,
                    borderColor: "#fff",
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "60%",
                plugins: {
                    legend: {
                        position: "top",
                        labels: {
                            usePointStyle: true,
                            pointStyle: "circle",
                            boxWidth: 8,
                            padding: 12,
                            color: "#4b5b60",
                            font: { size: 11, family: "Inter", weight: "600" }
                        }
                    }
                }
            }
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
                datasets: [{
                    data: topCompanies.map((c) => c[1]),
                    backgroundColor: topCompanies.map((_, idx) => CHART_PALETTE.company[idx % CHART_PALETTE.company.length]),
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } } }
        });
    }

    const roleCtx = document.getElementById("roleChart");
    if (roleCtx) {
        new Chart(roleCtx, {
            type: "doughnut",
            data: {
                labels: ["Yönetici / Patron", "Çalışan"],
                datasets: [{ data: [managers.length, employees.length], backgroundColor: CHART_PALETTE.role, borderColor: "#fff", borderWidth: 3 }]
            },
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
                datasets: [{ data: topDepts.map((d) => d[1]), backgroundColor: CHART_PALETTE.department, borderRadius: 6, borderSkipped: false }]
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
