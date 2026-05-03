/**
 * AI Service for Intra Mail Hub - REFINED VERSION
 */

const COHERE_KEYS = [
    "cohere_E5mMqw1uCMfOemaWOWadZ6xLOhSV54RJIbuqqLDo3k1SDd"
];

export const CORPORATE_SYSTEM_PROMPT = `Sen üst düzey bir kurumsal iletişim uzmanısın. Görevin, iletilen ham metni en profesyonel hale getirmektir.

TALİMATLAR:
1. Yazım hatalarını düzelt ve emir kiplerini profesyonel ricalara dönüştür.
2. KISA VE NET OL. Aynı anlama gelen nezaket cümlelerini (örneğin "saygılar sunarım" ve "saygılarımla") üst üste kullanma.
3. Sadece TEK bir kapanış cümlesi ve TEK bir imza bloğu kullan.

FORMAT:
- Hitap: "Sayın [Alıcı Adı],"
- Gövde: Mesajın profesyonel ve kısa hali.
- Kapanış: "Bilgilerinize sunar, iyi çalışmalar dilerim."
- İmza: Saygılarımla, [Gönderen Adı] / [Şirket Adı]`;

export async function refineMessageWithAI(originalText, context) {
    const url = "https://api.cohere.ai/v1/chat";
    const prompt = `Alıcı: ${context.receiverName}\nGönderen: ${context.senderName}\nŞirket: ${context.senderCompany}\nMetin: "${originalText}"\n\nLütfen sadece düzenlenmiş nihai metni döndür.`;

    for (let i = 0; i < COHERE_KEYS.length; i++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${COHERE_KEYS[i]}`
                },
                body: JSON.stringify({
                    message: prompt,
                    model: "command-nightly",
                    preamble: CORPORATE_SYSTEM_PROMPT
                })
            });

            const data = await response.json();
            if (data.text) {
                return data.text.trim();
            }
            continue;
        } catch (error) {
            if (i === COHERE_KEYS.length - 1) return { error: "Bağlantı Hatası" };
            continue;
        }
    }
}
