# Bellona Intra Mail Hub - Sistem Mimarisi

Bu doküman projenin genel mimarisini ve klasör yapısını açıklamaktadır. Proje, web ve mobil istemcilerin ortak bir bulut veritabanında (Firebase) birleştiği, "Ortak Backend, Çoklu Frontend" (Shared Backend, Multiple Frontends) mimarisi ile tasarlanmıştır.

## 📁 Proje Klasör Yapısı

Sistem 3 temel bacağı ve onlara ait ayrı klasörleri içerir:

### 1. `web/` (Admin & Masaüstü Portalı)
Bu klasör, yöneticilerin (Admin) ve masaüstü kullanıcılarının eriştiği Vite tabanlı web arayüzünü içerir.
- **Tasarım:** Koyu tema (Dark Mode), glassmorphism ve turkuaz (#14B8A6) tonları hakimdir.
- **Teknoloji:** HTML5, Vanilla JavaScript, CSS3.
- **Önemli Dosyalar:**
  - `web/index.html`: Giriş sayfası.
  - `web/js_files/style.css`: Tüm premium CSS tasarımları.
  - `web/js_files/firebase/config.js`: Web'in ortak veritabanına bağlantı ayarları.

### 2. `intra_mobil/` (Saha Çalışanları & Mobil Portal)
Sahadaki personelin, bayi çalışanlarının ve bölge müdürlerinin kullandığı %100 Native (Dart) Flutter uygulamasıdır. Yöneticiler (Admin) bu uygulamayı kullanamaz.
- **Tasarım:** Web portalının koyu teması ve glassmorphism özellikleri Native widget'larla birebir taklit edilmiştir.
- **Teknoloji:** Flutter, Dart, Firebase SDK for Flutter.
- **Önemli Dosyalar:**
  - `intra_mobil/lib/core/backend/firebase_config.dart`: Mobil'in ortak veritabanına bağlantı ayarları.
  - `intra_mobil/lib/ui/screens/login_screen.dart`: Native Premium giriş ekranı.
  - `intra_mobil/lib/ui/screens/dashboard_screen.dart`: Native mesajlaşma ve duyuru ekranı. Admin engeli burada devreye girer.
  - `intra_mobil/lib/main.dart`: Sadece yönlendirme yapan ana başlatıcı.

### 3. Ortak Backend (Firebase - Cloud)
Hem `web` klasörü hem de `intra_mobil` klasörü aynı bulut (Cloud) hizmetine bağlıdır (`bellona-71bee`). 
- Bu sayede web'den atılan bir mesaj anında mobil veritabanını tetikler.
- Mobilden girilen bir veri anında web panelindeki listeyi günceller.
- Kimlik doğrulama, mesajlar ve kullanıcı yetkileri (Role Based Access Control) tek merkezden yönetilir.

## 🚀 Çalışma Mantığı ve Senkronizasyon
1. **Kimlik Doğrulama:** Her iki platform da `users` tablosuna bakar.
2. **Yetkilendirme:** 
   - Rolü `admin` olan biri mobil uygulamadan girmeye çalışırsa, `dashboard_screen.dart` bunu yakalar ve kırmızı bir "Erişim Engellendi" ekranı basar.
3. **Anlık Senkronizasyon:** Mesajlaşma (Chat) verileri Firestore `messages` koleksiyonuna yazılır. StreamBuilder ve onSnapshot metodları sayesinde sayfalar asla yenilenmez, veriler milisaniyeler içinde ekranlara düşer.
