import { getAllUsers, removeUserRecord } from "../services/user-service.js";
import { renderTableRows } from "../ui/renderers.js";
import { getSessionActor } from "../auth/session-service.js";
import { writeAuditLog } from "../services/audit-service.js";

let allUsers = [];

export async function initPersonnelPage() {
    const users = await getAllUsers();
    allUsers = users.filter((u) => u.role !== "admin");

    const searchIn = document.getElementById("searchUser");
    const filterCat = document.getElementById("filterCategory");
    const filterReg = document.getElementById("filterRegion");
    const tbody = document.getElementById("userTableBody");

    const applyFilters = () => {
        const term = (searchIn?.value || "").toLocaleLowerCase("tr-TR");
        const cat = filterCat?.value || "all";
        const reg = filterReg?.value || "all";

        const filtered = allUsers.filter((u) => {
            const fullName = `${u.name || ""} ${u.surname || ""} ${u.company || ""}`.toLocaleLowerCase("tr-TR");
            return fullName.includes(term)
                && (cat === "all" || u.category === cat)
                && (reg === "all" || u.region === reg);
        });
        renderTableRows(tbody, filtered);
    };

    [searchIn, filterCat, filterReg].forEach((el) => el?.addEventListener("input", applyFilters));
    renderTableRows(tbody, allUsers);

    tbody?.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-action='delete-user']");
        if (!btn) return;
        const userId = btn.getAttribute("data-user-id");
        const user = allUsers.find((x) => x.id === userId);
        if (!user) return;
        if (!confirm(`${user.name} ${user.surname} kaydı silinsin mi?`)) return;

        await removeUserRecord(userId);
        const actor = await getSessionActor();
        await writeAuditLog({
            actor,
            action: "PERSONEL_SILME",
            targetType: "users",
            targetId: userId,
            detail: `${user.name} ${user.surname} kaydı silindi.`
        });

        allUsers = allUsers.filter((x) => x.id !== userId);
        applyFilters();
    });
}
