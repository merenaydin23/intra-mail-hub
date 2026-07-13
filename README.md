# IntraMail Hub 🚀

IntraMail Hub, kurumsal içi (B2B / B2E) iletişimi tek bir platformda birleştirmek üzere geliştirilmiş modern, hızlı ve güvenli bir iletişim ekosistemidir. 
Sistem, Fabrika Yöneticileri, Bölge Yöneticileri, Bayi Sahipleri ve Personel gibi farklı yetki seviyelerindeki organizasyon birimlerinin kendi aralarında hiyerarşik kurallara bağlı kalarak güvenle mesajlaşabilmesini sağlar.

## 🌟 Öne Çıkan Özellikler

- **Çift Platform (Cross-Platform):** Web Portalı (HTML/JS) ve Mobil Uygulama (Flutter) aynı Firebase altyapısını %100 senkronize kullanarak çalışır.
- **Yapay Zeka Destekli (Gemini AI):** Google Gemini entegrasyonu ile gelen uzun mesajları tek tuşla özetleme, otomatik yanıt önerileri oluşturma ve taslak metinleri kurumsal ve profesyonel bir dile çevirme.
- **Akıllı Yetki Hiyerarşisi:** Kullanıcılar sadece rollerine uygun birimlere (örn. Fabrika -> Tüm Bölgeler, Bayi -> Kendi Bölge Yöneticisi) toplu veya tekil mesaj gönderebilir.
- **Bulut Tabanlı Gerçek Zamanlı Yapı:** Firebase Firestore ve Firebase Storage ile anlık mesaj iletimi, dosya paylaşımı ve read/unread takibi.
- **Gelişmiş Admin Portalı (Sadece Web):** Yeni personel tanımlama, şifre belirleme, otomatik kurumsal e-posta oluşturma ve sistem genelini izleme.

## 📂 Proje Yapısı

Proje iki ana klasörden (iki ayrı istemci - client) oluşmaktadır. Her bir istemci kendi klasöründe detaylıca belgelenmiştir.

1. **[📱 intra_mobil (Flutter Uygulaması)](./intra_mobil/README.md):** Saha çalışanları, bayi sahipleri ve sürekli hareket halindeki yöneticiler için tasarlanmış mobil istemci.
2. **[💻 web (Web Portalı)](./web/README.md):** Merkez ofis, masa başı çalışanları ve Sistem Yöneticileri (Admin) için tasarlanmış web istemcisi.

## 🛠️ Temel Teknolojiler

- **Backend:** Firebase (Authentication, Firestore, Storage)
- **Web Frontend:** Vanilla HTML, CSS, JavaScript (Modüler JS yapısı)
- **Mobile Frontend:** Flutter, Dart
- **Yapay Zeka:** Google Gemini API (`google_generative_ai`)

## 🚀 Başlangıç

Sistemi kurmak ve çalıştırmak için her iki platformun kendi `README.md` dosyalarındaki talimatları takip edebilirsiniz:
- Web portalı için: `web/README.md`
- Mobil uygulama için: `intra_mobil/README.md`
