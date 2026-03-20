const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");

admin.initializeApp();

// Initialize the Gemini API client
// Note: We'll set the API key in Firebase environment config later
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.processNewMessage = onDocumentCreated("messages/{messageId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const messageData = snapshot.data();
    console.log("New message created! We will process this:", messageData);
    
    // AI Translation & Spam detection logic will go here
});
