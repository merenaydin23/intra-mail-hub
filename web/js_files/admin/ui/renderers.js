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
                            <div><span class="detail-label">Şehir</span><span class="detail-value">${u.city || "-"}</span></div>
                            <div><span class="detail-label">Bölge</span><span class="detail-value">${u.region || "-"}</span></div>
                            <div><span class="detail-label">Kategori</span><span class="detail-value">${catLabel}</span></div>
                            <div><span class="detail-label">Bayi Kodu</span><span class="detail-value">#${u.dealerCode || "0000"}</span></div>
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

export function renderMessageFeed(container, messages) {
    if (!container) return;
    if (!messages.length) {
        container.innerHTML = `<div class="audit-empty"><i class="fa-solid fa-comment-slash"></i><br>Görüntülenecek mesaj bulunamadı.</div>`;
        return;
    }
    container.innerHTML = messages.map((m) => `
        <article class="audit-item message-item">
            <div class="audit-title" style="color: var(--brand-dark); font-weight: 700;">
                <i class="fa-solid fa-envelope" style="margin-right: 6px; font-size: 0.8rem; opacity: 0.7;"></i>
                ${m.subject || "Konu Yok"}
            </div>
            <div class="audit-meta" style="margin-top: 4px;">
                <strong>Gönderen:</strong> ${m.senderName || "Bilinmiyor"}
            </div>
            <div class="audit-meta" style="font-style: italic; color: var(--text-muted); margin-top: 4px; border-left: 2px solid var(--border); padding-left: 8px;">
                "${m.lastMessage || m.content?.replace(/<[^>]*>/g, '').substring(0, 80) || "İçerik yok..."}"
            </div>
            <div class="audit-meta" style="margin-top: 6px; font-size: 0.75rem; color: var(--text-light);">
                <i class="fa-regular fa-clock"></i> ${formatDate(m.timestamp)}
            </div>
        </article>
    `).join("");
}
