import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
// import 'package:firebase_core/firebase_core.dart'; // Aktif edildiğinde kullanılacak
import 'app_theme.dart';

// Not: Bu taslak "Web (HTML/CSS)" ile Flutter'ın nasıl birleştiğini gösteren demo niteliğindedir.
// Çalıştırmak için Flutter SDK kurulumundan sonra 'flutter run -d chrome' kullanılmalıdır.

void main() async {
  // WidgetsFlutterBinding.ensureInitialized();
  // await Firebase.initializeApp(); // Backend bağlantısı (Aynı Firebase projesi)
  
  runApp(const IntraMailMobile());
}

class IntraMailMobile extends StatelessWidget {
  const IntraMailMobile({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bellona Intra Mail',
      theme: AppTheme.darkTheme,
      home: const DashboardScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({Key? key}) : super(key: key);

  @override
  _DashboardScreenState createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  // Web'deki inbox.js onSnapshot() metodunun birebir aynısı
  // İki platform da aynı koleksiyonu dinlediği için mesajlar anında iki tarafta da belirir.
  /*
  Stream<QuerySnapshot> getMessages() {
    return FirebaseFirestore.instance
        .collection('messages')
        .where('participants', arrayContains: "currentUserUid")
        .orderBy('timestamp', descending: true)
        .snapshots();
  }
  */

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bölge Bayi Portalı'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_none),
            onPressed: () {},
          ),
          const CircleAvatar(
            backgroundColor: AppTheme.primary,
            radius: 16,
            child: Text("EA", style: TextStyle(fontSize: 12, color: Colors.white)),
          ),
          const SizedBox(width: 16),
        ],
      ),
      body: Row(
        children: [
          // Sol Menü (Sidebar)
          Container(
            width: 250,
            color: AppTheme.surface,
            child: Column(
              children: [
                _buildMenuItem(Icons.inbox, "Gelen Kutusu", true),
                _buildMenuItem(Icons.send, "Gönderilenler", false),
                _buildMenuItem(Icons.star_border, "Önemli", false),
              ],
            ),
          ),
          // Ana İçerik (Gelen Kutusu Listesi)
          Expanded(
            child: Container(
              color: AppTheme.background,
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ElevatedButton.icon(
                    onPressed: () {
                      // Yeni Mesaj Yazma Ekranı (Compose Modal)
                    },
                    icon: const Icon(Icons.add),
                    label: const Text("Yeni Mesaj Oluştur"),
                  ),
                  const SizedBox(height: 20),
                  const Text("Gelen Kutusu", style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 10),
                  Expanded(
                    child: ListView.builder(
                      itemCount: 5,
                      itemBuilder: (context, index) {
                        return Card(
                          margin: const EdgeInsets.only(bottom: 10),
                          child: ListTile(
                            leading: const CircleAvatar(backgroundColor: AppTheme.accent, child: Text("B")),
                            title: Text("Bölge Yöneticisi $index"),
                            subtitle: const Text("Bu haftaki sevkiyat planlaması hakkında..."),
                            trailing: const Text("10:45"),
                            onTap: () {
                              // Mesaj Detayına Git (viewMessage)
                            },
                          ),
                        );
                      },
                    ),
                  )
                ],
              ),
            ),
          )
        ],
      ),
    );
  }

  Widget _buildMenuItem(IconData icon, String title, bool isSelected) {
    return Container(
      color: isSelected ? AppTheme.background : Colors.transparent,
      child: ListTile(
        leading: Icon(icon, color: isSelected ? AppTheme.primary : AppTheme.textMuted),
        title: Text(title, style: TextStyle(color: isSelected ? AppTheme.primary : AppTheme.textMuted)),
        shape: RoundedRectangleBorder(
          border: isSelected ? const BorderSide(color: AppTheme.primary, width: 3).copyWith(top: BorderSide.none, bottom: BorderSide.none, right: BorderSide.none) : BorderSide.none,
        ),
      ),
    );
  }
}
