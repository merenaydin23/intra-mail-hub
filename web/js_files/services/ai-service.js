/**
 * AI Service for Intra Mail Hub
 * This service handles text processing and corporate communication refinements.
 * Calling Gemini API directly for testing purposes.
 */

const GEMINI_API_KEY = "AIzaSyCeJKg6uWXcOSW-8KB1elCnSsWTlnsTBzM";

export const CORPORATE_SYSTEM_PROMPT = `Sen üst düzey bir kurumsal iletişim ve halkla ilişkiler uzmanısın. Görevin, sana iletilen ham, kaba veya doğrudan yazılmış mesajı alıp, anlamını koruyarak EN ÜST DÜZEY nezaket ve profesyonellik ile YENİDEN YAZMAKTIR.

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
[Şirket Adı]`;

/**
 * Refines the given text using corporate rules via Real AI (Gemini).
 */
export async function refineMessageWithAI(originalText, context) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const prompt = `${CORPORATE_SYSTEM_PROMPT}

Alıcı: ${context.receiverName || 'Yetkili'}
Gönderen: ${context.senderName || 'Çalışan'}
Şirket: ${context.senderCompany || 'Bellona'}

Düzenlenecek Ham Metin:
"${originalText}"

Lütfen sadece düzenlenmiş nihai metni döndür. Hiçbir açıklama ekleme.`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            return data.candidates[0].content.parts[0].text.trim();
        } else {
            console.error("Gemini API Error Response:", data);
            return fallbackRefinement(originalText, context);
        }
    } catch (error) {
        console.error("Direct AI Call Error:", error);
        return fallbackRefinement(originalText, context);
    }
}

/**
 * Local fallback logic if AI fails or is unavailable.
 */
function fallbackRefinement(originalText, context) {
    const { receiverName, senderName, senderCompany } = context;

    let refinedText = originalText
        .replace(/^merhaba/i, "Merhaba,")
        .replace(/teşekkür ederim/i, "teşekkür eder,")
        .replace(/ihtiyacım bulunmaktadır/i, "ihtiyacımız bulunmaktadır.")
        .replace(/kontrol edip/i, "kontrol ederek")
        .replace(/geri dönüş yaparsınız/i, "tarafımıza bilgi verilmesini rica ederim.")
        .trim();

    refinedText = refinedText.charAt(0).toUpperCase() + refinedText.slice(1);
    if (!refinedText.endsWith(".") && !refinedText.endsWith("!")) refinedText += ".";

    return `Sayın ${receiverName},\n\n${refinedText}\n\nİyi çalışmalar dilerim.\n\nSaygılarımla,\n${senderName}\n${senderCompany}`;
}
