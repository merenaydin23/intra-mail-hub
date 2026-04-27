const REGION_CITY_MAP = {
    "Marmara": ["İstanbul", "Edirne", "Kırklareli", "Tekirdağ", "Kocaeli", "Sakarya", "Yalova", "Bursa", "Balıkesir", "Çanakkale", "Bilecik"],
    "Ege": ["İzmir", "Manisa", "Aydın", "Denizli", "Muğla", "Kütahya", "Uşak", "Afyonkarahisar"],
    "Akdeniz": ["Antalya", "Adana", "Mersin", "Hatay", "Isparta", "Burdur", "Kahramanmaraş", "Osmaniye"],
    "İç Anadolu": ["Ankara", "Konya", "Kayseri", "Eskişehir", "Sivas", "Yozgat", "Kırıkkale", "Aksaray", "Niğde", "Kırşehir", "Nevşehir", "Karaman", "Çankırı"],
    "Karadeniz": ["Samsun", "Trabzon", "Ordu", "Giresun", "Rize", "Artvin", "Gümüşhane", "Bayburt", "Amasya", "Tokat", "Çorum", "Sinop", "Kastamonu", "Bartın", "Karabük", "Zonguldak", "Düzce", "Bolu"],
    "Doğu Anadolu": ["Erzurum", "Erzincan", "Kars", "Ağrı", "Iğdır", "Ardahan", "Malatya", "Elazığ", "Bingöl", "Tunceli", "Van", "Muş", "Bitlis", "Hakkari"],
    "Güneydoğu Anadolu": ["Gaziantep", "Şanlıurfa", "Diyarbakır", "Mardin", "Batman", "Siirt", "Şırnak", "Kilis", "Adıyaman"]
};

export function getRandomCityForRegion(region) {
    const cities = REGION_CITY_MAP[region] || [];
    if (!cities.length) return "";
    return cities[Math.floor(Math.random() * cities.length)];
}

export function getCitiesForRegion(region) {
    return REGION_CITY_MAP[region] || [];
}

export function getRegionCityMap() {
    return REGION_CITY_MAP;
}
