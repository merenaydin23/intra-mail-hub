/**
 * AI Service for Intra Mail Hub - COHERE ADVANCED VERSION
 */

const COHERE_API_KEY = "REDACTED_COHERE_KEY";

export const CORPORATE_SYSTEM_PROMPT = `Sen üst düzey bir kurumsal iletişim uzmanısın. Görevin, kaba veya düzensiz mesajları EN ÜST DÜZEY nezaketle YENİDEN YAZMAKTIR.

Kurallar:
1. Mesajın gövdesini (core body) kurumsal bir üsluba kavuştur.
2. "Sipariş geç", "Bak" gibi emir kiplerini asla kullanma, "istirahammızdır", "rica ederiz" gibi ifadeler kullan.
3. Mesajı KISA ve ÖZ tut (Gereksiz uzatmalardan kaçın).
4. Yazım hatalarını düzelt.
5. İçeriğe uygun, profesyonel bir KONU BAŞLIĞI oluştur.

Mail Formatı:
- Hitap: "Sayın [Alıcı Adı],"
- Gövde: Kurumsal, akıcı ve kısa metin.
- Kapanış: "Bilgilerinize sunar, iyi çalışmalar dilerim."
- İmza: Saygılarımla, [Gönderen Adı] / [Şirket Adı]

Yanıt Formatı (Sadece bu JSON formatında dön):
{
  "subject": "Oluşturulan Konu Başlığı",
  "body": "Düzenlenmiş Mesaj Metni"
}`;

export async function refineMessageWithAI(originalText, context) {
    const url = "https://api.cohere.ai/v1/chat";
    
    const prompt = `Alıcı: ${context.receiverName}
Gönderen: ${context.senderName}
Şirket: ${context.senderCompany}
Metin: "${originalText}"

Lütfen sadece yukarıdaki JSON formatında yanıt ver. Hiçbir açıklama ekleme.`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${COHERE_API_KEY}`
            },
            body: JSON.stringify({
                message: prompt,
                model: "command-nightly",
                preamble: CORPORATE_SYSTEM_PROMPT
            })
        });

        const data = await response.json();
        
        if (data.text) {
            try {
                // Cohere bazen metin içinde JSON döndürür, temizleyelim
                const jsonStr = data.text.substring(data.text.indexOf('{'), data.text.lastIndexOf('}') + 1);
                const aiResult = JSON.parse(jsonStr);
                return {
                    subject: aiResult.subject,
                    body: "✨ " + aiResult.body
                };
            } catch (e) {
                // JSON parse hatası olursa düz metin olarak dön (fallback)
                return {
                    subject: "Bilgilendirme",
                    body: "✨ " + data.text.trim()
                };
            }
        } else {
            return { error: "AI Hatası" };
        }
    } catch (error) {
        return { error: "Bağlantı Hatası" };
    }
}
