import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { storage } from "../firebase/config.js";

/**
 * Uploads a file to Firebase Storage
 * @param {File} file - The file object to upload
 * @param {string} path - The path in storage (e.g. 'attachments/msg_123')
 * @returns {Promise<{url: string, name: string, size: number, type: string}>}
 */
export async function uploadAttachment(file, path) {
    if (!file) return null;
    
    // Create a unique filename to avoid collisions
    const timestamp = Date.now();
    const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const storagePath = `${path}/${timestamp}_${cleanName}`;
    
    const storageRef = ref(storage, storagePath);
    
    try {
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);
        
        return {
            url,
            name: file.name,
            size: file.size,
            type: file.type,
            storagePath: storagePath
        };
    } catch (error) {
        console.error("Storage Upload Error:", error);
        throw new Error("Dosya yüklenirken bir hata oluştu: " + error.message);
    }
}
