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
    const totalCountEl = document.getElementById("totalPersonnelCount");
    const alphaFilter = document.getElementById("alphabetFilter");
    const sortIn = document.getElementById("sortUser");
    let selectedLetter = "all";

    // Alfabe butonlarını oluştur
    const alphabet = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split("");
    alphabet.forEach(l => {
        const btn = document.createElement("button");
        btn.className = "alpha-btn";
        btn.textContent = l;
        btn.dataset.letter = l;
        alphaFilter?.appendChild(btn);
    });

    alphaFilter?.addEventListener("click", (e) => {
        const btn = e.target.closest(".alpha-btn");
        if (!btn) return;
        alphaFilter.querySelectorAll(".alpha-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedLetter = btn.dataset.letter;
        applyFilters();
    });

    const applyFilters = () => {
        const term = (searchIn?.value || "").toLocaleLowerCase("tr-TR");
        const cat = filterCat?.value || "all";
        const reg = filterReg?.value || "all";

        let filtered = allUsers.filter((u) => {
            const fullName = `${u.name || ""} ${u.surname || ""} ${u.company || ""}`.toLocaleLowerCase("tr-TR");
            const firstChar = (u.name || "").charAt(0).toLocaleUpperCase("tr-TR");

            return fullName.includes(term)
                && (cat === "all" || u.category === cat)
                && (reg === "all" || u.region === reg)
                && (selectedLetter === "all" || firstChar === selectedLetter);
        });

        // Sorting Logic
        const sortVal = sortIn?.value || "name-asc";
        if (sortVal === "name-asc") {
            filtered.sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr"));
        } else if (sortVal === "name-desc") {
            filtered.sort((a, b) => (b.name || "").localeCompare(a.name || "", "tr"));
        } else if (sortVal === "newest") {
            // allUsers is already sorted by newest in service
        }

        renderTableRows(tbody, filtered);
        if (totalCountEl) totalCountEl.textContent = filtered.length;
    };

    [searchIn, filterCat, filterReg, sortIn].forEach((el) => el?.addEventListener("input", applyFilters));
    renderTableRows(tbody, allUsers);

    tbody?.addEventListener("click", async (event) => {
        const clickedRow = event.target.closest(".personnel-main-row");
        if (clickedRow) {
            const userId = clickedRow.getAttribute("data-user-id");
            const detailRow = tbody.querySelector(`.personnel-detail-row[data-detail-id="${userId}"]`);
            const chevron = clickedRow.querySelector(".detail-chevron");
            if (detailRow) {
                const isOpen = !detailRow.hasAttribute("hidden");
                detailRow.toggleAttribute("hidden", isOpen);
                if (chevron) chevron.classList.toggle("is-open", !isOpen);
            }
            return;
        }

        const btn = event.target.closest("[data-action='delete-user']");
        if (btn) {
            const userId = btn.getAttribute("data-user-id");
            const user = allUsers.find((x) => x.id === userId);
            if (!user) return;
            if (!confirm(`${user.name} ${user.surname} kaydı silinsin mi?`)) return;

            try {
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
                alert("Personel başarıyla silindi.");
            } catch (err) {
                console.error("Silme hatası:", err);
                alert("Hata: Kayıt silinemedi.");
            }
            return;
        }
    });
}
