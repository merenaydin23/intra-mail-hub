import 'dart:io';

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:file_picker/file_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:url_launcher/url_launcher.dart';

// [SUNUM NOTU]: Dashboard (Ana Ekran)
// Web uygulamasındaki (HTML/JS) inbox.js ve mesajlaşma yapısı ile
// birebir aynı Firestore veritabanı (backend) koleksiyonunu dinler.
// Web'den gönderilen bir mesajı buradaki StreamBuilder anında yakalar.

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final TextEditingController _msgController = TextEditingController();
  final user = FirebaseAuth.instance.currentUser;
  File? _attachedFile;
  String? _attachedFileName;
  bool _isUploadingFile = false;

  Future<void> _pickFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: [
          'pdf',
          'png',
          'jpg',
          'jpeg',
          'doc',
          'docx',
          'xls',
          'xlsx',
          'ppt',
          'pptx',
          'txt',
          'zip',
          'rar',
        ],
      );

      if (result != null && result.files.single.path != null) {
        setState(() {
          _attachedFile = File(result.files.single.path!);
          _attachedFileName = result.files.single.name;
        });
        _showSnack('Dosya seçildi: $_attachedFileName');
      }
    } catch (e) {
      _showSnack('Dosya seçme hatası: $e', isError: true);
    }
  }

  void _clearAttachment() {
    setState(() {
      _attachedFile = null;
      _attachedFileName = null;
    });
  }

  void _showSnack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.redAccent : const Color(0xFF00828A),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  // [SUNUM NOTU]: Mesaj Gönderme (Ortak Backend)
  // Web'deki inbox.js'de bulunan add() fonksiyonu ile aynı işlemi yapar.
  // İkisi de aynı 'messages' koleksiyonuna veri yazar.
  Future<void> _sendMessage() async {
    final text = _msgController.text.trim();
    if (text.isEmpty && _attachedFile == null) return;

    setState(() => _isUploadingFile = _attachedFile != null);

    String? attachmentUrl;
    if (_attachedFile != null) {
      final safeName = _attachedFileName ?? 'mobil_ek';
      final ref = FirebaseStorage.instance
          .ref()
          .child('messages')
          .child('${DateTime.now().millisecondsSinceEpoch}_$safeName');

      final uploadTask = await ref.putFile(_attachedFile!);
      attachmentUrl = await uploadTask.ref.getDownloadURL();
    }

    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(user?.uid)
        .get();
    final senderName = userDoc.data()?['name'] ?? 'Mobil Kullanıcı';

    await FirebaseFirestore.instance.collection('messages').add({
      'subject': 'Mobil Merkez',
      'content': text,
      'senderId': user?.uid,
      'senderName': senderName,
      'participants': [if (user?.uid != null) user!.uid],
      'timestamp': FieldValue.serverTimestamp(),
      'isDraft': false,
      'isRead': false,
      'readBy': [],
      'type': 'chat',
      if (attachmentUrl != null) 'attachmentUrl': attachmentUrl,
      if (_attachedFileName != null) 'attachmentName': _attachedFileName,
    });

    _msgController.clear();
    _clearAttachment();
    if (mounted) setState(() => _isUploadingFile = false);
    _showSnack('Mesaj gönderildi.');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F9F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 2,
        shadowColor: Color(0xFFE0ECEC),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: const Color(0xFF00828A).withOpacity(0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.hub_rounded,
                  color: Color(0xFF00828A), size: 20),
            ),
            const SizedBox(width: 12),
            const Text("Bellona Hub",
                style: TextStyle(
                    color: Color(0xFF0C2D30),
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    letterSpacing: 0.5)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.power_settings_new_rounded,
                color: Colors.redAccent),
            tooltip: "Çıkış Yap",
            onPressed: () => FirebaseAuth.instance.signOut(),
          )
        ],
      ),
      body: StreamBuilder<DocumentSnapshot>(
        stream: FirebaseFirestore.instance
            .collection('users')
            .doc(user?.uid)
            .snapshots(),
        builder: (context, snapshot) {
          if (!snapshot.hasData)
            return const Center(
                child: CircularProgressIndicator(color: Color(0xFF00828A)));

          final userData = snapshot.data?.data() as Map<String, dynamic>?;
          final userName = userData?['name'] ?? 'Kullanıcı';
          final userRole = userData?['role'] ?? 'Bilinmiyor';

          // [SUNUM NOTU]: ADMIN GİRİŞ KONTROLÜ (Tüm Ekranı Kaplar)
          // Admin kullanıcısının sadece WEB üzerinden panele girmesi istendiği için,
          // mobilde role == 'admin' kontrolü yapılır ve giriş engellenir.
          if (userRole == 'admin') {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32.0),
                child: Container(
                  padding: const EdgeInsets.all(32.0),
                  decoration: BoxDecoration(
                      color: const Color(0xFF161616),
                      borderRadius: BorderRadius.circular(32),
                      border: Border.all(
                          color: Colors.redAccent.withOpacity(0.3), width: 2),
                      boxShadow: [
                        BoxShadow(
                            color: Colors.redAccent.withOpacity(0.1),
                            blurRadius: 40,
                            spreadRadius: 10),
                      ]),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                            color: Colors.redAccent.withOpacity(0.1),
                            shape: BoxShape.circle),
                        child: const Icon(Icons.shield_outlined,
                            color: Colors.redAccent, size: 64),
                      ),
                      const SizedBox(height: 24),
                      const Text("Erişim Reddedildi",
                          style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                              letterSpacing: 1.2)),
                      const SizedBox(height: 16),
                      const Text(
                        "Yönetici hesapları mobil portala giriş yapamaz. Lütfen tüm yönetim işlemleriniz için web portalını (masaüstü) kullanın.",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 14, color: Colors.white60, height: 1.6),
                      ),
                      const SizedBox(height: 32),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.redAccent,
                          foregroundColor: Colors.white,
                          minimumSize: const Size(double.infinity, 50),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16)),
                        ),
                        icon: const Icon(Icons.logout),
                        label: const Text("Oturumu Kapat",
                            style: TextStyle(
                                fontWeight: FontWeight.bold, fontSize: 16)),
                        onPressed: () => FirebaseAuth.instance.signOut(),
                      )
                    ],
                  ),
                ),
              ),
            );
          }

          // KULLANICI ROLÜNE GÖRE PORTAL İSMİ BELİRLEME
          String portalName = "Bellona Hub";
          if (userRole == 'factory')
            portalName = "Fabrika Portalı";
          else if (userRole == 'regional')
            portalName = "Bölge Portalı";
          else if (userRole == 'local')
            portalName = "Yerel Bayi Portalı";
          else if (userRole == 'employee') portalName = "Çalışan Portalı";

          // [SUNUM NOTU]: NORMAL KULLANICI ARAYÜZÜ (Web'in Premium Tasarımı)
          // Admin harici normal kullanıcılar web arayüzünün mobil karşılığını kullanabilir.
          return Column(
            children: [
              // Premium Kullanıcı Başlığı
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Colors.white, Color(0xFFF3F4F6)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                  border: Border(bottom: BorderSide(color: Color(0xFFE0ECEC))),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: const Color(0xFF00828A).withOpacity(0.2),
                      child: Text(
                        userName.isNotEmpty ? userName[0].toUpperCase() : 'U',
                        style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF00828A)),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(portalName.toUpperCase(),
                              style: TextStyle(
                                  color: Color(0xFF5C7B7D),
                                  fontSize: 11,
                                  letterSpacing: 1.5,
                                  fontWeight: FontWeight.w800)),
                          const SizedBox(height: 4),
                          Text(userName,
                              style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w900,
                                  color: Color(0xFF0C2D30),
                                  letterSpacing: 0.5)),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                                color: const Color(0xFF00828A).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                    color: const Color(0xFF00828A)
                                        .withOpacity(0.3))),
                            child: Text(userRole.toUpperCase(),
                                style: const TextStyle(
                                    color: Color(0xFF00828A),
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 1.0)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // Anlık Mesajlar Listesi (Canlı Senkronize)
              Expanded(
                child: StreamBuilder<QuerySnapshot>(
                  stream: FirebaseFirestore.instance
                      .collection('messages')
                      .orderBy('timestamp', descending: true)
                      .limit(30)
                      .snapshots(),
                  builder: (context, msgSnapshot) {
                    if (!msgSnapshot.hasData)
                      return const Center(
                          child: CircularProgressIndicator(
                              color: Color(0xFF00828A)));

                    final allDocs = msgSnapshot.data!.docs;
                    final messages = allDocs.where((doc) {
                      final data = doc.data() as Map<String, dynamic>;
                      return data['isDraft'] != true;
                    }).toList();

                    if (messages.isEmpty)
                      return const Center(
                          child: Text("Burası çok sessiz...",
                              style: TextStyle(color: Color(0x995C7B7D))));

                    return ListView.builder(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 24),
                      reverse: true, // En yeni mesaj en altta
                      itemCount: messages.length,
                      itemBuilder: (context, index) {
                        var msg =
                            messages[index].data() as Map<String, dynamic>;
                        bool isMe = msg['senderId'] == user?.uid;

                        return Align(
                          alignment: isMe
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 16),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 14),
                            constraints: BoxConstraints(
                                maxWidth:
                                    MediaQuery.of(context).size.width * 0.8),
                            decoration: BoxDecoration(
                              color: isMe
                                  ? const Color(0xFF00828A).withOpacity(0.15)
                                  : Colors.white,
                              borderRadius: BorderRadius.circular(20).copyWith(
                                bottomRight: isMe
                                    ? const Radius.circular(4)
                                    : const Radius.circular(20),
                                bottomLeft: !isMe
                                    ? const Radius.circular(4)
                                    : const Radius.circular(20),
                              ),
                              border: Border.all(
                                  color: isMe
                                      ? const Color(0xFF00828A).withOpacity(0.4)
                                      : Color(0xFFE0ECEC)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                        isMe
                                            ? Icons.person
                                            : Icons.support_agent_rounded,
                                        size: 14,
                                        color: isMe
                                            ? const Color(0xFF00828A)
                                            : Color(0xFF5C7B7D)),
                                    const SizedBox(width: 6),
                                    Text(msg['senderName'] ?? 'Bilinmiyor',
                                        style: TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w800,
                                            color: isMe
                                                ? const Color(0xFF00828A)
                                                : Color(0xFF5C7B7D))),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(msg['content'] ?? msg['body'] ?? '',
                                    style: const TextStyle(
                                        color: Color(0xFF0C2D30),
                                        fontSize: 15,
                                        height: 1.4)),
                                if (msg['attachmentUrl'] != null) ...[
                                  const SizedBox(height: 8),
                                  InkWell(
                                    onTap: () async {
                                      final urlStr = msg['attachmentUrl'];
                                      if (urlStr != null) {
                                        final uri = Uri.parse(urlStr);
                                        try {
                                          if (await canLaunchUrl(uri)) {
                                            await launchUrl(uri,
                                                mode: LaunchMode
                                                    .externalApplication);
                                          } else {
                                            ScaffoldMessenger.of(context)
                                                .showSnackBar(
                                              const SnackBar(
                                                  content: Text(
                                                      'Dosya açılamadı (Geçersiz URL)')),
                                            );
                                          }
                                        } catch (e) {
                                          ScaffoldMessenger.of(context)
                                              .showSnackBar(
                                            SnackBar(content: Text('Hata: $e')),
                                          );
                                        }
                                      }
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 12, vertical: 8),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF00828A)
                                            .withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Icon(Icons.picture_as_pdf,
                                              size: 16,
                                              color: Color(0xFF00828A)),
                                          const SizedBox(width: 8),
                                          Flexible(
                                              child: Text(
                                                  msg['attachmentName'] ??
                                                      'Ekli Dosya',
                                                  style: const TextStyle(
                                                      color: Color(0xFF00828A),
                                                      fontSize: 12,
                                                      fontWeight:
                                                          FontWeight.bold),
                                                  overflow:
                                                      TextOverflow.ellipsis)),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 6),
                                Align(
                                  alignment: Alignment.bottomRight,
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        msg['timestamp'] != null
                                            ? "${(msg['timestamp'] as Timestamp).toDate().hour.toString().padLeft(2, '0')}:${(msg['timestamp'] as Timestamp).toDate().minute.toString().padLeft(2, '0')}"
                                            : "",
                                        style: const TextStyle(
                                            fontSize: 10,
                                            color: Colors.black45),
                                      ),
                                      if (isMe) ...[
                                        const SizedBox(width: 4),
                                        Icon(
                                          (msg['isRead'] ?? false)
                                              ? Icons.done_all
                                              : Icons.check,
                                          size: 14,
                                          color: (msg['isRead'] ?? false)
                                              ? const Color(0xFF00828A)
                                              : Colors.black45,
                                        ),
                                      ]
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),

              // Mesaj Gönderme Kutusu (Glassmorphism Effect)
              Container(
                padding: const EdgeInsets.only(
                    left: 16, right: 16, bottom: 24, top: 16),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: Color(0xFFE0ECEC))),
                ),
                child: Row(
                  children: [
                    Container(
                      margin: const EdgeInsets.only(right: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF00828A).withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: IconButton(
                        icon: Icon(
                          _attachedFileName == null
                              ? Icons.attach_file
                              : Icons.close_rounded,
                          color: const Color(0xFF00828A),
                        ),
                        tooltip: _attachedFileName == null
                            ? 'Dosya ekle'
                            : 'Eki kaldır',
                        onPressed: _isUploadingFile
                            ? null
                            : (_attachedFileName == null
                                ? _pickFile
                                : _clearAttachment),
                      ),
                    ),
                    Expanded(
                      child: TextField(
                        controller: _msgController,
                        style: const TextStyle(color: Color(0xFF0C2D30)),
                        decoration: InputDecoration(
                          hintText: "Hub Merkezine mesaj gönder...",
                          hintStyle: const TextStyle(
                              color: Color(0x995C7B7D), fontSize: 14),
                          filled: true,
                          fillColor: const Color(0xFFF3F4F6),
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide.none),
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 20, vertical: 16),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Container(
                      decoration: BoxDecoration(
                          gradient: const LinearGradient(
                              colors: [Color(0xFF00828A), Color(0xFF006B72)]),
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                                color: const Color(0xFF00828A).withOpacity(0.3),
                                blurRadius: 12,
                                offset: const Offset(0, 4)),
                          ]),
                      child: CircleAvatar(
                        radius: 26,
                        backgroundColor: Colors.transparent,
                        child: IconButton(
                          icon: const Icon(Icons.send_rounded,
                              color: Colors.white, size: 20),
                          onPressed: _isUploadingFile ? null : _sendMessage,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
