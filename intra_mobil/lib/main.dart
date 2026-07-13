import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'core/backend/firebase_config.dart';
import 'ui/screens/login_screen.dart';
import 'ui/screens/main_navigation_screen.dart';

// [SUNUM NOTU]: Uygulamanın ana başlangıç noktasıdır.
// Burada "Tek Backend - İki Frontend" mimarisinin mobil bacağını başlatıyoruz.
// Web tarafındaki JS tabanlı yapı ile buradaki Flutter yapısı aynı Firebase projesine bağlanır.
void main() async {
  // Flutter motorunun çizim yapabilmesi için gerekli bağlamaları başlatır.
  WidgetsFlutterBinding.ensureInitialized();
  
  // Ortak Backend Bağlantısı:
  // Web (Javascript) ile aynı Firebase projesine (veritabanı, kimlik doğrulama) bağlanılır.
  // Bu sayede web'den gönderilen bir mesaj, mobilde anında görülür (Senkronizasyon).
  await BackendConfig.initializeCommonBackend();
  
  runApp(const IntraMobileApp());
}

// [SUNUM NOTU]: Uygulamanın ana tema ve kök widget'ı.
// Web'deki 'Antigravity/SaaS' karanlık (Dark Mode) tasarım dilini birebir taklit eder.
class IntraMobileApp extends StatelessWidget {
  const IntraMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bellona Mobil',
      debugShowCheckedModeBanner: false,
      // Tema ayarları web arayüzündeki CSS tokenleri ile eşleştirilmiştir.
      theme: ThemeData(
        brightness: Brightness.light,
        scaffoldBackgroundColor: const Color(0xFF6CC7C7), // Web arkaplanı (Light mode)
        primaryColor: const Color(0xFF00828A), // Web birincil rengi
        fontFamily: 'Inter', // Web'deki modern tipografi
      ),
      home: const AuthChecker(), // Oturum durumunu dinleyen widget
    );
  }
}

// [SUNUM NOTU]: Kullanıcının giriş yapıp yapmadığını anlık (Stream) olarak dinleyen yapı.
// Web'deki "onAuthStateChanged" fonksiyonunun Flutter (Mobil) karşılığıdır.
class AuthChecker extends StatelessWidget {
  const AuthChecker({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      // Firebase'den anlık kimlik değişimi dinleniyor.
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        // Yüklenme durumunda bekleme animasyonu gösterilir.
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            backgroundColor: Color(0xFF09090B),
            body: Center(child: CircularProgressIndicator(color: Color(0xFF00828A))),
          );
        }
        // Eğer kullanıcı verisi varsa (Giriş yapılmışsa), Dashboard'a yönlendir.
        if (snapshot.hasData) {
          return const MainNavigationScreen();
        }
        // Giriş yapılmamışsa, Login ekranına yönlendir.
        return const LoginScreen();
      },
    );
  }
}


