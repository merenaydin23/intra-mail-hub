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
        const roleLabel = u.subRole === "manager" ? "PATRON" : "ÇALIŞAN";
        const roleClass = u.subRole === "manager" ? "badge-saas-green" : "badge-saas-blue";
        const statusHtml = u.isActive === false ? '<span class="badge badge-saas-red" style="margin-left: 8px;">PASİF</span>' : '<span class="badge badge-saas-mint" style="margin-left: 8px;">AKTİF</span>';

        return `
            <tr class="personnel-main-row" data-user-id="${u.id}">
                <td>
                    <div class="personnel-name-wrap">
                        <span class="user-avatar-mini">${(u.name?.[0] || "")}${(u.surname?.[0] || "")}</span>
                        <div class="user-info-text">
                            <strong>${fullName || "-"}</strong>
                            <small>${u.email || ""}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="company-info-wrap">
                        <strong>${u.company || "Bellona Merkez"}</strong>
                        <small>#${u.dealerCode || '0000'}</small>
                    </div>
                </td>
                <td>
                    <div class="role-status-wrap">
                        <span class="badge ${roleClass}">${roleLabel}</span>
                        ${statusHtml}
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
    container.innerHTML = messages.map((m) => {
        const time = formatDate(m.timestamp);
        return `
        <article class="audit-item message-item" onclick="this.classList.toggle('expanded')">
            <div class="message-summary-row" style="display:flex; justify-content:space-between; align-items:center;">
                <div class="audit-title" style="color: var(--brand-dark); font-weight: 700;">
                    <i class="fa-solid fa-envelope" style="margin-right: 6px; font-size: 0.8rem; opacity: 0.7;"></i>
                    ${m.subject || "Konu Yok"}
                </div>
                <div class="audit-meta" style="font-size: 0.75rem; color: var(--text-light);">
                    <i class="fa-regular fa-clock"></i> ${time}
                </div>
            </div>
            
            <div class="audit-meta" style="margin-top: 6px; display:flex; gap:10px; font-size:0.8rem;">
                <span style="color:#475569;"><strong style="color:var(--brand-dark)">G:</strong> ${m.senderName || 'Bilinmiyor'}</span>
                <span style="color:#475569;"><strong style="color:var(--brand-dark)">A:</strong> ${m.receiverName || 'Bilinmiyor'}</span>
            </div>

            <div class="message-content-body">
                ${m.content || "İçerik yok..."}
            </div>
        </article>
        `;
    }).join("");
}
