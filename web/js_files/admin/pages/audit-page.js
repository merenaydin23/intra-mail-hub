import { getAuditLogs } from "../services/audit-service.js";

let allLogs = [];
let activeRange = 'today';
let customDate = null;

export async function initAuditPage() {
    const timeline = document.getElementById("auditTimeline");
    const btnRefresh = document.getElementById("btnRefreshAudit");
    const datePicker = document.getElementById("auditDatePicker");
    const actionFilter = document.getElementById("auditActionFilter");
    const userFilter = document.getElementById("auditUserFilter");

    if (actionFilter) actionFilter.addEventListener('change', renderFiltered);
    if (userFilter) userFilter.addEventListener('input', renderFiltered);

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

    setupExportBtn();
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
    let filtered = logs;

    // 1. Date Filter
    if (activeRange === 'custom' && customDate) {
        const target = new Date(customDate);
        filtered = filtered.filter(log => {
            const d = log.createdAt?.toDate() || new Date(0);
            return d.toDateString() === target.toDateString();
        });
    } else if (activeRange === 'today') {
        filtered = filtered.filter(log => {
            const d = log.createdAt?.toDate() || new Date(0);
            return d.toDateString() === now.toDateString();
        });
    } else if (activeRange === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        filtered = filtered.filter(log => {
            const d = log.createdAt?.toDate() || new Date(0);
            return d >= weekAgo;
        });
    } else if (activeRange === 'month') {
        const monthAgo = new Date(now);
        monthAgo.setMonth(now.getMonth() - 1);
        filtered = filtered.filter(log => {
            const d = log.createdAt?.toDate() || new Date(0);
            return d >= monthAgo;
        });
    }

    // 2. Action Type Filter
    const actionFilter = document.getElementById("auditActionFilter");
    if (actionFilter && actionFilter.value !== 'all') {
        const val = actionFilter.value;
        filtered = filtered.filter(log => {
            const act = (log.action || '').toUpperCase();
            if (val === 'EKLEME') return act.includes('EKLE');
            if (val === 'SİLME') return act.includes('SİL') || act.includes('SIL') || act.includes('PASİF') || act.includes('PASIF');
            if (val === 'GÜNCELLEME') return act.includes('GÜNCELLE') || act.includes('GUNCELLE');
            if (val === 'GİRİŞ') return act.includes('GİRİŞ') || act.includes('GIRIS') || act.includes('YETKİ') || act.includes('YETKI');
            if (val === 'MESAJ') return act.includes('MESAJ') || act.includes('DUYURU');
            return act.includes(val);
        });
    }

    // 3. User Filter
    const userFilter = document.getElementById("auditUserFilter");
    if (userFilter && userFilter.value.trim() !== '') {
        const query = userFilter.value.trim().toLowerCase();
        filtered = filtered.filter(log => 
            (log.actorName && log.actorName.toLowerCase().includes(query)) ||
            (log.detail && log.detail.toLowerCase().includes(query))
        );
    }

    return filtered;
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


// ── CSV EXPORT ─────────────────────────────────────────────────
function setupExportBtn() {
    const btnExport = document.getElementById('btnExportAuditCSV');
    if (!btnExport) return;
    
    btnExport.addEventListener('click', () => {
        const filtered = filterLogs(allLogs);
        if (filtered.length === 0) {
            alert('Dışa aktarılacak kayıt bulunamadı.');
            return;
        }
        
        const headers = ['Tarih', 'Saat', 'Islem Tipi', 'Hedef', 'Kisi', 'E-posta', 'Detay'];
        const rows = [];
        
        filtered.forEach(log => {
            const date = log.createdAt?.toDate() || new Date();
            const dateStr = date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            
            const content = (log.detail || '').replace(/"/g, '""').replace(/\n/g, ' ');
            
            rows.push([
                `"${dateStr}"`,
                `"${timeStr}"`,
                `"${log.action || '-'}"`,
                `"${log.targetType || '-'}"`,
                `"${log.actorName || '-'}"`,
                `"${log.actorEmail || '-'}"`,
                `"${content}"`
            ].join(','));
        });
        
        const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n'); // BOM for Turkish chars
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        let dateName = 'Tum_Zamanlar';
        if (activeRange === 'today' || customDate) {
            dateName = (customDate || new Date()).toLocaleDateString('tr-TR').replace(/\./g, '-');
        } else if (activeRange === 'week') {
            dateName = 'Son_7_Gun';
        } else if (activeRange === 'month') {
            dateName = 'Son_30_Gun';
        }
        
        a.download = `Islem_Gecmisi_${dateName}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    });
}
