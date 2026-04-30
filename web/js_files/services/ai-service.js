/**
 * AI Service for Intra Mail Hub - COHERE API VERSION
 */

const COHERE_API_KEY = "REDACTED_COHERE_KEY";

export const CORPORATE_SYSTEM_PROMPT = `Sen üst düzey bir kurumsal iletişim uzmanısın. Görevin, sana iletilen ham metni EN ÜST DÜZEY nezaket ile YENİDEN YAZMAKTIR.
- Sadece başa sona ekleme yapma; mesajın gövdesini (core body) kurumsal bir üsluba kavuştur.
- "Sipariş geç", "Bak", "Yap" gibi emir kiplerini asla kullanma.
- Yazım hatalarını düzelt.
- Hitap: "Sayın [Alıcı Adı]," ile başla.
- Kapanış: "Bilgilerinize sunar, iyi çalışmalar dilerim."
- İmza: Saygılarımla, [Gönderen Adı] / [Şirket Adı]`;

export async function refineMessageWithAI(originalText, context) {
    const url = "https://api.cohere.ai/v1/chat";
    
    const prompt = `Alıcı: ${context.receiverName}
Gönderen: ${context.senderName}
Şirket: ${context.senderCompany}

Düzenlenecek Ham Metin:
"${originalText}"

Lütfen sadece düzenlenmiş nihai metni döndür. Hiçbir açıklama ekleme.`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${COHERE_API_KEY}`
            },
            body: JSON.stringify({
                message: prompt,
                model: "command",
                preamble: CORPORATE_SYSTEM_PROMPT
            })
        });

        const data = await response.json();
        
        if (data.text) {
            return "✨ " + data.text.trim();
        } else {
            console.error("Cohere API Error:", data);
            return "❌ Cohere Hatası: " + (data.message || "Bilinmeyen hata.");
        }
    } catch (error) {
        console.error("Cohere Connection Error:", error);
        return "❌ Bağlantı Hatası: " + error.message;
    }
}
