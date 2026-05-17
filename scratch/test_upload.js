import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyCP6ywEHkZKzUb-QqDDMaubuffGznMeUc0",
    authDomain: "bellona-71bee.firebaseapp.com",
    projectId: "bellona-71bee",
    storageBucket: "bellona-71bee.appspot.com",
    messagingSenderId: "622122795654",
    appId: "1:622122795654:web:9a42d0026d5df595f68707"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

async function testUpload() {
    try {
        console.log("Attempting to log in as test user...");
        const cred = await signInWithEmailAndPassword(auth, "test.bayi@bellona.com.tr", "Bellona123!");
        console.log("✅ Logged in successfully! UID:", cred.user.uid);

        console.log("Creating dummy file content...");
        const bytes = new Uint8Array([112, 100, 102, 32, 99, 111, 110, 116, 101, 110, 116]); // "pdf content" in ASCII
        const fileRef = ref(storage, `messages/test_upload_${Date.now()}.pdf`);

        console.log("Uploading dummy file to messages/ directory...");
        const uploadResult = await uploadBytes(fileRef, bytes, { contentType: 'application/pdf' });
        console.log("✅ Upload successful! Ref path:", uploadResult.ref.fullPath);

        console.log("Getting download URL...");
        const downloadUrl = await getDownloadURL(uploadResult.ref);
        console.log("✅ Download URL successfully retrieved!");
        console.log("URL:", downloadUrl);
    } catch (error) {
        console.error("❌ ERROR CAUGHT:");
        console.error(error.code || error.message || error);
    }
    process.exit();
}

testUpload();
