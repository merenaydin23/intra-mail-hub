/**
 * find_broken_users.js
 * Firebase Auth'ta var ama Firestore'da kaydı olmayan kullanıcıları listeler.
 *
 * KULLANIM:
 *   node find_broken_users.js
 *
 * NOT: Bu scripti çalıştırmak için Firebase Admin SDK gerekli.
 *   npm install firebase-admin
 *   Ayrıca Firebase Console > Project Settings > Service Accounts >
 *   "Generate new private key" ile serviceAccount.json indirin.
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const SERVICE_ACCOUNT_PATH = './serviceAccount.json';

if (!existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`
❌ serviceAccount.json bulunamadı!

Şu adımları izle:
1. Firebase Console'a git: https://console.firebase.google.com/project/bellona-71bee/settings/serviceaccounts/adminsdk
2. "Generate new private key" butonuna tıkla
3. İndirilen JSON dosyasını projenin kök dizinine "serviceAccount.json" olarak kaydet
4. Tekrar çalıştır: node find_broken_users.js
`);
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'bellona-71bee'
});

const auth = admin.auth();
const db   = admin.firestore();

async function main() {
  console.log('\n===== INTRAMAIL HUB — Kırık Kayıt Tarayıcı =====\n');
  console.log('Firebase Auth kullanıcıları çekiliyor...');

  const broken = [];
  let pageToken;

  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const user of result.users) {
      const snap = await db.collection('users').doc(user.uid).get();
      if (!snap.exists) {
        broken.push({ uid: user.uid, email: user.email, createdAt: user.metadata.creationTime });
        console.log(`  ⚠️  Eksik: ${user.email} (UID: ${user.uid.slice(0,8)}...)`);
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`\n=== SONUÇ ===`);
  if (broken.length === 0) {
    console.log('✅ Tüm kullanıcıların Firestore kaydı mevcut! Sorun başka bir yerde.');
  } else {
    console.log(`❌ ${broken.length} kullanıcının Firestore kaydı eksik:\n`);
    broken.forEach((u, i) => {
      console.log(`  ${i+1}. ${u.email}`);
      console.log(`     UID: ${u.uid}`);
      console.log(`     Kayıt tarihi: ${u.createdAt}`);
      console.log(`     Onarım linki: http://localhost:5173/repair.html?email=${encodeURIComponent(u.email)}\n`);
    });
    console.log('\nHer kullanıcı yukarıdaki linkten kendi kaydını onarabilir.');
    console.log('Ya da admin olarak Firebase Console > Firestore > users koleksiyonuna manuel ekleyebilirsin.');
  }

  process.exit(0);
}

main().catch(e => {
  console.error('Script hatası:', e);
  process.exit(1);
});
