// firebase-messaging-sw.js
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyCP6ywEHkZKzUb-QqDDMaubuffGznMeUc0",
  authDomain: "bellona-71bee.firebaseapp.com",
  projectId: "bellona-71bee",
  storageBucket: "bellona-71bee.firebasestorage.app",
  messagingSenderId: "622122795654",
  appId: "1:622122795654:web:9a42d0026d5df595f68707",
  measurementId: "G-PQEHCR2RKW"
});

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

// Customize background message handler
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Arka planda push bildirim alındı: ", payload);

  const senderName = payload.data?.senderName || payload.notification?.title || "Yeni Mesaj";
  const messageBody = payload.data?.messageSummary || payload.notification?.body || "Bir yeni mesajınız var.";
  
  const notificationTitle = "Bellona IntraHub 📢";
  const notificationOptions = {
    body: `${senderName}: ${messageBody}`,
    icon: "/assets/bellona-logo.svg", // Logo path matching brand resources
    badge: "/assets/bellona-logo.svg",
    data: {
      url: self.location.origin + "/index.html"
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click to focus or redirect
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  
  const targetUrl = event.notification.data?.url || self.location.origin + "/index.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a tab is already open, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
