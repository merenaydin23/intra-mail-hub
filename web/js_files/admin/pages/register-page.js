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

    const companySelectEl = document.getElementById("companySelect");

    let allUsersCache = [];
    const loadUsers = async () => {
        allUsersCache = await getAllUsers();
        updateDealers();
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

    // Bayileri şehre göre filtrele ve companySelect dropdown'a doldur
    const updateDealers = () => {
        const selRegion = regionIn.value;
        const selCity = cityIn.value;

        // Sadece yerel bayileri filtrele
        let filtered = allUsersCache.filter(u => u.company && u.category === 'local');
        if (selRegion) filtered = filtered.filter(u => u.region === selRegion);
        if (selCity)   filtered = filtered.filter(u => u.city === selCity);

        // Benzersiz bayi adı + kod çiftleri
        const seen = new Set();
        const uniqueDealers = [];
        filtered.forEach(u => {
            const key = u.company + '|' + (u.dealerCode || '0000');
            if (!seen.has(key)) {
                seen.add(key);
                uniqueDealers.push({ name: u.company, code: u.dealerCode || '0000' });
            }
        });
        uniqueDealers.sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));

        if (!companySelectEl) return;

        if (uniqueDealers.length > 0 && catIn.value === 'local') {
            // Dropdown'u göster, serbest alanı gizle
            companySelectEl.style.display = 'block';
            companyIn.style.display = 'none';
            companyIn.removeAttribute('required');
            companySelectEl.setAttribute('required', '');

            companySelectEl.innerHTML = '<option value="">-- Bayi seçiniz --</option>';
            uniqueDealers.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name;
                opt.dataset.code = d.code;
                opt.textContent = `${d.name}  —  #${d.code}`;
                companySelectEl.appendChild(opt);
            });
            // "Yeni bayi ekle" seçeneği
            const newOpt = document.createElement('option');
            newOpt.value = '__NEW__';
            newOpt.textContent = '➕ Yeni bayi ekle (elle yaz)';
            companySelectEl.appendChild(newOpt);
        } else {
            // Kayıtlı bayi yok veya başka kategori: sadece serbest alan göster
            companySelectEl.style.display = 'none';
            companyIn.style.display = 'block';
            companyIn.setAttribute('required', '');
            companySelectEl.removeAttribute('required');
        }
    };

    // companySelect değişince ad + kod alanlarını otomatik doldur
    if (companySelectEl) {
        companySelectEl.addEventListener('change', () => {
            const selected = companySelectEl.options[companySelectEl.selectedIndex];
            if (companySelectEl.value === '__NEW__') {
                // "Yeni bayi ekle" seçildi: serbest alana geç
                companySelectEl.style.display = 'none';
                companyIn.style.display = 'block';
                companyIn.setAttribute('required', '');
                companySelectEl.removeAttribute('required');
                companyIn.value = '';
                dealerCodeIn.value = '';
                dealerCodeIn.disabled = false;
                companyIn.focus();
            } else if (selected && selected.dataset.code) {
                companyIn.value = companySelectEl.value;   // gizli input'a ismi de yaz
                dealerCodeIn.value = selected.dataset.code;
                dealerCodeIn.disabled = true;              // kodu kilitle
            } else {
                companyIn.value = '';
                dealerCodeIn.value = '';
                dealerCodeIn.disabled = false;
            }
            updateUI();
        });
    }

    let lastRegion = "";

    const updateUI = () => {
        // Dealer Consistency Check
        let lockedByDealer = false;
        if (catIn.value === "local" && companyIn.value.trim()) {
            let companyName = companyIn.value.trim();

            // OTOMATİK PARÇALAMA: Eğer listeden "İsim (#Kod)" formatında seçildiyse ayır
            const match = companyName.match(/^(.+)\s\(#(\d+)\)$/);
            if (match) {
                const realName = match[1];
                const realCode = match[2];
                companyIn.value = realName;
                dealerCodeIn.value = realCode;
                companyName = realName;
            }

            const existingDealer = allUsersCache.find(u => 
                u.company?.toLocaleLowerCase('tr-TR') === companyName.toLocaleLowerCase('tr-TR') && 
                u.city && u.region
            );
            
            if (existingDealer) {
                regionIn.value = existingDealer.region;
                if (lastRegion !== existingDealer.region) {
                    updateCities();
                    lastRegion = existingDealer.region;
                }
                
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
            const cityGroupEl = document.getElementById("cityGroup");
            if (cityGroupEl) cityGroupEl.style.display = "block";

            companyIn.value = "Bellona Genel Müdürlük";
            companySelectEl && (companySelectEl.style.display = 'none');
            companyIn.style.display = "block";
            regionCompanyIn.style.display = "none";
            companyIn.readOnly = true;
            if (regionIn) {
                regionIn.value = "İç Anadolu";
                regionIn.disabled = true;
            }
            if (cityIn) {
                cityIn.setAttribute("required", "");
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
            const cityGroupEl = document.getElementById("cityGroup");
            if (cityGroupEl) cityGroupEl.style.display = "none";
            
            companySelectEl && (companySelectEl.style.display = 'none');
            companyIn.style.display = "block";
            regionCompanyIn.style.display = "none";
            companyIn.readOnly = true;
            
            if (cityIn) {
                cityIn.removeAttribute("required");
            }
            if (regionIn) {
                regionIn.disabled = false;
                // Bölgeye göre otomatik bayi ata
                const regionMap = {
                    "Marmara": "Karavil Marmara",
                    "Ege": "Atasaylar Group",
                    "İç Anadolu": "Aydın Group",
                    "Akdeniz": "Yılmaz Group",
                    "Karadeniz": "Gümüşbağlar Şirket Birliği",
                    "Doğu Anadolu": "Karavil Group",
                    "Güneydoğu Anadolu": "Kırklar Şirketler Birliği"
                };
                companyIn.value = regionMap[regionIn.value] || "Bölge Bayisi Seçiniz";
            }
            if (dealerCodeIn) {
                const codeMap = {
                    "Marmara": "0001",
                    "Ege": "0002",
                    "İç Anadolu": "0003",
                    "Akdeniz": "0004",
                    "Karadeniz": "0005",
                    "Doğu Anadolu": "0000",
                    "Güneydoğu Anadolu": "0006"
                };
                dealerCodeIn.value = codeMap[regionIn.value] || "0000";
                dealerCodeIn.disabled = true;
            }
        } else {
            // Yerel bayi modu: updateDealers zaten companySelect/companyIn görünürlüğünü yönetiyor
            const cityGroupEl = document.getElementById("cityGroup");
            if (cityGroupEl) cityGroupEl.style.display = "block";

            regionCompanyIn.style.display = "none";
            companyIn.readOnly = false;
            if (companyIn.value === "Bellona Genel Müdürlük") companyIn.value = "";
            if (cityIn) cityIn.setAttribute("required", "");

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
                // dealer kodu sadece companySelect kullanılmıyorsa açık kalsın
                if (!companySelectEl || companySelectEl.style.display === 'none') {
                    if (dealerCodeIn) dealerCodeIn.disabled = false;
                }
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
    cityIn?.addEventListener("change", () => {
        updateDealers();
        updateUI();
    });
    catIn?.addEventListener("change", () => {
        updateDealers();
        updateUI();
    });
    updateUI();

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const dealerCode = dealerCodeIn?.value || "0000";
        const email = await generateEnterpriseEmail(nameIn.value, surnameIn.value, dealerCode);
        
        // Bayi adını: eğer companySelect görünürse oradan al, yoksa companyIn'den
        let finalCompany;
        if (companySelectEl && companySelectEl.style.display !== 'none' && companySelectEl.value && companySelectEl.value !== '__NEW__') {
            finalCompany = companySelectEl.value;
        } else {
            finalCompany = companyIn.value;
        }
        
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
            password: pwIn.value,
            role: "user",
            isActive: true
        };

        // FINAL CONSISTENCY CHECK (Sadece Yerel Bayiler için)
        if (data.category === "local" && data.company && data.city) {
            const duplicateDealer = allUsersCache.find(u => 
                u.company?.toLocaleLowerCase('tr-TR') === data.company.toLocaleLowerCase('tr-TR') && 
                u.city?.toLocaleLowerCase('tr-TR') === data.city.toLocaleLowerCase('tr-TR') &&
                u.dealerCode !== data.dealerCode
            );

            if (duplicateDealer) {
                alert(`HATA: "${data.company}" bayisi "${data.city}" şehrinde zaten #${duplicateDealer.dealerCode} kodu ile kayıtlı.\n\nSiz #${data.dealerCode} kodu ile kaydetmeye çalışıyorsunuz. Lütfen bayi kodunu kontrol ediniz!`);
                return;
            }
        }

        try {
            const created = await createUserRecord(data);
            const actor = await getSessionActor();
            await writeAuditLog({
                actor,
                action: "PERSONEL_EKLEME",
                targetType: "users",
                targetId: created.uid || created.id || data.email, // using whatever is returned
                detail: `${data.name} ${data.surname} (${data.email}) eklendi.`
            });

            alert(`Personel başarıyla kaydedildi!\nE-posta: ${email}`);
            location.reload();
        } catch (error) {
            console.error("Kayıt İşlemi Hatası:", error);
            alert("KAYIT HATASI:\n" + error.message);
        }
    });
}
