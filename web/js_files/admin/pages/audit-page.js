import { getAuditLogs } from "../services/audit-service.js";

let allLogs = [];
let activeRange = 'today';
let customDate = null;

export async function initAuditPage() {
    const timeline = document.getElementById("auditTimeline");
    const btnRefresh = document.getElementById("btnRefreshAudit");
    const datePicker = document.getElementById("auditDatePicker");

    // Set today's date as default in picker
    const todayStr = new Date().toISOString().split('T')[0];
    if (datePicker) datePicker.value = todayStr;

    // Filter button click
    document.querySelectorAll('.audit-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.audit-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeRange = btn.dataset.range;
            customDate = null;
            if (datePicker) datePicker.value = '';
            renderFiltered();
        });
    });

    // Date picker change
    if (datePicker) {
        datePicker.addEventListener('change', () => {
            if (datePicker.value) {
                customDate = datePicker.value; // 'YYYY-MM-DD'
                activeRange = 'custom';
                document.querySelectorAll('.audit-filter-btn').forEach(b => b.classList.remove('active'));
            }
            renderFiltered();
        });
    }

    if (btnRefresh) {
        btnRefresh.addEventListener("click", loadLogs);
    }

    await loadLogs();
}

async function loadLogs() {
    const timeline = document.getElementById("auditTimeline");
    if (timeline) {
        timeline.innerHTML = '<div class="empty-audit"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:1rem;">Kayıtlar çekiliyor...</p></div>';
    }
    try {
        allLogs = await getAuditLogs(200);
        renderFiltered();
    } catch (error) {
        console.error("Audit logs error:", error);
        if (timeline) {
            timeline.innerHTML = '<div class="empty-audit"><i class="fa-solid fa-triangle-exclamation fa-2x" style="color:#ef4444;"></i><p style="margin-top:1rem;">Veriler yüklenirken bir hata oluştu.</p></div>';
        }
    }
}

function filterLogs(logs) {
    const now = new Date();

    if (activeRange === 'custom' && customDate) {
        const target = new Date(customDate);
        return logs.filter(log => {
            const d = log.createdAt?.toDate() || new Date(0);
            return d.toDateString() === target.toDateString();
        });
    }

    if (activeRange === 'today') {
        return logs.filter(log => {
            const d = log.createdAt?.toDate() || new Date(0);
            return d.toDateString() === now.toDateString();
        });
    }

    if (activeRange === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return logs.filter(log => {
            const d = log.createdAt?.toDate() || new Date(0);
            return d >= weekAgo;
        });
    }

    if (activeRange === 'month') {
        const monthAgo = new Date(now);
        monthAgo.setMonth(now.getMonth() - 1);
        return logs.filter(log => {
            const d = log.createdAt?.toDate() || new Date(0);
            return d >= monthAgo;
        });
    }

    return logs; // 'all'
}

function renderFiltered() {
    const timeline = document.getElementById("auditTimeline");
    const countEl = document.getElementById("auditResultCount");

    const filtered = filterLogs(allLogs);

    if (countEl) countEl.textContent = `${filtered.length} kayıt`;

    if (!timeline) return;

    if (filtered.length === 0) {
        timeline.innerHTML = '<div class="empty-audit"><i class="fa-solid fa-circle-info fa-2x" style="opacity:0.2;"></i><p style="margin-top:1rem;">Bu tarih aralığında işlem kaydı bulunamadı.</p></div>';
        return;
    }

    timeline.innerHTML = filtered.map(log => {
        const date = log.createdAt?.toDate() || new Date();
        const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });

        let actionClass = 'tag-update';
        let icon = 'fa-pen-to-square';

        if (log.action.includes('EKLEME')) {
            actionClass = 'tag-add';
            icon = 'fa-user-plus';
        } else if (log.action.includes('SİLME') || log.action.includes('SILME')) {
            actionClass = 'tag-delete';
            icon = 'fa-trash';
        } else if (log.action.includes('GİRİŞ') || log.action.includes('YETKİ')) {
            actionClass = 'tag-auth';
            icon = 'fa-shield-halved';
        } else if (log.action.includes('MESAJ')) {
            actionClass = 'tag-delete';
            icon = 'fa-envelope-circle-check';
        }

        const boldActor = `<strong style="color: #004733; font-weight: 800;">${log.actorName}</strong>`;
        const detailWithBold = log.detail.replace(log.actorName, boldActor);

        return `
            <div class="audit-item">
                <div class="audit-time">
                    <span class="audit-time-clock">${timeStr}</span>
                    <span class="audit-time-date">${dateStr}</span>
                </div>
                <div class="audit-icon">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div class="audit-content">
                    <div class="audit-header">
                        <span class="audit-actor">${boldActor}</span>
                        <span class="audit-action-tag ${actionClass}">${log.action}</span>
                    </div>
                    <div class="audit-detail">${detailWithBold}</div>
                    <div class="audit-target">
                        <i class="fa-solid fa-link"></i>
                        <span>Hedef: ${log.targetType} / ${log.targetId}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
