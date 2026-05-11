import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, serverTimestamp, query, where } from "firebase/firestore";

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

const ANNOUNCEMENT = {
    subject: "[DUYURU] Yeni Haftaya Başlarken",
    body: "Değerli Bellona Ailesi,\n\nYeni bir haftaya başlarken tüm bayi ve personelimize bereketli, sağlıklı ve başarı dolu bir çalışma dönemi dileriz. Bellona kalitesini her eve taşıma vizyonumuzla, birlikte daha nice başarılara imza atacağımıza inancımız tamdır.\n\nSaygılarımla, Bellona Fabrikası"
};

async function publishAnnouncement() {
    try {
        console.log("Publishing announcement to all users...");
        const usersSnap = await getDocs(query(collection(db, "users"), where("isActive", "==", true)));
        const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== 'admin');

        console.log(`Targeting ${users.length} users.`);

        let sentCount = 0;
        for (const user of users) {
            await addDoc(collection(db, "messages"), {
                senderId: "system_bellona_factory",
                senderName: "BELLONA GENEL MERKEZ",
                receiverId: user.id,
                receiverName: `${user.name} ${user.surname || ''}`,
                subject: ANNOUNCEMENT.subject,
                content: ANNOUNCEMENT.body,
                status: "active",
                isRead: false,
                timestamp: serverTimestamp(),
                type: "announcement"
            });
            sentCount++;
            if (sentCount % 10 === 0) console.log(`Sent to ${sentCount} users...`);
        }

        console.log(`SUCCESS: Announcement published to ${sentCount} users.`);
    } catch (err) {
        console.error("FAILED to publish announcement:", err);
    }
    process.exit();
}

publishAnnouncement();
