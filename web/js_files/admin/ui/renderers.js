function formatDate(ts) {
    if (!ts) return "-";
    const dt = ts?.toDate ? ts.toDate() : new Date(ts);
    return dt.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

export function renderTableRows(tbody, users) {
    if (!tbody) return;
    tbody.innerHTML = users.map((u) => {
        let catLabel = "Bilinmiyor";
        if (u.category === "factory") catLabel = "FABRİKA";
        if (u.category === "regional") catLabel = "BÖLGE BAYİSİ";
        if (u.category === "local") catLabel = "YEREL BAYİ";
        return `
            <tr>
                <td><strong>${u.name} ${u.surname}</strong></td>
                <td><small>${u.email}</small></td>
                <td><span class="badge" style="background:#f1f5f9; color:#475569;">${catLabel}</span></td>
                <td>${u.region || "-"}</td>
                <td>${u.company || "-"}</td>
                <td><span style="font-size: 0.8rem; color: #64748b;">${u.department || "-"}</span></td>
                <td><span class="badge ${u.subRole === "manager" ? "badge-accent" : "badge-primary"}">${u.subRole === "manager" ? "PATRON" : "ÇALIŞAN"}</span></td>
                <td><button data-action="delete-user" data-user-id="${u.id}" class="btn-delete"><i class="fa-solid fa-trash"></i></button></td>
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
