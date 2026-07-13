/**
 * AI Service — Bellona IntraMail Hub
 * Cohere command-nightly modeli kullanır.
 *  1. refineMessageWithAI  → Taslak mesajı kurumsal dile çevirir
 *  2. summarizeThreadWithAI → Yazışmayı özetler
 *  3. chatWithThreadAI     → Yazışma hakkında soru-cevap (AI Chat)
 */
const COHERE_API_URL = "https://api.cohere.ai/v1/chat";
const COHERE_KEYS = [
    "cohere_XcEa1sBkZn8M29BMRwKWVVB5ES1PZsIQzNjkjjtI2zMCaf",
    "cohere_BxXIPk5YNRlkYMk4kMffyqGIA4PjkIarA1qimodt12RPUS",
    "SIMp9lNijXKnlEFzYRwo1MK5EV9RsnbBVWzHsKiQ"
];

// ── Ortak istek fonksiyonu (Çoklu Key ile Fallback) ──────────────────────────
async function cohereRequest(message, preamble, chatHistory = []) {
    for (let i = 0; i < COHERE_KEYS.length; i++) {
        try {
            // Baştaki "cohere_" fazlalıklarını temizleyelim, bazen kopyalarken gelebilir
            let key = COHERE_KEYS[i].replace("cohere_", "");
            
            const body = { message, preamble, model: "command-nightly" };
            if (chatHistory.length > 0) body.chat_history = chatHistory;

            const res = await fetch(COHERE_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${key}`
                },
                body: JSON.stringify(body)
            });
            
            if (!res.ok) {
                // Eğer 401 (Unauthorized) veya 429 (Rate Limit) alırsak diğer key'e geç
                console.warn(`API Key ${i+1} başarısız oldu (${res.status}). Diğerine geçiliyor...`);
                continue; 
            }
            
            const data = await res.json();
            if (data.text) return { text: data.text.trim(), error: null };
            
        } catch (err) {
            console.error(`API Key ${i+1} isteğinde hata:`, err);
            if (i === COHERE_KEYS.length - 1) {
                return { text: null, error: "Tüm API bağlantıları başarısız: " + err.message };
            }
        }
    }
    return { text: null, error: "Yanıt alınamadı." };
}

// ── Yazışma metnini düz metne çevir (AI'ya göndermek için) ───────────────────
function buildThreadText(subject, senderName, receiverName, content, replies = []) {
    let text = `Konu: ${subject}\nGönderen: ${senderName}\nAlıcı: ${receiverName}\nMesaj:\n${content}\n`;
    if (replies.length > 0) {
        text += `\n── Yanıtlar ──\n`;
        replies.forEach((r, i) => {
            if (!r.isSystem) {
                text += `[${i + 1}] ${r.authorName}: ${r.text}\n`;
            }
        });
    }
    return text;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. MESAJ RAFINE ET
// ═══════════════════════════════════════════════════════════════════════════════
export function getCorporateSystemPrompt(isReply = false) {
    let prompt = `Sen, "IntraMail Hub" platformuna entegre edilmiş uzman bir metin düzenleme ve e-posta yazım asistanısın.
Görevin: Kullanıcının taslak halinde, kaba, karışık veya günlük dille yazdığı metinleri alıp, BİZZAT KULLANICININ AĞZINDAN KURUMSAL BİR E-POSTA olarak YENİDEN YAZMAKTIR.

ÇOK ÖNEMLİ UYARI:
- Sen kullanıcının sorusuna veya mesajına CEVAP VERMİYORSUN!
- Müşteri temsilcisi rolüne BÜRÜNME.
- Görevin, kullanıcının yazdığı metni "Alıcı"ya gönderilecek resmi bir e-postaya dönüştürmektir. Metni her zaman Gönderen'in (kullanıcının) ağzından yaz.

Çıktı üretirken aşağıdaki kurallara KESİNLİKLE uymalısın:
`;

    if (!isReply) {
        prompt += `1. Konu Satırı: Kullanıcının mesajının amacına uygun, profesyonel bir "Konu:" satırı oluştur.
2. Hitap: Metne "Sayın [Alıcı Adı]," şeklinde başla.
3. Üslup: Çok kibar, saygılı ve net bir kurumsal dille ifade et.
4. Çıktı Formatı: SADECE e-postanın kendisini ver.

Çıktı Formatın KESİNLİKLE VE SADECE şu şekilde olmalıdır:

Konu: [Oluşturulan Konu]

Sayın [Alıcı Adı],

[Metin]

Saygılarımla,
[Gönderen Adı]
[Şirket / Departman]`;
    } else {
        prompt += `1. Konu YASAK: Bu zaten mevcut bir yazışmaya yanıt olduğu için KESİNLİKLE "Konu:" satırı oluşturma.
2. Hitap: Metne "Sayın [Alıcı Adı]," şeklinde başla.
3. Üslup: Çok kibar, saygılı ve net bir kurumsal dille ifade et.
4. Çıktı Formatı: SADECE e-postanın kendisini ver.

Çıktı Formatın KESİNLİKLE VE SADECE şu şekilde olmalıdır:

Sayın [Alıcı Adı],

[Metin]

Saygılarımla,
[Gönderen Adı]
[Şirket / Departman]`;
    }

    return prompt;
}

export async function refineMessageWithAI(originalText, context) {
    const prompt = `Alıcı: ${context.receiverName}\nGönderen: ${context.senderName}\nŞirket: ${context.senderCompany}\nMetin: "${originalText}"\n\nLütfen sadece düzenlenmiş nihai metni döndür.`;
    const sysPrompt = getCorporateSystemPrompt(context.isReply);
    const result = await cohereRequest(prompt, sysPrompt);
    return result.text || { error: result.error };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. YAZIŞMAYI ÖZETLE
// ═══════════════════════════════════════════════════════════════════════════════
export async function summarizeThreadWithAI(subject, senderName, receiverName, content, replies) {
    const threadText = buildThreadText(subject, senderName, receiverName, content, replies);
    const preamble = `Sen üst düzey bir kurumsal yönetici asistanısın. Sana iletilen e-posta yazışmasını 3-4 cümlelik akıcı bir paragraf halinde özetle.
Bunu yaparken:
- Olayın ana konusunu ve sürecin içinde kimlerin yer aldığını (kişileri) kısaca belirt.
- Her detaya girmek yerine sadece sürecin nasıl bağlandığına (karar, tarih, sipariş adedi vb.) ve bir sonraki adıma odaklan.
- Çok kısa veya çok uzun olmasın; okuyan yönetici süreci ve kişileri anlayabilsin ama gereksiz detaylarla yorulmasın.
Sohbet, selamlaşma veya giriş cümlesi KESİNLİKLE kullanma, doğrudan özet metnini ver.`;
    const prompt = `Şu yazışmayı özetle:\n\n${threadText}`;
    const result = await cohereRequest(prompt, preamble);
    return result.text || "Özet oluşturulurken bir hata oluştu.";
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. YAZIŞMA HAKKINDA SORU-CEVAP (AI CHAT)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Yazışma chatbotu — kullanıcı bu e-posta zinciri hakkında istediği soruyu sorabilir.
 *
 * @param {object} threadData  — { subject, senderName, receiverName, content, replies }
 * @param {string} userQuestion — Kullanıcının sorusu
 * @param {Array}  chatHistory  — Önceki soru-cevap geçmişi [{role, message}]
 * @returns {{ answer: string, updatedHistory: Array }}
 */
export async function chatWithThreadAI(threadData, userQuestion, chatHistory = []) {
    const threadText = buildThreadText(
        threadData.subject,
        threadData.senderName,
        threadData.receiverName,
        threadData.content,
        threadData.replies || []
    );

    const preamble = `Sen Bellona kurumsal e-posta sisteminin yapay zeka asistanısın.
Aşağıdaki e-posta yazışması hakkında kullanıcının sorularını yanıtlıyorsun.
Sadece yazışmada bulunan bilgilere dayanarak cevap ver.
Yazışmada olmayan konularda "Bu yazışmada bu bilgi bulunmuyor" de.
Türkçe, net ve profesyonel cevap ver.

── YAZIŞMA İÇERİĞİ ──
${threadText}
─────────────────────`;

    const result = await cohereRequest(userQuestion, preamble, chatHistory);

    const answer = result.text || "Şu an yanıt verilemiyor. Lütfen tekrar deneyin.";

    // Geçmişi güncelle
    const updatedHistory = [
        ...chatHistory,
        { role: "USER", message: userQuestion },
        { role: "CHATBOT", message: answer }
    ];

    return { answer, updatedHistory };
}

export async function getReplySuggestionsWithAI(subject, senderName, receiverName, content, replies) {
    const threadText = buildThreadText(subject, senderName, receiverName, content, replies);
    const preamble = `Sen, Bellona IntraMail Hub platformu için akıllı hızlı yanıt önerileri üreten uzman bir yapay zekasın.
Görevlerin:
1. Sana iletilen e-posta yazışmasını ve geçmiş tüm yanıtları oku.
2. ÇOK ÖNEMLİ: Özellikle yazışmadaki EN SON GELEN e-postaya doğrudan yanıt niteliğinde öneriler üret. Öneri son mesaja doğrudan cevap olmalı, bağlamla uyumlu, son derece nazik, kurumsal ve mantıklı olmalıdır.
3. Dil ve Üslup: Her zaman resmi, kibar, profesyonel kurumsal Türkçe kullan. Günlük kelimeler veya laubali ifadeler kesinlikle yasaktır.
4. Örneğin: Son mesaj "İlgili birime iletilmiştir" veya "İşlemlerinizi başlattık" gibi bir bilgilendirmeyse, buna doğrudan cevap olarak "Teşekkür eder, iyi çalışmalar dilerim.", "Bilgilendirme için teşekkürler.", "Süreci yakından takip ediyoruz." gibi nazik ve takipçi yanıtlar öner. Asla alakasız, genel geçer veya jenerik şablonlar üretme.
5. Her yanıt önerisi maksimum 4-6 kelime olmalıdır.
6. Çıktın KESİNLİKLE sadece geçerli ve temiz bir JSON dizisi (Array) formatında olmalıdır. Başka hiçbir açıklama, giriş veya çıkış kelimesi yazma.

Örnek Çıktı:
["Detayları inceleyip dönüş yapacağım.", "Siparişi onaylıyorum.", "Yarın toplantıda görüşelim."]`;

    const prompt = `Şu yazışma geçmişine ve özellikle gelen son e-postaya doğrudan yanıt olacak, kurumsal ve bağlamı takip eden 3 kısa yanıt önerisi oluştur:\n\n${threadText}`;
    const result = await cohereRequest(prompt, preamble);
    if (result.text) {
        try {
            let cleanText = result.text.replace(/```json/g, "").replace(/```/g, "").trim();
            const suggestions = JSON.parse(cleanText);
            if (Array.isArray(suggestions)) return suggestions.slice(0, 3);
        } catch (e) {
            console.error("Error parsing AI suggestions JSON:", e);
        }
    }
    return ["Detayları inceleyip bilgi vereceğim.", "Teşekkürler, iyi çalışmalar.", "Konuyu ilgili birimle görüşüyorum."];
}

export async function getDetailedReplyDraftsWithAI(subject, senderName, receiverName, content, replies) {
    const threadText = buildThreadText(subject, senderName, receiverName, content, replies);
    const preamble = `Sen, Bellona IntraMail Hub platformu için detaylı e-posta cevap taslakları hazırlayan uzman bir kurumsal asistan yapay zekasın.
Görevlerin:
1. Sana iletilen e-posta yazışmasını, konu başlığını ve geçmişte karşılıklı yazılmış olan tüm iletileri oku.
2. ÇOK ÖNEMLİ: Özellikle yazışmadaki EN SON GELEN e-postaya doğrudan yanıt niteliğinde taslaklar üret. Taslaklar son mesaja doğrudan cevap olmalı, bağlamla tam uyumlu, nazik ve mantıklı olmalıdır.
3. Dil ve Üslup: Her zaman resmi, saygılı, kurumsal ve profesyonel Türkçe kullan. "Saygılarımla", "İyi çalışmalar dilerim" gibi kurumsal nezaket ifadeleri mutlaka yer almalıdır.
4. Örneğin: Son mesaj "İlgili birime iletilmiştir" veya "İşlemlerinizi başlattık" gibi bir bilgilendirmeyse, buna doğrudan cevap olarak "Geri bildiriminiz ve bilgilendirmeniz için teşekkür ederim. Süreci takip ederek en kısa sürede tarafınıza dönüş sağlayacağım, iyi çalışmalar dilerim." veya "Konuya dair verdiğiniz bilgi için teşekkürler, gelişmeleri takip ediyor olacağız." gibi nazik ve takipçi yanıtlar oluştur. Asla alakasız veya genel geçer şablonlar üretme.
5. Taslaklardan biri olumlu/net bir dönüş/yanıt olmalı; diğeri ise konunun incelenmesi, alternatif önerilmesi veya ek süre/bilgi/teşekkür içermelidir.
6. Her bir taslak 2-4 profesyonel kurumsal cümleden oluşmalı, saygılı ve akıcı olmalıdır.
7. Çıktın KESİNLİKLE sadece geçerli ve temiz bir JSON dizisi (Array) formatında olmalıdır. Başka hiçbir açıklama, giriş veya çıkış kelimesi yazma.

Örnek Çıktı:
["İletmiş olduğunuz ayrıntıları detaylıca inceledim. Talebinizi onaylıyorum, gün içerisinde ilgili işlemler tamamlanarak tarafınıza bilgi aktarılacaktır.", "Göndermiş olduğunuz e-posta için teşekkürler. Bahsettiğiniz konuyu ilgili departmanımız ile paylaşıp inceleme başlattık. En kısa sürede dönüş sağlayacağız."]`;

    const prompt = `Şu yazışma geçmişine ve özellikle gelen son e-postaya doğrudan yanıt olacak, son derece kurumsal, nazik, baştan savma olmayan ve bağlamla doğrudan ilişkili 2 farklı detaylı Türkçe cevap taslağı oluştur:\n\n${threadText}`;
    const result = await cohereRequest(prompt, preamble);
    if (result.text) {
        try {
            let cleanText = result.text.replace(/```json/g, "").replace(/```/g, "").trim();
            const drafts = JSON.parse(cleanText);
            if (Array.isArray(drafts)) return drafts.slice(0, 2);
        } catch (e) {
            console.error("Error parsing AI drafts JSON:", e);
        }
    }
    return [
        "İletiniz tarafımıza ulaştı. Detaylı bir inceleme gerçekleştirdikten sonra en kısa süre içerisinde size dönüş sağlayacağız. İyi çalışmalar dileriz.",
        "Konuyla ilgili talebinizi aldık ve gerekli birimlerimize ilettik. En geç yarın mesai bitimine kadar sizi bilgilendirmiş olacağız."
    ];
}
