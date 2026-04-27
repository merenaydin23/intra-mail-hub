const REGION_CITY_MAP = {
    Marmara: ["Istanbul", "Bursa", "Kocaeli", "Tekirdag", "Balikesir"],
    Ege: ["Izmir", "Manisa", "Aydin", "Denizli", "Mugla"],
    "Iç Anadolu": ["Ankara", "Kayseri", "Konya", "Eskisehir", "Sivas"],
    Akdeniz: ["Antalya", "Adana", "Mersin", "Hatay", "Isparta"],
    Karadeniz: ["Samsun", "Trabzon", "Ordu", "Rize", "Zonguldak"],
    "Doğu Anadolu": ["Erzurum", "Malatya", "Van", "Elazig", "Kars"],
    "Güneydoğu Anadolu": ["Gaziantep", "Sanliurfa", "Diyarbakir", "Mardin", "Batman"]
};

export function getRandomCityForRegion(region) {
    const cities = REGION_CITY_MAP[region] || [];
    if (!cities.length) return "";
    return cities[Math.floor(Math.random() * cities.length)];
}

export function getRegionCityMap() {
    return REGION_CITY_MAP;
}
