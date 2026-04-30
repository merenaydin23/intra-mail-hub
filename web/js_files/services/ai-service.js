/**
 * AI Service for Intra Mail Hub - DIRECT AI VERSION
 */

const GEMINI_API_KEY = "AIzaSyCeJKg6uWXcOSW-8KB1elCnSsWTlnsTBzM";

export const CORPORATE_SYSTEM_PROMPT = `Sen üst düzey bir kurumsal iletişim uzmanısın. Görevin, sana iletilen ham metni EN ÜST DÜZEY nezaket ile YENİDEN YAZMAKTIR.
- Sadece başa sona ekleme yapma; mesajın gövdesini (core body) kurumsal bir üsluba kavuştur.
- "Sipariş geç", "Bak", "Yap" gibi emir kiplerini asla kullanma.
- Yazım hatalarını ("tina kanpee" gibi) düzelt.
- Hitap: "Sayın [Alıcı Adı]," ile başla.
- Kapanış: "Bilgilerinize sunar, iyi çalışmalar dilerim."
- İmza: Saygılarımla, [Gönderen Adı] / [Şirket Adı]`;

export async function refineMessageWithAI(originalText, context) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const prompt = `${CORPORATE_SYSTEM_PROMPT}

Alıcı: ${context.receiverName}
Gönderen: ${context.senderName}
Şirket: ${context.senderCompany}

Düzenlenecek Ham Metin:
"${originalText}"

Lütfen sadece düzenlenmiş nihai metni döndür. Başına "✨ " simgesi ekle ki AI olduğu belli olsun.`;

    try {
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
            return "❌ AI Hatası: " + (data.error?.message || "Bilinmeyen hata. Lütfen konsolu kontrol et.");
        }
    } catch (error) {
        return "❌ Bağlantı Hatası: " + error.message;
    }
}
