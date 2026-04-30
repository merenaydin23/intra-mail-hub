import { createUserRecord, getAllUsers } from "../services/user-service.js";
import { generateEnterpriseEmail, generateStrictPassword, normalizeTr } from "../utils/user-utils.js";
import { getRandomCityForRegion, getCitiesForRegion } from "../utils/location-utils.js";
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
    const dealerCodeIn = document.getElementById("newDealerCode");
    const emailPreview = document.getElementById("newEmail");
    const form = document.getElementById("addUserForm");

    if (!form) return;
    if (pwIn) pwIn.value = generateStrictPassword();

    let allUsersCache = [];
    const loadUsers = async () => {
        allUsersCache = await getAllUsers();
    };
    loadUsers();

    const updateCities = () => {
        const selectedRegion = regionIn.value;
        const cities = getCitiesForRegion(selectedRegion);
        
        // Clear and populate city select
        const currentCity = cityIn.value;
        cityIn.innerHTML = '<option value="" disabled selected>Şehir seçiniz</option>';
        cities.forEach(city => {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            cityIn.appendChild(opt);
        });

        // Re-select if possible (for initial load/factory mode)
        if (cities.includes(currentCity)) {
            cityIn.value = currentCity;
        }
    };

    const updateDealers = () => {
        const selRegion = regionIn.value;
        const selCity = cityIn.value;

        let filtered = allUsersCache.filter(u => u.company && u.category !== 'factory');
        
        if (selRegion) {
            filtered = filtered.filter(u => u.region === selRegion);
        }
        if (selCity) {
            filtered = filtered.filter(u => u.city === selCity);
        }

        const dealers = [...new Set(filtered.map(u => u.company))];

        const datalist = document.getElementById("companySuggestions");
        if (datalist) {
            datalist.innerHTML = "";
            dealers.forEach(d => {
                const opt = document.createElement("option");
                opt.value = d;
                datalist.appendChild(opt);
            });
        }
    };

    let lastRegion = "";

    const updateUI = () => {
        // Dealer Consistency Check
        let lockedByDealer = false;
        if (catIn.value === "local" && companyIn.value.trim()) {
            const companyName = companyIn.value.trim();
            const existingDealer = allUsersCache.find(u => u.company === companyName && u.city && u.region);
            if (existingDealer) {
                regionIn.value = existingDealer.region;
                if (lastRegion !== existingDealer.region) {
                    updateCities();
                    lastRegion = existingDealer.region;
                }
                // Find the city in the select options to ensure exact match
                const targetCity = existingDealer.city;
                const options = Array.from(cityIn.options);
                const matchingOption = options.find(opt => 
                    opt.value.toLocaleLowerCase('tr-TR') === targetCity.toLocaleLowerCase('tr-TR')
                );
                
                if (matchingOption) {
                    cityIn.value = matchingOption.value;
                } else {
                    cityIn.value = targetCity;
                }
                
                dealerCodeIn.value = existingDealer.dealerCode || "";
                lockedByDealer = true;
            }
        }

        if (catIn.value === "factory") {
            companyIn.value = "Bellona Genel Müdürlük";
            companyIn.style.display = "block";
            regionCompanyIn.style.display = "none";
            companyIn.readOnly = true;
            if (regionIn) {
                regionIn.value = "İç Anadolu";
                regionIn.disabled = true;
            }
            if (cityIn) {
                if (lastRegion !== "İç Anadolu") {
                    updateCities();
                    lastRegion = "İç Anadolu";
                }
                cityIn.value = "Kayseri";
                cityIn.disabled = true;
            }
            if (dealerCodeIn) {
                dealerCodeIn.value = "0000";
                dealerCodeIn.disabled = true;
            }
        } else if (catIn.value === "regional") {
            companyIn.style.display = "none";
            regionCompanyIn.style.display = "block";
            companyIn.readOnly = false;
            if (regionIn) regionIn.disabled = false;
            if (cityIn) {
                cityIn.disabled = false;
                if (regionIn.value !== lastRegion) {
                    updateCities();
                    lastRegion = regionIn.value;
                }
            }
        } else {
            companyIn.style.display = "block";
            regionCompanyIn.style.display = "none";
            companyIn.readOnly = false;
            if (companyIn.value === "Bellona Genel Müdürlük") companyIn.value = "";
            
            if (lockedByDealer) {
                regionIn.disabled = true;
                cityIn.disabled = true;
                if (dealerCodeIn) dealerCodeIn.disabled = true;
            } else {
                if (regionIn) regionIn.disabled = false;
                if (cityIn) {
                    cityIn.disabled = false;
                    if (regionIn.value !== lastRegion) {
                        updateCities();
                        lastRegion = regionIn.value;
                    }
                }
                if (dealerCodeIn) dealerCodeIn.disabled = false;
            }
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
            const code = dealerCodeIn?.value || "xxxx";
            emailPreview.value = `${normalizeTr(nameIn.value)}.${normalizeTr(surnameIn.value)}.${code}@bellona.com.tr`;
        }
    };

    [nameIn, surnameIn, catIn, roleIn, companyIn, dealerCodeIn].forEach((el) => el?.addEventListener("input", updateUI));
    regionIn?.addEventListener("change", () => {
        updateCities();
        updateDealers();
        updateUI();
    });
    cityIn?.addEventListener("change", updateDealers);
    catIn?.addEventListener("change", updateDealers);
    updateUI();

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const dealerCode = dealerCodeIn?.value || "0000";
        const email = await generateEnterpriseEmail(nameIn.value, surnameIn.value, dealerCode);
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
            dealerCode: dealerCode,
            subRole: roleIn.value,
            email: emailPreview.value,
            department: roleIn.value === "manager"
                ? (catIn.value === "factory" ? "Fabrika Müdürü" : "Bayi Sahibi")
                : document.getElementById("newDept").value,
            email,
            password: pwIn.value,
            role: "user",
            isActive: true
        };

        // FINAL CONSISTENCY CHECK
        const duplicateDealer = allUsersCache.find(u => 
            u.company?.toLocaleLowerCase('tr-TR') === data.company.toLocaleLowerCase('tr-TR') && 
            u.city?.toLocaleLowerCase('tr-TR') === data.city.toLocaleLowerCase('tr-TR') &&
            u.dealerCode !== data.dealerCode
        );

        if (duplicateDealer) {
            alert(`HATA: "${data.company}" bayisi "${data.city}" şehrinde zaten #${duplicateDealer.dealerCode} kodu ile kayıtlı.\n\nSiz #${data.dealerCode} kodu ile kaydetmeye çalışıyorsunuz. Lütfen bayi kodunu kontrol ediniz!`);
            return;
        }

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
