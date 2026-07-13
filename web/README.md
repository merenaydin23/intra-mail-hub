# IntraMail Hub - Web Portalı 💻

Web portalı, IntraMail Hub ekosisteminin masaüstü kullanıcıları, ofis çalışanları ve **Sistem Yöneticileri (Adminler)** için geliştirilmiş önyüzüdür. Saf (Vanilla) HTML, CSS ve modüler JavaScript ile herhangi bir JS framework'ü kullanılmadan geliştirilmiştir.

## 🌟 Temel Modüller

Web klasörü içerisindeki yapı şu temel modüllere ayrılmıştır:

- **`index.html`**: Kullanıcı giriş (Login) ekranı.
- **`pages/portals/calisan.html`**: Standart kullanıcı (Fabrika, Bölge, Bayi) için Gelen Kutusu ve mesajlaşma arayüzü.
- **`pages/admin/yonetim*.html`**: Sistem yöneticileri için Dashboard, personel yönetimi ve mesaj geçmişi sayfaları.
  - Sadece web üzerinden yeni kullanıcı kaydı (`yonetim_ekle.html`) oluşturulabilir.

## 📂 JavaScript Mimarisi (`js_files/`)

- **`inbox.js`**: `calisan.html` içindeki tüm mesaj listeleme, filtreleme (Yıldızlı, Taslaklar vb.), Firebase'e yeni mesaj yazma ve AI önerilerini yöneten ana logic dosyasıdır.
- **`admin.js` & `admin_logic.js`**: Admin paneli kontrollerini, yeni hesap oluşturma sırasında otomatik e-posta ve şifre jenerasyonunu yapar. Auth ve Firestore tarafında yeni `user` dökümanlarını yaratır.
- **`page_guard.js`**: Route bazlı yetkilendirme sağlar. Login olmayanların veya admin olmayanların yanlış sayfalara erişmesini engeller.

## 🚀 Çalıştırma (Development)

Herhangi bir build (derleme) işlemine gerek yoktur. Herhangi bir yerel web sunucusu (Live Server, http-server, python -m http.server vs.) ile `web` dizinini kök dizin olarak serve etmeniz yeterlidir.

```bash
# npm yüklüyse hızlıca çalıştırmak için:
npx serve .
```

## ⚠️ Kritik Notlar

1. **Admin İşlemleri Sadece Web'dedir:** Mobil uygulamada "Kullanıcı Ekleme" yetkisi/sayfası bilerek bırakılmamıştır. Tüm organizasyon yönetimi web admin panelinden yapılmalıdır.
2. **Kategori Eşleşmesi:** Firestore'daki kullanıcı `category` ve `role` alanları, hem `inbox.js` içerisindeki yetki kısıtlamalarında hem de mobildeki `compose_screen.dart` dosyasında birebir aynı string'ler ile kontrol edilir (`factory`, `regional`, `local`). Bu yapıyı bozmamaya özen gösterin.
