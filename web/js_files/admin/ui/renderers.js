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
        return `
            <tr class="personnel-main-row" data-user-id="${u.id}" style="cursor:pointer;">
                <td>
                    <div class="personnel-name-wrap">
                        <strong>${fullName || "-"}</strong>
                    </div>
                </td>
                <td>${u.company ? `<strong>${u.company}</strong> <small style="color:#64748b; margin-left:4px;">(#${u.dealerCode || '0000'})</small>` : "-"}</td>
                <td><span style="font-size: 0.8rem; color: #64748b;">${u.department || u.city || "-"}</span></td>
                <td>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <span class="badge badge-role ${u.subRole === "manager" ? "badge-role-manager" : "badge-role-employee"}">${u.subRole === "manager" ? "PATRON" : "ÇALIŞAN"}</span>
                        ${u.isActive === false ? '<span class="badge" style="background:#fef2f2; color:#dc2626; border:1px solid #fee2e2;">PASİF</span>' : ''}
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
