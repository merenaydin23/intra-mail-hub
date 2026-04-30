/**
 * AI Service for Intra Mail Hub - FAILOVER COHERE VERSION
 */

const COHERE_KEYS = [
    "REDACTED_COHERE_KEY", // Mevcut Anahtar
    "nVycIJVNLnVwYiWReqftZg6YYBmJKhRHvVxOqPSx", // Yedek 1
    "OEDhvaCBWLQWE6qx7ldJXUOS0jsKnEwrPwlRrPXz", // Yedek 2
    "Ld5d59Zrld2jIoFh3rN4w5Y5n6NAa1y0iSpDLrA9"  // Yedek 3
];

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

/**
 * Refines the given text using corporate rules with automatic key failover.
 */
export async function refineMessageWithAI(originalText, context) {
    const url = "https://api.cohere.ai/v1/chat";
    const prompt = `Alıcı: ${context.receiverName}\nGönderen: ${context.senderName}\nŞirket: ${context.senderCompany}\nMetin: "${originalText}"\n\nLütfen sadece yukarıdaki JSON formatında yanıt ver. Hiçbir açıklama ekleme.`;

    // Anahtar havuzundaki her bir anahtarı sırayla deniyoruz
    for (let i = 0; i < COHERE_KEYS.length; i++) {
        const currentKey = COHERE_KEYS[i];
        console.log(`AI Denemesi: ${i + 1}/${COHERE_KEYS.length} - Anahtar: ${currentKey.substring(0, 5)}...`);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentKey}`
                },
                body: JSON.stringify({
                    message: prompt,
                    model: "command-nightly",
                    preamble: CORPORATE_SYSTEM_PROMPT
                })
            });

            const data = await response.json();
            
            // Başarılı yanıt kontrolü
            if (data.text) {
                try {
                    const jsonStr = data.text.substring(data.text.indexOf('{'), data.text.lastIndexOf('}') + 1);
                    const aiResult = JSON.parse(jsonStr);
                    return {
                        subject: aiResult.subject,
                        body: "✨ " + aiResult.body
                    };
                } catch (e) {
                    return {
                        subject: "Bilgilendirme",
                        body: "✨ " + data.text.trim()
                    };
                }
            } else {
                console.warn(`Anahtar ${i + 1} hata verdi:`, data.message || "Bilinmeyen hata");
                // Eğer son anahtar da bittiyse hata dön
                if (i === COHERE_KEYS.length - 1) return { error: data.message || "Tüm AI anahtarları tükendi." };
                continue; // Bir sonraki anahtarı dene
            }
        } catch (error) {
            console.error(`Bağlantı hatası (Anahtar ${i + 1}):`, error.message);
            if (i === COHERE_KEYS.length - 1) return { error: "İnternet bağlantısı veya sunucu hatası." };
            continue; // Bir sonraki anahtarı dene
        }
    }
}
