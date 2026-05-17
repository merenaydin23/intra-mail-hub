// page_guard.js - Sayfa Koruma Güvenliği / Page Guard
import { auth, db } from './firebase/config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global overlay setup to hide unauthorized screen flashing
const hideScreenOverlay = document.createElement('div');
hideScreenOverlay.id = 'pageGuardOverlay';
hideScreenOverlay.style.position = 'fixed';
hideScreenOverlay.style.top = '0';
hideScreenOverlay.style.left = '0';
hideScreenOverlay.style.width = '100vw';
hideScreenOverlay.style.height = '100vh';
hideScreenOverlay.style.backgroundColor = '#041618'; // Deep Bellona dark background
hideScreenOverlay.style.zIndex = '999999';
hideScreenOverlay.style.display = 'flex';
hideScreenOverlay.style.flexDirection = 'column';
hideScreenOverlay.style.alignItems = 'center';
hideScreenOverlay.style.justifyContent = 'center';
hideScreenOverlay.style.color = '#ffffff';
hideScreenOverlay.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
hideScreenOverlay.style.transition = 'opacity 0.4s ease';
hideScreenOverlay.innerHTML = `
    <div style="text-align: center; max-width: 480px; padding: 2.5rem; background: rgba(0, 130, 138, 0.05); border: 1px solid rgba(0, 130, 138, 0.15); border-radius: 24px; backdrop-filter: blur(20px); box-shadow: 0 20px 50px rgba(0,0,0,0.3);">
        <i class="fa-solid fa-shield-halved fa-spin-pulse" style="font-size: 3.5rem; color: #00a4ad; margin-bottom: 1.5rem;"></i>
        <h2 style="font-size: 1.5rem; margin-bottom: 0.75rem; font-weight: 700; color: #ffffff;">Kimlik Doğrulanıyor</h2>
        <p style="font-size: 0.95rem; color: rgba(255,255,255,0.7); line-height: 1.6; margin-bottom: 0;">Bellona IntraHub güvenlik protokolü çalıştırılıyor. Lütfen bekleyin...</p>
    </div>
`;
document.documentElement.appendChild(hideScreenOverlay);

onAuthStateChanged(auth, async (user) => {
    const currentPath = window.location.pathname.toLowerCase();

    // 1. Oturum kontrolü
    if (!user) {
        showUnauthorizedNotice("Oturum Açılmadı", "Lütfen sisteme giriş yapın. Giriş ekranına yönlendiriliyorsunuz...", "/index.html");
        return;
    }

    try {
        // 2. Firestore'dan kullanıcının rolünü/kategorisini çek
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
            showUnauthorizedNotice("Kullanıcı Bulunamadı", "Güvenlik profili bulunamadı. Lütfen sistem yöneticinizle irtibata geçin.", "/index.html");
            return;
        }

        const userData = userDoc.data();
        const userCategory = userData.category || 'local'; // 'local', 'regional', 'factory', 'admin'
        const userSubRole = userData.subRole || 'employee'; // 'employee', 'manager', 'admin'

        // Yetkilendirme eşleştirme haritası
        let isAuthorized = false;
        let correctDestination = "/index.html";
        let destinationName = "Giriş Ekranı";

        // Rol ve sayfa eşleşme kuralları
        if (userCategory === 'admin' || userSubRole === 'admin') {
            correctDestination = "/pages/admin/yonetim_mesajlar.html";
            destinationName = "Yönetici Paneli";
            if (currentPath.includes("/pages/admin/")) {
                isAuthorized = true;
            }
        } else if (userCategory === 'factory') {
            correctDestination = "/pages/portals/fabrika.html";
            destinationName = "Fabrika Genel Merkez Portalı";
            if (currentPath.includes("/pages/portals/fabrika.html")) {
                isAuthorized = true;
            }
        } else if (userCategory === 'regional') {
            correctDestination = "/pages/portals/bolge.html";
            destinationName = "Bölge Sorumlusu Portalı";
            if (currentPath.includes("/pages/portals/bolge.html")) {
                isAuthorized = true;
            }
        } else if (userCategory === 'local' && userSubRole === 'manager') {
            correctDestination = "/pages/portals/yerel.html";
            destinationName = "Bayi Yöneticisi Portalı";
            if (currentPath.includes("/pages/portals/yerel.html")) {
                isAuthorized = true;
            }
        } else {
            // 'local' ve 'employee' (Çalışan)
            correctDestination = "/pages/portals/calisan.html";
            destinationName = "Mağaza Çalışan Portalı";
            if (currentPath.includes("/pages/portals/calisan.html")) {
                isAuthorized = true;
            }
        }

        if (isAuthorized) {
            // Yetkili ise, overlay'i kaldır ve sayfayı göster
            hideScreenOverlay.style.opacity = '0';
            setTimeout(() => hideScreenOverlay.remove(), 400);
        } else {
            // Yetkisiz ise, şık uyarı verip yetkili olduğu portala yönlendir
            showUnauthorizedNotice(
                "Erişim Engellendi 🔒", 
                `Bu sayfaya erişim yetkiniz bulunmamaktadır. Yetkili olduğunuz <strong>${destinationName}</strong> alanına 2 saniye içerisinde yönlendiriliyorsunuz...`, 
                correctDestination
            );
        }

    } catch (err) {
        console.error("Page Guard Error:", err);
        showUnauthorizedNotice("Güvenlik Hatası", "Kimlik doğrulaması sırasında sistemsel bir hata oluştu.", "/index.html");
    }
});

// Şık Glassmorphic Uyarı Paneli Enjeksiyonu
function showUnauthorizedNotice(title, text, redirectUrl) {
    hideScreenOverlay.innerHTML = `
        <div style="text-align: center; max-width: 480px; padding: 3rem 2.5rem; background: rgba(225, 29, 72, 0.04); border: 1.5px solid rgba(225, 29, 72, 0.2); border-radius: 28px; backdrop-filter: blur(24px); box-shadow: 0 25px 60px rgba(0,0,0,0.4); animation: shake 0.5s ease-in-out;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 4rem; color: #f43f5e; text-shadow: 0 0 30px rgba(244,63,94,0.3); margin-bottom: 1.5rem;"></i>
            <h2 style="font-size: 1.7rem; margin-bottom: 1rem; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">${title}</h2>
            <p style="font-size: 1rem; color: rgba(255,255,255,0.75); line-height: 1.7; margin-bottom: 0;">${text}</p>
        </div>
        
        <style>
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
                20%, 40%, 60%, 80% { transform: translateX(6px); }
            }
        </style>
    `;

    setTimeout(() => {
        window.location.href = redirectUrl;
    }, 2000);
}
