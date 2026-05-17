import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCP6ywEHkZKzUb-QqDDMaubuffGznMeUc0",
    authDomain: "bellona-71bee.firebaseapp.com",
    projectId: "bellona-71bee",
    storageBucket: "bellona-71bee.firebasestorage.app",
    messagingSenderId: "622122795654",
    appId: "1:622122795654:web:9a42d0026d5df595f68707"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const codeMap = {
    "Marmara": "0001",
    "Ege": "0002",
    "İç Anadolu": "0003",
    "Akdeniz": "0004",
    "Karadeniz": "0005",
    "Güneydoğu Anadolu": "0006",
    "Doğu Anadolu": "0007"
};

async function updateRegionalCodes() {
    console.log("Fetching all users from database...");
    const snap = await getDocs(collection(db, "users"));
    let updateCount = 0;

    for (const d of snap.docs) {
        const user = d.data();
        
        if (user.category === "regional") {
            const correctCode = codeMap[user.region] || "0000";
            const needsCodeUpdate = user.dealerCode !== correctCode;
            
            let newEmail = user.email;
            const match = user.email.match(/^(.+)\.(\d+)(@bellona\.com\.tr)$/);
            if (match) {
                const prefix = match[1];
                const suffix = match[3];
                newEmail = `${prefix}.${correctCode}${suffix}`;
            } else {
                const match2 = user.email.match(/^(.+)(@bellona\.com\.tr)$/);
                if (match2) {
                    const prefix = match2[1];
                    const suffix = match2[2];
                    newEmail = `${prefix}.${correctCode}${suffix}`;
                }
            }
            
            const needsEmailUpdate = user.email !== newEmail;

            if (needsCodeUpdate || needsEmailUpdate) {
                console.log(`Updating ${user.company || "Regional"} user ${user.name} ${user.surname}:`);
                if (needsCodeUpdate) console.log(`  Code: "${user.dealerCode}" -> "${correctCode}"`);
                if (needsEmailUpdate) console.log(`  Email: "${user.email}" -> "${newEmail}"`);
                
                await updateDoc(doc(db, "users", d.id), {
                    dealerCode: correctCode,
                    email: newEmail
                });
                updateCount++;
            }
        }
    }

    console.log(`Successfully updated ${updateCount} regional users in Firestore.`);
    process.exit(0);
}

updateRegionalCodes().catch(err => {
    console.error(err);
    process.exit(1);
});
