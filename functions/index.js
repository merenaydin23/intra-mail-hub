const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");

admin.initializeApp();

// Gemini API istemcisini başlatıyoruz.
// Not: Gerçek senaryoda API anahtarını process.env ortam değişkenlerinden alacağız.
const ai = new GoogleGenAI({ apiKey: "AIzaSyD_O076TZRdbjrzF5z3n-QPfY8KJC3ios8" }); 
// ÖNEMLİ: Eğer GEMINI_API_KEY ortam değişkenlerinde tanımlıysa GoogleGenAI otomatik algılar.

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

        // Gemini API'ye istek atıyoruz (gemini-2.5-flash modeli hızlı ve maliyetsizdir)
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                 responseMimeType: "application/json",
            }
        });

        const aiResultText = response.text();
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
