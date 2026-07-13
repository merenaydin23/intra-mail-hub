# IntraMail Hub - Mobil İstemci (Flutter) 📱

IntraMail Hub platformunun saha ekipleri (Bölge Yöneticileri, Bayi Sahipleri, Satış Personeli vb.) için tasarlanmış mobil sürümüdür. Web portalı ile aynı Firebase projesine bağlanır ve %100 senkronize çalışır.

## 🌟 Öne Çıkan Fonksiyonlar
- **Mobil Mesajlaşma Deneyimi:** Gelen Kutusu, Gönderilenler, Taslaklar, Yıldızlı Mesajlar klasörleri.
- **Detaylı Organizasyon Rehberi (`EmployeeDirectoryScreen`):** Tüm kullanıcıları yetki ve kategorisine (Fabrika, Bölge, Bayi) göre renklendirilmiş çipler ile filtreleme ve isme göre akıllı sıralama.
- **Gelişmiş "Yeni Mesaj" Paneli (`ComposeScreen`):** Kişinin yetki hiyerarşisine göre alıcıları dinamik yükleyen toplu seçim ekranı.
- **Yapay Zeka (AI) Asistanı:** Gelen mesaj serilerini özetleme ve profesyonel taslak yanıtlar oluşturma (Gemini entegrasyonu).

## 📂 Dosya & Dizin Mimarisi

- `lib/core/backend/`: Firebase başlatma (`firebase_options.dart`) ve Yapay Zeka servisleri (`ai_service.dart`).
- `lib/ui/screens/`: 
  - `inbox_screen.dart`: Ana gelen kutusu ve mesaj listeleme mantığı.
  - `compose_screen.dart`: Yeni mesaj oluşturma, yetki ağacı filtreleri ve dosya eki yönetimi.
  - `employee_directory_screen.dart`: A-Z sıralı ve renk kodlu kurumsal rehber.
  - `user_detail_screen.dart`: Kişi detayları ve direkt mesaj başlatma sayfası.

## 🛠️ Teknik Gereksinimler & Kurulum

Bu proje **Flutter** ile geliştirilmiştir. Windows ortamında çalışırken `impellerc.exe` güvenlik kısıtlamalarına takılabilir.

1. **Bağımlılıkları Yükleme:**
   ```bash
   cd intra_mobil
   flutter pub get
   ```

2. **Uygulamayı Başlatma (Güvenlik Kısıtlaması Bypass Yöntemi):**
   Uygulamayı derlerken SAC/Firewall gibi kısıtlamalar nedeniyle derleme hatası alırsanız, `flutter attach` yöntemini kullanmanız önerilir:
   ```powershell
   # Emülatörü başlattıktan sonra:
   flutter attach -d emulator-5554
   ```

## ⚠️ Dikkat Edilmesi Gerekenler
- **Admin Ekranı Yoktur:** Sisteme yeni bir personel kaydetmek, silmek veya departman atamak gibi yönetimsel işlevler sadece **Web Portalında** yer alır. Mobil uygulama son kullanıcı (personel/yönetici) içindir.
- **Dosya İndirme:** Web'de tarayıcı eklentileri önizlenirken, mobilde `url_launcher` ve `open_filex` üzerinden dış kaynaklı indirme işlemi yapılır.
