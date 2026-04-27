import { initDashboardPage } from "./admin/pages/dashboard-page.js";
import { initPersonnelPage } from "./admin/pages/personnel-page.js";
import { initRegisterPage, generateStrictPassword } from "./admin/pages/register-page.js";
import { initMessagesPage } from "./admin/pages/messages-page.js";

export { generateStrictPassword };

document.addEventListener("DOMContentLoaded", () => {
    const path = window.location.pathname;
    if (path.includes("yonetim.html")) initDashboardPage();
    if (path.includes("yonetim_personel.html")) initPersonnelPage();
    if (path.includes("yonetim_ekle.html")) initRegisterPage();
    if (path.includes("yonetim_mesajlar.html")) initMessagesPage();
});
