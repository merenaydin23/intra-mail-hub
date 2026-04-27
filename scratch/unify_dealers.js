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

async function unifyDealerLocations() {
    console.log("Fetching all users to identify dealer inconsistencies...");
    const snap = await getDocs(collection(db, "users"));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const dealerMap = {}; // { companyName: { city|region: count } }

    // First pass: identify locations for each dealer
    users.forEach(u => {
        if (!u.company || u.category === 'factory' || !u.city) return;
        
        const key = u.company.trim();
        if (!dealerMap[key]) {
            dealerMap[key] = {};
        }
        
        const locKey = `${u.city}|${u.region}`;
        if (!dealerMap[key][locKey]) {
            dealerMap[key][locKey] = 0;
        }
        dealerMap[key][locKey]++;
    });

    const finalDealers = {};
    for (const company in dealerMap) {
        // Pick the location with the most users
        const sortedLocs = Object.entries(dealerMap[company]).sort((a, b) => b[1] - a[1]);
        const [bestLoc] = sortedLocs[0];
        const [city, region] = bestLoc.split('|');
        finalDealers[company] = { city, region };
        
        if (sortedLocs.length > 1) {
            console.log(`Found inconsistency for ${company}:`, dealerMap[company]);
            console.log(`Unifying to: ${city}, ${region}`);
        }
    }

    // Second pass: update users with inconsistent locations
    console.log("Updating inconsistent users...");
    let updateCount = 0;
    for (const u of users) {
        if (!u.company || u.category === 'factory' || !u.city) continue;
        
        const key = u.company.trim();
        const target = finalDealers[key];
        
        if (u.city !== target.city || u.region !== target.region) {
            console.log(`Updating ${u.name} ${u.surname} (${u.company}): ${u.city} -> ${target.city}`);
            await updateDoc(doc(db, "users", u.id), {
                city: target.city,
                region: target.region
            });
            updateCount++;
        }
    }

    console.log(`Done! Unified ${updateCount} user records.`);
    process.exit();
}

unifyDealerLocations().catch((err) => {
    console.error(err);
    process.exit(1);
});
