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
        const initials = `${(u.name?.[0] || "")}${(u.surname?.[0] || "")}`;
        const roleBadge = u.subRole === "manager" ? '<span class="badge badge-patron">PATRON</span>' : '<span class="badge badge-calisan">ÇALIŞAN</span>';
        const statusBadge = u.isActive !== false ? '<span class="badge badge-saas-green"><i class="fa-solid fa-check"></i> AKTİF</span>' : '<span class="badge badge-saas-red"><i class="fa-solid fa-xmark"></i> PASİF</span>';

        return `
            <tr class="personnel-main-row" data-user-id="${u.id}">
                <td style="padding: 1.25rem 1.5rem;">
                    <div class="personnel-name-wrap">
                        <div class="user-avatar-mini">${initials}</div>
                        <div class="user-info-text">
                            <strong>${u.name || ""} ${u.surname || ""}</strong>
                            <small>${u.email || ''}</small>
                        </div>
                    </div>
                </td>
                <td style="padding: 1.25rem 1.5rem;">
                    <div class="company-info-wrap">
                        <strong>${u.company || 'Birim Bilgisi Yok'}</strong>
                        <small>Bayi Kodu: ${u.dealerCode || '-'}</small>
                    </div>
                </td>
                <td style="padding: 1.25rem 1.5rem;">
                    <div class="role-status-wrap">
                        ${roleBadge}
                        ${statusBadge}
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
        const isBirthday = m.type === 'birthday_manual' || m.type === 'birthday_auto';
        const isAuto = m.type === 'birthday_auto';

        if (isBirthday) {
            const bdayBadge = isAuto
                ? `<span class="msg-bday-badge msg-bday-badge--auto"><i class="fa-solid fa-robot"></i> Otomatik</span>`
                : `<span class="msg-bday-badge msg-bday-badge--manual"><i class="fa-solid fa-hand"></i> Elle Gönderildi</span>`;
            return `
            <article class="msg-card msg-bday-card" data-msg-id="${m.id}" data-type="${m.type}">
                <div class="msg-bday-header">
                    <div class="msg-bday-icon">🎂</div>
                    <div class="msg-bday-meta">
                        <div class="msg-bday-subject">${m.subject || "Doğum Günü Tebriği"}</div>
                        <div class="msg-bday-to"><i class="fa-solid fa-user"></i> ${m.receiverName || '-'}</div>
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.4rem;">
                        ${bdayBadge}
                        <span class="msg-bday-time"><i class="fa-regular fa-clock"></i> ${time}</span>
                    </div>
                </div>
            </article>`;
        }

        // Normal mesaj kartı
        const replyCount = m.replies ? m.replies.length : 0;
        const totalCount = 1 + replyCount;
        const badgeHtml = replyCount > 0 
            ? `<span style="background:var(--brand-soft); color:var(--brand); font-size:0.68rem; font-weight:800; padding:2px 6px; border-radius:6px; display:inline-flex; align-items:center; gap:3px; margin-left:6px; vertical-align:middle;"><i class="fa-solid fa-comments" style="font-size:0.65rem;"></i> ${totalCount}</span>` 
            : '';

        return `
        <article class="msg-card" data-msg-id="${m.id}" data-type="${m.type || 'direct'}">
            <div class="msg-card-top">
                <span class="msg-card-sender"><i class="fa-solid fa-paper-plane" style="font-size:0.75rem; opacity:0.6; margin-right:4px;"></i>${m.senderName || 'Bilinmiyor'}</span>
                <span class="msg-card-time">${time}${badgeHtml}</span>
            </div>
            <div class="msg-card-subject">${m.subject || 'Konu Yok'}</div>
            <div class="msg-card-preview">${m.lastMessage || m.content || '...'}</div>
        </article>
        `;
    }).join("");
}
