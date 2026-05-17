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

async function updateDepartments() {
    console.log("Fetching all users from database...");
    const snap = await getDocs(collection(db, "users"));
    let updateCount = 0;

    for (const d of snap.docs) {
        const user = d.data();
        let newDept = null;

        if (user.subRole === "manager") {
            if (user.category === "factory") {
                newDept = "Fabrika Genel Müdürü";
            } else if (user.category === "regional") {
                newDept = "Bölge Müdürü";
            } else if (user.category === "local") {
                newDept = "Bayi Yöneticisi";
            }
        } else {
            // Check if department field contains "Patron" or "Sahibi"
            if (user.department === "Mağaza Sahibi / Patron" || user.department === "Patron") {
                newDept = "Bayi Yöneticisi";
            } else if (user.department === "Yönetici / Patron") {
                newDept = "Bölge Müdürü";
            }
        }

        // Only update if department value changed
        if (newDept && user.department !== newDept) {
            console.log(`Updating user ${user.name} ${user.surname} (${user.email}): "${user.department}" -> "${newDept}"`);
            await updateDoc(doc(db, "users", d.id), {
                department: newDept
            });
            updateCount++;
        }
    }

    console.log(`Successfully updated ${updateCount} users in Firestore.`);
    process.exit(0);
}

updateDepartments().catch(err => {
    console.error(err);
    process.exit(1);
});
