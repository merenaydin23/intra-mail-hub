# LAB 6 - Mimari Tasarım ve Veri Akışı

**Öğrenci Adı Soyadı:** Muhammed Eren Aydın  
**Öğrenci Numarası:** 230541034  
**Proje Adı:** Intra Mail Hub  

---

## 1. Mimari Bileşenlerin Belirlenmesi

Intra Mail Hub uygulamasını oluşturan temel bileşenler şunlardır:

*   **Kullanıcı Arayüzü (UI / Ekranlar):** Kullanıcıların sistemle etkileşime girdiği arayüzlerdir. (Giriş Ekranı, Yönetim Paneli, Fabrika/Bölge/Yerel Bayi ve Çalışan Portalları).
*   **İş Mantığı (Uygulama Kuralları):** Hiyerarşik yetkilendirme kontrolleri, mesaj gönderme/alma kuralları, Gemini API üzerinden metin özetleme ve resmileştirme (formalize) işlemleri.
*   **Veri Kaynağı (Veritabanı / API):** Kullanıcı bilgileri ve mesaj içeriklerinin tutulduğu **Firebase (Firestore / Authentication)** ve yapay zeka işlemleri için dış servis olan **Gemini API**.

## 2. Katmanlı Yapı

Uygulamanın mimarisi üç ana katmandan oluşmaktadır:

1.  **Sunum Katmanı (UI Katmanı):**
    *   Kullanıcı giriş ekranı (`giris.html`)
    *   Rol bazlı portallar (`fabrika.html`, `bolge.html`, `yerel.html`, `calisan.html`, `yonetim.html`)
2.  **İş Mantığı Katmanı:**
    *   Oturum yönetimi ve Kimlik doğrulama işlemleri
    *   Hiyerarşik iletişim kısıtlamaları (Örn: Alt bayinin sadece üst bölge bayisine mesaj atabilmesi)
    *   Gemini AI Entegrasyon Servisleri (Mesajı resmileştirme, özet çıkarma, akıllı yanıt oluşturma)
3.  **Veri Katmanı:**
    *   Firebase Authentication (Kullanıcı giriş/çıkış yönetimi)
    *   Firebase Cloud Firestore (Mesaj içerikleri, kullanıcı rolleri, admin log kayıtları)
    *   Gemini API (Yapay zeka veri alışverişi)

## 3. Veri Akışı ve Mimari Diyagram

Aşağıdaki şemada, bir kullanıcının sisteme giriş yapıp yapay zeka destekli bir mesaj göndermesi sırasındaki veri akışı aşamalar halinde gösterilmiştir.

```mermaid
graph TD
    %% Katmanlar
    subgraph Sunum Katmani [Sunum Katmanı - UI]
        UI_Login[Giriş Ekranı]
        UI_Portal[Kullanıcı Portalı - Mesaj Yazma]
    end

    subgraph IsMantigi [İş Mantığı Katmanı]
        AuthService[Kimlik Doğrulama Servisi]
        MessageService[Mesaj İletim Servisi]
        AIService[Gemini AI Servisi]
    end

    subgraph VeriKatmani [Veri Katmanı]
        FirebaseAuth[(Firebase Auth)]
        FirestoreDB[(Firestore Veritabanı)]
        GeminiAPI((Gemini API))
    end

    %% Veri Akışları (Oklar ile)
    UI_Login -- "1. E-posta & Şifre İletimi" --> AuthService
    AuthService -- "2. Kimlik Doğrulama" --> FirebaseAuth
    FirebaseAuth -- "3. Onay & Rol Bilgisi" --> AuthService
    AuthService -- "4. Arayüze Yönlendirme" --> UI_Portal
    
    UI_Portal -- "5. Taslak Mesajı AI ile Düzenle" --> AIService
    AIService -- "6. API İsteği Gönder" --> GeminiAPI
    GeminiAPI -- "7. Düzenlenmiş Metni Döndür" --> AIService
    AIService -- "8. UI'da Öneri Olarak Sun" --> UI_Portal
    
    UI_Portal -- "9. Mesajı Gönder" --> MessageService
    MessageService -- "10. Yetki & Hiyerarşi Kontrolü" --> MessageService
    MessageService -- "11. Veritabanına Kaydet" --> FirestoreDB
    FirestoreDB -- "12. Başarılı İşlem Yanıtı" --> MessageService
    MessageService -- "13. Ekranda Başarı Mesajı Göster" --> UI_Portal

    %% Renklendirme ve Stil
    classDef ui fill:#dcfce7,stroke:#166534,stroke-width:2px;
    classDef logic fill:#dbeafe,stroke:#1e3a8a,stroke-width:2px;
    classDef data fill:#fef08a,stroke:#854d0e,stroke-width:2px;
    
    class UI_Login,UI_Portal ui;
    class AuthService,MessageService,AIService logic;
    class FirebaseAuth,FirestoreDB,GeminiAPI data;
```
