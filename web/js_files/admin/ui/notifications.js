/**
 * Premium Toast Notification System
 */
export function showToast(message, type = 'success', title = '') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const iconMap = {
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        info: 'fa-circle-info'
    };

    const defaultTitles = {
        success: 'Başarılı',
        error: 'Hata',
        info: 'Bilgi'
    };

    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${iconMap[type]}"></i></div>
        <div class="toast-content">
            <span class="toast-title">${title || defaultTitles[type]}</span>
            <span class="toast-msg">${message}</span>
        </div>
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
