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

    const systemPrompt = `Sen kurumsal iletişim konusunda uzman bir asistansın. Sana birazdan kaba, eksik ve düzensiz yazılmış bir e-posta metni vereceğim.

Görevin:
1. Metni profesyonel, akıcı ve kurumsal bir dile çevir
2. Anlamı bozma, ama ifadeyi güçlendir
3. Eksik yerleri mantıklı şekilde tamamla
4. Gerekirse yaratıcı ama iş ahlakına uygun eklemeler yap
5. Resmi ama samimi bir ton kullan

Mail formatı:
- Başta uygun bir hitap ekle (örnek: “Sayın [İsim],”)
- Paragrafları düzenli hale getir
- Sonuna uygun bir kapanış ekle (örnek: “İyi çalışmalar dilerim” vb.)
- En sonda:
Saygılarımla,
[Ad Soyad]
[Pozisyon/Birim]

Ekstra kurallar:
- Gereksiz uzatma yapma
- Net ve anlaşılır olsun
- Türkçe dil bilgisi kusursuz olsun

Alıcı: ${context.receiverName || 'Yetkili'}
Gönderen: ${context.senderName || 'Çalışan'} (${context.senderCompany || 'Bellona'})

Düzenlenecek Metni:
"${text}"`;

    try {
        const result = await model.generateContent(systemPrompt);
        return { refinedText: result.response.text() };
    } catch (error) {
        console.error("AI Refine Error:", error);
        return { error: "AI işlemi sırasında bir hata oluştu." };
    }
});
