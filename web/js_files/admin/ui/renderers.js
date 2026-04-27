function formatDate(ts) {
    if (!ts) return "-";
    const dt = ts?.toDate ? ts.toDate() : new Date(ts);
    return dt.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

export function renderTableRows(tbody, users) {
    if (!tbody) return;
    if (!users.length) {
        tbody.innerHTML = `
            <tr class="no-result-row">
                <td colspan="4">
                    <div class="no-result-state">
                        <i class="fa-regular fa-folder-open no-result-icon"></i>
                        <h4>Sonuç Bulunamadı</h4>
                        <p>Filtreleri temizleyip tekrar deneyebilir veya yeni personel kaydı ekleyebilirsin.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = users.map((u) => {
        const fullName = `${u.name || ""} ${u.surname || ""}`.trim();
        const catLabel = u.category === "factory"
            ? "FABRİKA"
            : u.category === "regional"
                ? "BÖLGE BAYİSİ"
                : u.category === "local"
                    ? "YEREL BAYİ"
                    : "Bilinmiyor";
        return `
            <tr class="personnel-main-row" data-user-id="${u.id}">
                <td>
                    <div class="personnel-name-wrap">
                        <i class="fa-solid fa-chevron-right detail-chevron"></i>
                        <strong>${fullName || "-"}</strong>
                    </div>
                </td>
                <td>${u.company || "-"}</td>
                <td><span style="font-size: 0.8rem; color: #64748b;">${u.department || "-"}</span></td>
                <td><span class="badge badge-role ${u.subRole === "manager" ? "badge-role-manager" : "badge-role-employee"}">${u.subRole === "manager" ? "PATRON" : "ÇALIŞAN"}</span></td>
            </tr>
            <tr class="personnel-detail-row" data-detail-id="${u.id}" hidden>
                <td colspan="4">
                    <div class="personnel-detail-panel">
                        <div class="personnel-detail-grid">
                            <div><span class="detail-label">E-posta</span><span class="detail-value">${u.email || "-"}</span></div>
                            <div><span class="detail-label">Telefon</span><span class="detail-value">${u.phone || "-"}</span></div>
                            <div><span class="detail-label">Bölge</span><span class="detail-value">${u.region || "-"}</span></div>
                            <div><span class="detail-label">Kategori</span><span class="detail-value">${catLabel}</span></div>
                        </div>
                        <button data-action="delete-user" data-user-id="${u.id}" class="btn-delete"><i class="fa-solid fa-trash"></i> Kaydı Sil</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

export function renderAuditFeed(container, logs) {
    if (!container) return;
    if (!logs.length) {
        container.innerHTML = `<div class="audit-empty"><i class="fa-solid fa-inbox"></i><br>Henüz audit kaydı yok.</div>`;
        return;
    }
    container.innerHTML = logs.map((log) => `
        <article class="audit-item">
            <div class="audit-title">${log.action || "İşlem"} · ${log.targetType || "-"}</div>
            <div class="audit-meta">${log.actorName || "Bilinmiyor"} (${log.actorEmail || "-"})</div>
            <div class="audit-meta">${log.detail || "-"}</div>
            <div class="audit-meta">${formatDate(log.createdAt)}</div>
        </article>
    `).join("");
}

export function renderMessageFeed(container, logs) {
    if (!container) return;
    if (!logs.length) {
        container.innerHTML = `<div class="audit-empty"><i class="fa-solid fa-comment-slash"></i><br>Görüntülenecek mesaj bulunamadı.</div>`;
        return;
    }
    container.innerHTML = logs.map((log) => `
        <article class="audit-item">
            <div class="audit-title">${log.action || "Sistem Mesajı"}</div>
            <div class="audit-meta">${log.detail || "Detay yok"}</div>
            <div class="audit-meta">Kullanıcı: ${log.actorName || "Bilinmiyor"} · ${formatDate(log.createdAt)}</div>
        </article>
    `).join("");
}
