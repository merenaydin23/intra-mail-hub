import { createUserRecord } from "../services/user-service.js";
import { generateEnterpriseEmail, generateStrictPassword, normalizeTr } from "../utils/user-utils.js";
import { getRandomCityForRegion } from "../utils/location-utils.js";
import { getSessionActor } from "../auth/session-service.js";
import { writeAuditLog } from "../services/audit-service.js";

export { generateStrictPassword };

export function initRegisterPage() {
    const nameIn = document.getElementById("newName");
    const surnameIn = document.getElementById("newSurname");
    const catIn = document.getElementById("newCategory");
    const roleIn = document.getElementById("newSubRole");
    const regionIn = document.getElementById("newRegion");
    const cityIn = document.getElementById("newCity");
    const companyIn = document.getElementById("newCompany");
    const regionCompanyIn = document.getElementById("newRegionCompany");
    const deptGroup = document.getElementById("deptGroup");
    const pwIn = document.getElementById("newPassword");
    const phoneIn = document.getElementById("newPhone");
    const emailPreview = document.getElementById("newEmail");
    const form = document.getElementById("addUserForm");

    if (!form) return;
    if (pwIn) pwIn.value = generateStrictPassword();

    const updateUI = () => {
        if (catIn.value === "factory") {
            companyIn.value = "Bellona Genel Müdürlük";
            companyIn.style.display = "block";
            regionCompanyIn.style.display = "none";
            companyIn.readOnly = true;
            if (regionIn) {
                regionIn.value = "İç Anadolu";
                regionIn.disabled = true;
            }
            if (cityIn) cityIn.value = "Kayseri";
        } else if (catIn.value === "regional") {
            companyIn.style.display = "none";
            regionCompanyIn.style.display = "block";
            companyIn.readOnly = false;
            if (regionIn) regionIn.disabled = false;
            if (cityIn) cityIn.value = getRandomCityForRegion(regionIn.value);
        } else {
            companyIn.style.display = "block";
            regionCompanyIn.style.display = "none";
            companyIn.readOnly = false;
            if (companyIn.value === "Bellona Genel Müdürlük") companyIn.value = "";
            if (regionIn) regionIn.disabled = false;
            if (cityIn) cityIn.value = getRandomCityForRegion(regionIn.value);
        }

        deptGroup.style.display = roleIn.value === "manager" ? "none" : "block";

        const optF = document.getElementById("optFactory");
        const optR = document.getElementById("optRegional");
        const optL = document.getElementById("optLocal");
        if (optF) optF.style.display = catIn.value === "factory" ? "block" : "none";
        if (optR) optR.style.display = catIn.value === "regional" ? "block" : "none";
        if (optL) optL.style.display = catIn.value === "local" ? "block" : "none";
        const deptInput = document.getElementById("newDept");
        if (deptInput && roleIn.value !== "manager") deptInput.value = "";

        if (nameIn.value && surnameIn.value) {
            emailPreview.value = `${normalizeTr(nameIn.value)}.${normalizeTr(surnameIn.value)}@bellona.com.tr`;
        }
    };

    [nameIn, surnameIn, catIn, roleIn, regionIn].forEach((el) => el?.addEventListener("input", updateUI));
    updateUI();

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = await generateEnterpriseEmail(nameIn.value, surnameIn.value);
        const finalCompany = catIn.value === "regional" ? regionCompanyIn.value : companyIn.value;
        const data = {
            name: nameIn.value,
            surname: surnameIn.value,
            birthDate: document.getElementById("newBirth").value,
            phone: phoneIn?.value.trim() || "",
            city: cityIn?.value || "",
            category: catIn.value,
            region: regionIn.value,
            company: finalCompany,
            subRole: roleIn.value,
            department: roleIn.value === "manager"
                ? (catIn.value === "factory" ? "Fabrika Müdürü" : "Bayi Sahibi")
                : document.getElementById("newDept").value,
            email,
            password: pwIn.value,
            role: "user",
            isActive: true
        };

        const created = await createUserRecord(data);
        const actor = await getSessionActor();
        await writeAuditLog({
            actor,
            action: "PERSONEL_EKLEME",
            targetType: "users",
            targetId: created.id,
            detail: `${data.name} ${data.surname} (${data.email}) eklendi.`
        });

        alert(`Personel başarıyla kaydedildi!\nE-posta: ${email}`);
        location.reload();
    });
}
