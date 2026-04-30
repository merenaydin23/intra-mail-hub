import { functions } from '../firebase/config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

/**
 * AI Service for Intra Mail Hub
 * This service handles text processing and corporate communication refinements via Firebase Cloud Functions.
 */

export const CORPORATE_SYSTEM_PROMPT = `Sen kurumsal iletişim konusunda uzman bir asistansın... (Prompt Cloud Function tarafında saklanıyor)`;

/**
 * Refines the given text using corporate rules via Real AI (Gemini).
 */
export async function refineMessageWithAI(originalText, context) {
    try {
        const refineFunc = httpsCallable(functions, 'refineCorporateMessage');
        const result = await refineFunc({
            text: originalText,
            context: context
        });

        if (result.data.error) {
            console.error("AI Error:", result.data.error);
            return fallbackRefinement(originalText, context);
        }

        return result.data.refinedText;
    } catch (error) {
        console.error("Firebase Function Error:", error);
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
