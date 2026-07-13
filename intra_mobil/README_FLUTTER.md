# 📱 Intra Mobil - Kurulum Rehberi

Kral, bu klasör (`intra_mobil`) senin Flutter uygulamanın merkezidir. İçerisinde uygulamanın kalbi olan `lib/main.dart` ve bağımlılıkları yöneten `pubspec.yaml` dosyaları hazır bulunuyor.

## Nasıl Çalıştıracaksın? (Flutter Kurduktan Sonra)

Flutter SDK'yı kurup terminalde `flutter` komutunun çalıştığından emin olduktan sonra şu adımları izle:

1. Terminali aç ve bu klasörün içine gir:
   ```bash
   cd intra_mobil
   ```

2. Projenin eksik olan platform dosyalarını (Android, iOS klasörleri) otomatik oluşturmak için:
   ```bash
   flutter create .
   ```
   *(Bu komut `lib/main.dart` dosyanı silmez, sadece eksik olan altyapı dosyalarını tamamlar.)*

3. WebView paketini ve diğer bağımlılıkları indir:
   ```bash
   flutter pub get
   ```

4. **Çok Önemli (İnternet İzni):**
   `android/app/src/main/AndroidManifest.xml` dosyasını aç ve `<application>` etiketinin **hemen üstüne** şu satırı eklediğinden emin ol (Eğer yoksa ekle):
   ```xml
   <uses-permission android:name="android.permission.INTERNET"/>
   ```

5. Telefonunu bağla (veya emülatörü aç) ve çalıştır:
   ```bash
   flutter run
   ```

**Not:** `lib/main.dart` içindeki `loadRequest` kısmına şu anki canlı sunucunun adresini veya yerel ağındaki IP adresini girmeyi unutma! Web projesinde (Firebase'de) ne değişirse, mobilde anında yansıyacaktır. Kolay gelsin! 👑
