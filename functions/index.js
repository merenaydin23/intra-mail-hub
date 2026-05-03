const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

const COHERE_KEYS = [
    "REDACTED_COHERE_KEY",
    "nVycIJVNLnVwYiWReqftZg6YYBmJKhRHvVxOqPSx",
    "OEDhvaCBWLQWE6qx7ldJXUOS0jsKnEwrPwlRrPXz",
    "Ld5d59Zrld2jIoFh3rN4w5Y5n6NAa1y0iSpDLrA9"
];
const genAI = new GoogleGenerativeAI("AIzaSyCeJKg6uWXcOSW-8KB1elCnSsWTlnsTBzM");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * KULLANICI OLUŞTURMA — Auth + Firestore atomik
 * Admin panelinden çağrılır. Firebase Auth + Firestore'u birlikte oluşturur.
 */
exports.createUser = onCall({ cors: true }, async (request) => {
    // Sadece admin çağırabilsin
    if (!request.auth) throw new Error("Yetki yok.");

    const data = request.data;
    if (!data.email || !data.password) throw new Error("E-posta ve şifre zorunludur.");

    try {
        // 1. Firebase Auth'ta kullanıcı oluştur
        const userRecord = await admin.auth().createUser({
            email: data.email,
            password: data.password,
            displayName: `${data.name} ${data.surname}`,
        });

        // 2. Firestore'a aynı UID ile kaydet
        const { password, ...firestoreData } = data; // şifreyi Firestore'a yazma
        await admin.firestore().collection("users").doc(userRecord.uid).set({
            ...firestoreData,
            uid: userRecord.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[createUser] ${data.email} başarıyla oluşturuldu. UID: ${userRecord.uid}`);
        return { success: true, uid: userRecord.uid, email: data.email };

    } catch (err) {
        console.error("[createUser] Hata:", err.message);
        // Auth hata kodlarını Türkçeleştir
        const msgs = {
            "auth/email-already-exists": "Bu e-posta adresi zaten kayıtlı.",
            "auth/invalid-email": "Geçersiz e-posta formatı.",
            "auth/weak-password": "Şifre en az 6 karakter olmalı.",
        };
        throw new Error(msgs[err.code] || err.message);
    }
});


exports.processNewMessage = onDocumentCreated("messages/{messageId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const messageData = snapshot.data();
    console.log("Yeni mesaj alındı, AI analizi başlatılıyor ID:", event.params.messageId);

    const content = messageData.content;
    if (!content) {
        console.log("İçerik boş, işlem yapılmadı.");
        return;
    }

    try {
        // Yapay Zekaya vereceğimiz net ve katı talimat (Prompt)
        const prompt = `Lütfen aşağıdaki şirket içi mesajı incele ve iki şey yap:
1. Metin Türkçe ise İngilizceye, İngilizce veya başka bir dilde ise Türkçeye tam ve profesyonel bir şekilde çevir. (translatedContent)
2. Bu metnin spam, hakaret, oltalama (phishing) veya şirket içi iletişim kurallarına aykırı zararlı bir içeriğe sahip olup olmadığını 0-100 arası bir skorla değerlendir (100 = kesinlikle spam/zararlı). (spamScore)
3. Eğer skor 60 ve üzerindeyse isSpam değerini true, değilse false yap.

Mesaj Metni:
"""${content}"""

Lütfen bana yanıtı SADECE aşağıdaki gibi katı bir JSON formatında döndür. Hiçbir fazladan yazı yazma:
{
  "translatedContent": "çevrilmiş metin",
  "spamScore": 0,
  "isSpam": false
}`;

        // Gemini API'ye istek atıyoruz
        const result = await model.generateContent(prompt);
        const aiResultText = result.response.text();
        console.log("Gemini Yanıtı:", aiResultText);
        
        const aiData = JSON.parse(aiResultText);

        // Orijinal mesaja (Firestore doc) yapay zeka sonuçlarını güncelle olarak kaydediyoruz
        await event.data.ref.update({
            translatedContent: aiData.translatedContent || "",
            spamScore: aiData.spamScore || 0,
            isSpam: aiData.isSpam || false,
            aiAnalyzed: true
        });

        console.log("AI analizi Firestore'a başarıyla kaydedildi!");

    } catch (error) {
        console.error("AI Analizi sırasında hata oluştu:", error);
    }
});

/**
 * Yeni Eklenen: Akıllı Düzenle (AI Refinement) Fonksiyonu
 */
exports.refineCorporateMessage = onCall({ cors: true }, async (request) => {
    const { text, context } = request.data;
    
    if (!text) return { error: "Metin boş olamaz" };

    const systemPrompt = `Sen üst düzey bir kurumsal iletişim ve halkla ilişkiler uzmanısın. Görevin, sana iletilen ham, kaba veya doğrudan yazılmış mesajı alıp, anlamını koruyarak EN ÜST DÜZEY nezaket ve profesyonellik ile YENİDEN YAZMAKTIR.

Talimatlar:
1. Sadece başa sona ekleme yapma; mesajın gövdesini (core body) kurumsal bir üsluba kavuştur.
2. "Sipariş geç", "Bak", "Yap" gibi emir kiplerini asla kullanma. Bunun yerine "istirahammızdır", "rica ederiz", "bilgilerinize sunarız" gibi ifadeler kullan.
3. Mesajı daha akıcı, profesyonel ve kurumsal standartlarda bir e-posta haline getir.
4. Yazım ve noktalama hatalarını gider.

Ton:
- Son derece saygılı, nazik ve profesyonel.
- Talepkar değil, çözüm odaklı ve rica edici.

Mail Formatı:
- Hitap: "Sayın [Alıcı Adı],"
- Gövde: Mesajın kurumsallaştırılmış, akıcı hali.
- Kapanış: "Bilgilerinize sunar, verimli çalışmalar dilerim."
- İmza: 
Saygılarımla,
[Gönderen Adı]
[Şirket Adı]

Alıcı: ${context.receiverName || 'Yetkili'}
Gönderen: ${context.senderName || 'Çalışan'}
Şirket: ${context.senderCompany || 'Bellona'}

Düzenlenecek Ham Metin:
"${text}"

Lütfen sadece düzenlenmiş nihai metni döndür.`;

    try {
        const result = await model.generateContent(systemPrompt);
        return { refinedText: result.response.text() };
    } catch (error) {
        console.error("AI Refine Error:", error);
        return { error: "AI işlemi sırasında bir hata oluştu." };
    }
});

/**
 * GECEYARıSı OTOMATİK ARŞİVLEME
 * Her gece 00:05'te çalışır.
 * Dünkü mesajları message_archives/{YYYY-MM-DD}/messages altına taşır.
 */
exports.archiveDailyMessages = onSchedule(
    { schedule: "5 0 * * *", timeZone: "Europe/Istanbul" },
    async () => {
        const db = admin.firestore();

        // Dünün başı ve sonu
        const now = new Date();
        const startOfYesterday = new Date(now);
        startOfYesterday.setDate(now.getDate() - 1);
        startOfYesterday.setHours(0, 0, 0, 0);

        const endOfYesterday = new Date(now);
        endOfYesterday.setDate(now.getDate() - 1);
        endOfYesterday.setHours(23, 59, 59, 999);

        // Arşiv tarihi anahtarı: YYYY-MM-DD
        const pad = n => String(n).padStart(2, '0');
        const dateKey = `${startOfYesterday.getFullYear()}-${pad(startOfYesterday.getMonth() + 1)}-${pad(startOfYesterday.getDate())}`;

        console.log(`[Archive] ${dateKey} tarihli mesajlar arşivleniyor...`);

        const snapshot = await db.collection("messages")
            .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(startOfYesterday))
            .where("timestamp", "<=", admin.firestore.Timestamp.fromDate(endOfYesterday))
            .get();

        if (snapshot.empty) {
            console.log(`[Archive] ${dateKey} için arşivlenecek mesaj bulunamadı.`);
            return;
        }

        const archiveRef = db.collection("message_archives").doc(dateKey);

        // Arşiv günü meta verisini yaz
        await archiveRef.set({
            date: dateKey,
            messageCount: snapshot.size,
            archivedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Her mesajı alt koleksiyona kopyala
        const batch = db.batch();
        snapshot.forEach(doc => {
            const archiveMsgRef = archiveRef.collection("messages").doc(doc.id);
            batch.set(archiveMsgRef, { ...doc.data(), _archivedFrom: "messages", _archiveDate: dateKey });
        });
        await batch.commit();

        console.log(`[Archive] ${snapshot.size} mesaj ${dateKey} arşivine başarıyla yazıldı.`);
    }
);
