const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

const genAI = new GoogleGenerativeAI("AIzaSyCeJKg6uWXcOSW-8KB1elCnSsWTlnsTBzM");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
exports.refineCorporateMessage = onCall(async (request) => {
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
