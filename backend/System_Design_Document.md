# IntraMail Hub - Sistem Tasarım Dokümanı (System Design Doc)

## 1. Mimari Değerlendirme & Olası Darboğazlar
**Mantık Hataları ve Darboğazlar:**
- **Yetkilendirme Zinciri Bypass Riski:** Hiyerarşik mesajlaşmada "ast sadece bağlı olduğu üste yazabilir" kuralı katı şekilde denetlenmelidir. Doğrudan ID üzerinden API çağrısı yapılması durumunda backend seviyesinde güçlü bir veri izolasyonu sağlanmazsa bu kural delinebilir.
- **Toplu Mesajlaşma (Broadcast) Yükü:** Bölge Patronu veya Fabrika Patronu'nun binlerce çalışana aynı anda mesaj atması senaryosunda, ilişkisel veritabanına her bir alıcı için satır eklemek (N+1 problemi) ciddi darboğaz yaratabilir. 
- **Yapay Zeka (AI) Yanıt Süresi:** NLP destekli mesaj özetleme ve yanıt taslağı oluşturma işlemleri CPU/GPU bound işlemlerdir. Bu işlemler senkron (ana thread üzerinde) yapılırsa FastAPI'nin asenkron yapısı bloke olur ve sistem kilitlenir.

## 2. Yetkilendirme ve Veri Yalıtımı (Güvenlik)
- **Data Isolation:** Her kullanıcının veritabanından yalnızca "okuma izni olduğu" mesajları çekebilmesi için Row-Level Security (PostgreSQL RLS) veya mantıksal sorgu filtreleri kullanılmalıdır.
- **Eskalasyon Güvenliği:** Bir mesaj üst seviyeye raporlandığında (eskale edildiğinde), mesajın orijinalliği bozulmamalı (immutable olmalı) ve eskale eden kişinin notu/eklemesiyle yeni bir thread veya state oluşturulmalıdır.
- **Yetki Modeli:** Salt rol bazlı değil, **Role-Based Access Control (RBAC)** + **Attribute-Based Access Control (ABAC)** birleştirilmelidir. "Bölge Çalışanı", sadece *kendi* bölgesindeki patrona yazabilir (Role: RegionEmployee, Attribute: region_id).

## 3. Veritabanı Şeması (PostgreSQL Önerisi)
İlişkisel veritabanı (PostgreSQL) modern, esnek ve JSONB desteği sayesinde AI metadatalarını tutmak için mükemmeldir.

- **Users:** `id`, `name`, `role_id`, `region_id`, `dealer_code`, `is_active`
- **Roles:** `id`, `name` (local_employee, local_boss, region_employee, region_boss, factory_employee, factory_admin), `permissions` (JSONB)
- **Messages:** `id`, `sender_id`, `subject`, `body`, `is_broadcast`, `created_at`
- **Message_Recipients:** `message_id`, `recipient_id`, `is_read`, `read_at`
- **Threads:** Uzun mesajlaşma zincirleri ve eskale edilen konuları bağlamak için.
- **AI_Metadata:** `message_id`, `summary`, `suggested_replies` (JSONB), `sentiment_score`

## 4. Mikroservis mi, Modüler Monolit mi?
**Öneri: Modüler Monolit (Modular Monolith) + Event-Driven AI Worker**
Sıfırdan başlanan bir projede tam mikroservis mimarisine geçmek (network latency, devops yükü, distributed transactions) "over-engineering" olacaktır. 
- **Core App:** FastAPI üzerinde modüler olarak ayrılmış (Auth, Messaging, Roles).
- **AI Worker:** Celery veya arq (async) gibi bir kuyruk mekanizması ile ana uygulamadan koparılmış, Redis tabanlı haberleşen bağımsız bir worker. Ana sistem mesajı kuyruğa atar (örneğin "bunu özetle"), AI worker işler ve sonucu DB'ye yazar/WebSocket üzerinden UI'a basar.

## 5. Ölçeklenebilirlik (Performans Önerileri)
- **Toplu Mesajlar:** Binlerce kişiye gidecek "Duyurular" `Message_Recipients` tablosuna binlerce satır eklemek yerine, `Announcements` tablosunda tutulup, kullanıcıların "son okuduğu duyuru ID'si" ile (watermark pattern) yönetilmelidir.
- **AI Asenkronitesi:** Özetleme ve taslak istekleri kesinlikle RabbitMQ veya Redis Pub/Sub üzerinden asenkron yönetilmeli. Kullanıcı UI'da "Özet Çıkarılıyor..." şeklinde bir loader görür, işlem bitince Server-Sent Events (SSE) veya WebSocket ile client'a push edilir.
- **Pagination & Caching:** Arayüzün premium hızda hissettirmesi için mesaj listelerinde Cursor-based pagination kullanılmalı. Bölge patronları gibi sık erişilen kullanıcı listeleri Redis üzerinde önbelleklenmelidir.

## 6. İş Akışında Eksik Operasyonel Kurallar
- **Delegasyon (Vekalet):** Bir Bölge Patronu izne ayrıldığında yerine bakacak birini (Bölge Çalışanı veya başka bir Bölge Patronu) geçici olarak atayabilmelidir.
- **Geri Çekme (Undo Send):** Gönderilen mesajın ilk 3-5 dakika içinde düzenlenebilmesi/geri çekilebilmesi operasyonel hataları çok azaltacaktır.
- **Okundu/İletildi Bilgisi Raporlaması:** Broadcast mesajlarında (Duyurular) "bunu kimler okudu" analitiği, Fabrika Yönetimi için hayati önem taşır.
