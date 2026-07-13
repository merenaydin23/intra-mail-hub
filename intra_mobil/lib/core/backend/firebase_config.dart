import 'package:firebase_core/firebase_core.dart';

// [SUNUM NOTU]: Ortak Backend (Firebase) Bağlantı Ayarları
// Web uygulamasındaki (firebase.js) yapılandırmanın (config) birebir kopyasıdır.
// Web ve Mobil, tamamen farklı platformlar (HTML/JS vs Flutter) olmasına rağmen
// bu API anahtarları sayesinde aynı veritabanını, aynı sunucuyu ve aynı kullanıcı havuzunu paylaşır.
class BackendConfig {
  static Future<void> initializeCommonBackend() async {
    await Firebase.initializeApp(
      options: const FirebaseOptions(
        // Web projesindeki config ile aynı anahtarlar:
        apiKey: "AIzaSyCP6ywEHkZKzUb-QqDDMaubuffGznMeUc0",
        appId: "1:622122795654:web:9a42d0026d5df595f68707",
        messagingSenderId: "622122795654",
        projectId: "bellona-71bee",
        storageBucket: "bellona-71bee.firebasestorage.app",
      ),
    );
  }
}


