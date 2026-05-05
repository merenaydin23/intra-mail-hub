import { getAuditLogs } from "../services/audit-service.js";

export async function initAuditPage() {
    const timeline = document.getElementById("auditTimeline");
    const btnRefresh = document.getElementById("btnRefreshAudit");

    const renderLogs = async () => {
        if (timeline) {
            timeline.innerHTML = '<div class="empty-audit"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:1rem;">Kayıtlar çekiliyor...</p></div>';
        }

        try {
            const logs = await getAuditLogs(50);
            if (!timeline) return;

            if (logs.length === 0) {
                timeline.innerHTML = '<div class="empty-audit"><i class="fa-solid fa-circle-info fa-2x" style="opacity:0.2;"></i><p style="margin-top:1rem;">Henüz bir işlem kaydı bulunmuyor.</p></div>';
                return;
            }

            timeline.innerHTML = logs.map(log => {
                const date = log.createdAt?.toDate() || new Date();
                const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                const dateStr = date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
                
                let actionClass = 'tag-update';
                let icon = 'fa-pen-to-square';

                if (log.action.includes('EKLEME')) {
                    actionClass = 'tag-add';
                    icon = 'fa-user-plus';
                } else if (log.action.includes('SİLME')) {
                    actionClass = 'tag-delete';
                    icon = 'fa-user-minus';
                } else if (log.action.includes('GİRİŞ') || log.action.includes('YETKİ')) {
                    actionClass = 'tag-auth';
                    icon = 'fa-shield-halved';
                }

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
                                <span class="audit-actor">${log.actorName}</span>
                                <span class="audit-action-tag ${actionClass}">${log.action}</span>
                            </div>
                            <div class="audit-detail">${log.detail}</div>
                            <div class="audit-target">
                                <i class="fa-solid fa-link"></i>
                                <span>Hedef: ${log.targetType} / ${log.targetId}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error("Audit logs error:", error);
            if (timeline) {
                timeline.innerHTML = '<div class="empty-audit"><i class="fa-solid fa-triangle-exclamation fa-2x" style="color:#ef4444;"></i><p style="margin-top:1rem;">Veriler yüklenirken bir hata oluştu.</p></div>';
            }
        }
    };

    if (btnRefresh) {
        btnRefresh.addEventListener("click", renderLogs);
    }

    renderLogs();
}
