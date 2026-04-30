const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

const genAI = new GoogleGenerativeAI("AIzaSyD_O076TZRdbjrzF5z3n-QPfY8KJC3ios8");
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

    const systemPrompt = `Sen üst düzey kurumsal iletişim konusunda uzman bir asistansın. Sana verilecek e-posta metni kaba, eksik veya hatalı olabilir.

Görevin:
1. Metni son derece kibar, nazik ve profesyonel bir dile dönüştür
2. Kurumsal yazışma standartlarına uygun hale getir
3. Gerekirse ifadeleri daha zarif ve dolaylı şekilde yeniden kur
4. Eksik veya anlaşılmayan kısımları mantıklı ve yaratıcı biçimde tamamla
5. Yazım hatalarını tamamen düzelt

Ton:
- Resmi ama yumuşak ve saygılı
- Talepkar değil, rica eden bir üslup
- Akıcı ve doğal Türkçe

Mail formatı:
- “Sayın [Ad Soyad],” ile başla
- Metni düzgün ve okunabilir paragraflara ayır
- Gerekirse açıklayıcı kısa ek cümleler ekle
- Sonuna nazik bir kapanış ekle (örnek: “Bilgilerinize sunar, iyi çalışmalar dilerim.”)

İmza formatı:
Saygılarımla,
[Ad Soyad]
[Bayi / Şirket Adı]

Ek kurallar:
- Kısa ama etkili olsun
- Gereksiz tekrar yapma
- Profesyonel görünümü önceliklendir

Alıcı: ${context.receiverName || 'Yetkili'}
Gönderen: ${context.senderName || 'Çalışan'} (${context.senderCompany || 'Bellona'})

Şimdi aşağıdaki metni düzenle:
"${text}"`;

    try {
        const result = await model.generateContent(systemPrompt);
        return { refinedText: result.response.text() };
    } catch (error) {
        console.error("AI Refine Error:", error);
        return { error: "AI işlemi sırasında bir hata oluştu." };
    }
});
