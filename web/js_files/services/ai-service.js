/**
 * AI Service for Intra Mail Hub
 * This service handles text processing and corporate communication refinements.
 */

export const CORPORATE_SYSTEM_PROMPT = `Sen kurumsal iletişim konusunda uzman bir asistansın. Sana birazdan kaba, eksik ve düzensiz yazılmış bir e-posta metni vereceğim.

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
- Türkçe dil bilgisi kusursuz olsun`;

/**
 * Refines the given text using corporate rules.
 * Currently using a rule-based approach, but prepared for AI integration.
 */
export function refineMessageWithAI(originalText, context) {
    const { receiverName, senderName, senderCompany } = context;

    // Rule-based fallback (The "System" logic)
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
