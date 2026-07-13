import 'dart:io';

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:file_picker/file_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:intra_mobil/core/backend/ai_service.dart';
import 'package:url_launcher/url_launcher.dart';
import 'compose_screen.dart';
import 'package:open_filex/open_filex.dart';
import 'dart:async';
import 'dart:convert';


/// Mobil Gelen Kutusu (Inbox) Ekranı
/// 
/// Web portalındaki `inbox.js` ile aynı Firestore `messages` koleksiyonunu dinler.
/// Gelen Kutusu, Gönderilenler, Taslaklar, Yıldızlı, Arşiv ve Çöp Kutusu 
/// klasörleri web ile %100 senkronize çalışır.
class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  /// Seçili klasör durumu (inbox, sent, drafts, important, archive, trash)
  /// Web'deki `currentFolderName` değişkeni ile aynı mantıkta çalışır.
  String _currentFolder = 'inbox';
  
  /// Kullanıcının arama çubuğuna girdiği metin
  String _searchQuery = '';
  
  /// Eğer bir mesaj seçildiyse onun ID'si (Detay görünümü için)
  String? _selectedMsgId;
  
  /// Oturum açmış olan mevcut Firebase kullanıcısı
  final user = FirebaseAuth.instance.currentUser;
  
  /// Arama çubuğu kontrolcüsü
  final TextEditingController _searchCtrl = TextEditingController();

  /// Kullanıcı karşılama adı (AppBar'da Merhaba yazısı için)
  String _userName = '';

  // ── AI (Yapay Zeka) ve Yanıt Durumları ──
  
  /// Mesaj ID'sine göre önbelleğe alınmış AI yanıt önerileri
  final Map<String, List<String>> _suggestionsCache = {};
  
  /// Mesaj ID'sine göre önbelleğe alınmış detaylı taslaklar
  final Map<String, List<String>> _draftsCache = {};
  
  /// AI önerilerinin UI'da gizlenip gizlenmediğini tutar
  final Map<String, bool> _hideSuggestions = {};
  
  /// Bir mesaj için AI yanıt önerilerinin yüklenme durumu
  final Map<String, bool> _loadingAI = {};
  
  /// Mesaj ID'sine göre oluşturulmuş iplik (thread) özetleri
  final Map<String, String> _summaryCache = {};
  
  /// Bir mesaj için özetin yüklenme durumu
  final Map<String, bool> _loadingSummary = {};
  
  /// Özet panelinin açık olup olmadığını tutar
  final Map<String, bool> _showSummary = {};
  
  /// Hızlı yanıt yazma alanı için metin kontrolcüsü
  final TextEditingController _replyCtrl = TextEditingController();
  
  /// AI ile metni profesyonelleştirme işlemi sırasında true olur
  bool _isRefining = false;
  
  /// Yanıta eklenecek dosya
  File? _replyFile;
  
  /// Yanıta eklenecek dosyanın adı
  String? _replyFileName;
  
  /// Yanıt gönderilirken true olur (buton yükleniyor animasyonu için)
  bool _isSendingReply = false;
  
  /// Toplu alıcı seçim alanının genişletilmiş (açık) olup olmadığı
  bool _isBulkSelectorExpanded = true;

  /// Kullanıcı profil resmi URL'si
  String? _profileImageUrl;

  /// Kullanıcı dokümanı dinleyicisi
  StreamSubscription<DocumentSnapshot>? _userSub;

  @override
  void initState() {
    super.initState();
    _listenToUserDoc();
  }

  @override
  void dispose() {
    _userSub?.cancel();
    super.dispose();
  }

  void _listenToUserDoc() {
    try {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid == null) return;
      _userSub = FirebaseFirestore.instance.collection('users').doc(uid).snapshots().listen((doc) {
        if (doc.exists && mounted) {
          final data = doc.data()!;
          final name = (data['name'] ?? '').toString().trim();
          final profileUrl = data['profileImageUrl'] as String?;
          setState(() {
            if (name.isNotEmpty) _userName = name;
            _profileImageUrl = (profileUrl != null && profileUrl.isNotEmpty) ? profileUrl : null;
          });
        }
      });
    } catch (_) {}
  }

  /// Galeriden resim seçip Firebase Storage'a profil resmi olarak yükler
  Future<void> _pickAndUploadProfileImage() async {
    try {
      // 1. Resim seçimi
      final result = await FilePicker.platform.pickFiles(
        type: FileType.image,
        withData: true,
      );
      
      if (result == null || result.files.isEmpty) return;
      
      final fileBytes = result.files.first.bytes;
      if (fileBytes == null) return;

      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid == null) return;

      // 2. Yükleme
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profil resmi yükleniyor...')),
      );

      final ref = FirebaseStorage.instance
          .ref()
          .child('profile_images')
          .child('${uid}_${DateTime.now().millisecondsSinceEpoch}');
          
      final uploadTask = await ref.putData(fileBytes);
      final downloadUrl = await uploadTask.ref.getDownloadURL();

      // 3. Firestore güncelleme
      await FirebaseFirestore.instance.collection('users').doc(uid).update({
        'profileImageUrl': downloadUrl,
      });

      setState(() {
        _profileImageUrl = downloadUrl;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profil resminiz güncellendi!')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Hata oluştu: $e')),
        );
      }
    }
  }

  /// İlgili mesaj için Google Gemini AI API'sini çağırarak kısa yanıt önerileri
  /// ve detaylı taslaklar oluşturur. Sonuçları belleğe (cache) kaydeder.
  void _loadAISuggestions(String msgId, Map<String, dynamic> data) async {
    if (_suggestionsCache.containsKey(msgId) || _loadingAI[msgId] == true)
      return;

    var lastAuthorId = data['senderId'];
    final List<dynamic> replies = data['replies'] ?? [];
    if (replies.isNotEmpty) {
      lastAuthorId = replies.last['authorId'];
    }
    if (lastAuthorId == user?.uid) return;

    setState(() {
      _loadingAI[msgId] = true;
    });

    try {
      final results = await Future.wait([
        AIService.getReplySuggestionsWithAI(
          subject: data['subject'] ?? '',
          senderName: data['senderName'] ?? '',
          receiverName: data['receiverName'] ?? '',
          content: data['content'] ?? data['body'] ?? '',
          replies: replies,
        ),
        AIService.getDetailedReplyDraftsWithAI(
          subject: data['subject'] ?? '',
          senderName: data['senderName'] ?? '',
          receiverName: data['receiverName'] ?? '',
          content: data['content'] ?? data['body'] ?? '',
          replies: replies,
        ),
      ]);

      setState(() {
        _suggestionsCache[msgId] = results[0];
        _draftsCache[msgId] = results[1];
        _loadingAI[msgId] = false;
      });
    } catch (e) {
      setState(() {
        _loadingAI[msgId] = false;
      });
    }
  }
  /// Uzun mesajlaşma geçmişini (Thread) analiz edip özet çıkaran AI fonksiyonu.
  void _toggleAISummary(String msgId, Map<String, dynamic> data, List<dynamic> replies) async {
    if (_showSummary[msgId] == true) {
      setState(() {
        _showSummary[msgId] = false;
      });
      return;
    }

    setState(() {
      _showSummary[msgId] = true;
    });

    if (_summaryCache.containsKey(msgId)) return;

    setState(() {
      _loadingSummary[msgId] = true;
    });

    try {
      final summary = await AIService.summarizeThreadWithAI(
        subject: data['subject'] ?? '',
        senderName: data['senderName'] ?? '',
        receiverName: data['receiverName'] ?? '',
        content: data['content'] ?? data['body'] ?? '',
        replies: replies,
      );

      setState(() {
        _summaryCache[msgId] = summary;
        _loadingSummary[msgId] = false;
      });
    } catch (e) {
      setState(() {
        _loadingSummary[msgId] = false;
        _summaryCache[msgId] = "Özet oluşturulurken bir hata oluştu: $e";
      });
    }
  }
  /// Gelen bir eklentiyi (dosya, resim vb.) açar.
  /// Base64 ise geçici dosyaya yazar ve cihazdaki varsayılan uygulama (OpenFilex) ile açar.
  /// URL ise doğrudan tarayıcıda/harici uygulamada açar.
  Future<void> _openAttachment(String urlStr, String attachName) async {
    try {
      if (urlStr.startsWith('data:')) {
        final parts = urlStr.split(',');
        if (parts.length > 1) {
          final base64Str = parts[1];
          final bytes = base64Decode(base64Str.trim());
          final tempDir = Directory.systemTemp;
          final tempFile = File('${tempDir.path}/$attachName');
          await tempFile.writeAsBytes(bytes);
          await OpenFilex.open(tempFile.path);
        } else {
          throw 'Geçersiz veri biçimi.';
        }
      } else {
        final uri = Uri.parse(urlStr);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        } else {
          await launchUrl(uri, mode: LaunchMode.platformDefault);
        }
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Dosya açılamadı: $e')),
      );
    }
  }



  // Login ekranı ile aynı renk paleti
  static const Color primary = Color(0xFF00A4AD);
  static const Color primaryHover = Color(0xFF006B72);
  static const Color primarySoft = Color(0xFFEAF7F7);
  static const Color bgApp = Color(0xFFF1F5F9);
  static const Color surface = Colors.white;
  static const Color textMain = Color(0xFF0C2D30);
  static const Color textMuted = Color(0xFF5C7B7D);
  static const Color border = Color(0xFFE0ECEC);
  static const Color gradStart = Color(0xFF004D52);
  static const Color gradEnd = Color(0xFF00828A);
  static const Color accentGold = Color(0xFFEAB308);

  // ── Veritabanı Sorguları ──
  
  /// Seçili klasöre (`_currentFolder`) göre Firebase mesajlar sorgusunu oluşturur.
  /// Not: Web'deki `inbox.js` -> `loadMessages()` ile aynı mantıktadır.
  Query<Map<String, dynamic>> _buildQuery(String uid) {
    return FirebaseFirestore.instance
        .collection('messages')
        .where('participants', arrayContains: uid);
  }

  // Klasör başlıkları — web'deki currentFolderName ile aynı
  String get _folderTitle {
    const titles = {
      'inbox': 'Gelen Kutusu',
      'sent': 'Gönderilenler',
      'drafts': 'Taslaklar',
      'important': 'Yıldızlı',
      'archive': 'Arşiv',
      'trash': 'Çöp Kutusu',
    };
    return titles[_currentFolder] ?? 'Gelen Kutusu';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: bgApp,
      appBar: _selectedMsgId != null
          ? null
          : AppBar(
              backgroundColor: Colors.transparent,
              elevation: 0,
              flexibleSpace: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [gradStart, gradEnd],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
                ),
              ),
              title: Row(children: [
                // Kullanıcı Avatar Rozeti
                GestureDetector(
                  onTap: _pickAndUploadProfileImage,
                  child: Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withOpacity(0.25), width: 1),
                    ),
                    child: _profileImageUrl != null
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(11),
                            child: _profileImageUrl!.startsWith('data:')
                                ? Image.memory(
                                    base64Decode(_profileImageUrl!.split(',').last),
                                    fit: BoxFit.cover,
                                  )
                                : Image.network(
                                    _profileImageUrl!,
                                    fit: BoxFit.cover,
                                  ),
                          )
                        : Center(
                            child: Text(
                              _userName.isNotEmpty ? _userName[0].toUpperCase() : '?',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 16,
                              ),
                            ),
                          ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    _userName.isNotEmpty ? 'Merhaba, $_userName 👋' : 'Merhaba 👋',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      letterSpacing: 0.2,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ]),
              iconTheme: const IconThemeData(color: Colors.white),
              actions: [
                IconButton(
                  icon: const Icon(Icons.logout_rounded, color: Color(0xFFFCA5A5)),
                  tooltip: 'Çıkış Yap',
                  onPressed: () => _confirmLogout(context),
                ),
              ],
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(68),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
                  child: Container(
                    decoration: BoxDecoration(
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.025),
                          blurRadius: 15,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: TextField(
                      controller: _searchCtrl,
                      onChanged: (v) => setState(() => _searchQuery = v.toLowerCase()),
                      style: const TextStyle(color: textMain, fontSize: 14),
                      decoration: InputDecoration(
                        hintText: 'Mesajlarda ara...',
                        hintStyle: const TextStyle(color: textMuted, fontSize: 14),
                        prefixIcon: const Icon(Icons.search_rounded,
                            color: textMuted, size: 20),
                        filled: true,
                        fillColor: surface,
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: border)),
                        enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: border)),
                        focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: primary, width: 1.5)),
                        contentPadding: const EdgeInsets.symmetric(vertical: 0),
                      ),
                    ),
                  ),
                ),
              ),
            ),
      floatingActionButton: _selectedMsgId != null
          ? null
          : Padding(
              padding: const EdgeInsets.only(bottom: 16.0),
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(
                      color: primary.withOpacity(0.06),
                      blurRadius: 16,
                      spreadRadius: 2,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: FloatingActionButton.extended(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => ComposeScreen()),
                  ),
                  backgroundColor: primary,
                  elevation: 0,
                  highlightElevation: 0,
                  hoverElevation: 0,
                  focusElevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                    side: BorderSide(color: Colors.white.withOpacity(0.15), width: 1),
                  ),
                  icon: const Icon(Icons.edit_rounded, color: Colors.white, size: 20),
                  label: const Text(
                    'Yeni Mesaj',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ),
            ),
      body: Column(
        children: [
          if (_selectedMsgId == null) ...[
            // ── Yatay klasör tab bar — web sidebar'daki klasörler —
            Container(
              color: surface,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(
                  children: [
                    _folderTab('inbox', Icons.inbox_rounded, 'Gelen'),
                    _folderTab('sent', Icons.send_rounded, 'Giden'),
                    _folderTab('drafts', Icons.edit_note_rounded, 'Taslak'),
                    _folderTab('important', Icons.star_rounded, 'Yıldızlı'),
                    _folderTab('archive', Icons.inventory_2_rounded, 'Arşiv'),
                    _folderTab('trash', Icons.delete_outline_rounded, 'Çöp'),
                  ],
                ),
              ),
            ),
            Divider(height: 1, color: border),
          ],

          // ── Mesaj listesi —
          Expanded(
            child: StreamBuilder<User?>(
              stream: FirebaseAuth.instance.authStateChanges(),
              builder: (ctx, authSnap) {
                final uid = authSnap.data?.uid;
                if (uid == null) return const SizedBox();

                 return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                  stream: _buildQuery(uid).snapshots(),
                  builder: (ctx2, snap) {
                    if (snap.hasError) {
                      return Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24.0),
                          child: Text(
                            'Hata oluştu: ${snap.error}',
                            style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      );
                    }

                    if (!snap.hasData) {
                      return const Center(
                          child: CircularProgressIndicator(color: primary));
                    }

                    final docs = snap.data!.docs.where((d) {
                      final data = d.data();
                      final trashedBy = List<String>.from(data['trashedBy'] ?? []);
                      final archivedBy = List<String>.from(data['archivedBy'] ?? []);
                      final importantBy = List<String>.from(data['importantBy'] ?? []);
                      final starredBy = List<String>.from(data['starredBy'] ?? []);
                      final isDraft = data['isDraft'] == true;
                      final status = data['status'] ?? '';
                      final senderId = data['senderId'] ?? '';
                      final replies = List<dynamic>.from(data['replies'] ?? []);

                      // Trash folder
                      if (_currentFolder == 'trash') {
                        return trashedBy.contains(uid);
                      }

                      // Archive folder
                      if (_currentFolder == 'archive') {
                        return archivedBy.contains(uid) && !trashedBy.contains(uid);
                      }

                      // Drafts folder
                      if (_currentFolder == 'drafts') {
                        return isDraft && senderId == uid && !trashedBy.contains(uid);
                      }

                      // Active folders (inbox, sent, important)
                      // Exclude trashed, archived, and drafts globally from active folders
                      if (trashedBy.contains(uid)) return false;
                      if (archivedBy.contains(uid)) return false;
                      if (isDraft) return false;
                      if (status == 'trash' || status == 'archive' || status == 'spam') return false;

                      if (_currentFolder == 'important') {
                        return starredBy.contains(uid) || importantBy.contains(uid);
                      } else if (_currentFolder == 'inbox') {
                        // Hide sent messages that do not have replies yet from Inbox
                        if (senderId == uid) {
                          return replies.isNotEmpty;
                        }
                        return true;
                      } else if (_currentFolder == 'sent') {
                        final isOriginalSender = senderId == uid;
                        final hasMyReply = replies.any((r) => r['authorId'] == uid);
                        return isOriginalSender || hasMyReply;
                      }

                      return true;
                    }).where((d) {
                      if (_searchQuery.isEmpty) return true;
                      final data = d.data();
                      final subject =
                          (data['subject'] ?? '').toString().toLowerCase();
                      final sender =
                          (data['senderName'] ?? '').toString().toLowerCase();
                      final content = (data['content'] ?? data['body'] ?? '')
                          .toString()
                          .toLowerCase();
                      return subject.contains(_searchQuery) ||
                          sender.contains(_searchQuery) ||
                          content.contains(_searchQuery);
                    }).toList();

                    // Sort in memory to avoid composite index requirements
                    final sortedDocs = docs.toList();
                    sortedDocs.sort((a, b) {
                      final dataA = a.data();
                      final dataB = b.data();
                      
                      final isUrgentA = dataA['isUrgent'] == true ? 1 : 0;
                      final isUrgentB = dataB['isUrgent'] == true ? 1 : 0;
                      
                      if (isUrgentA != isUrgentB) {
                        return isUrgentB.compareTo(isUrgentA);
                      }
                      
                      final tA = dataA['timestamp'] as Timestamp?;
                      final tB = dataB['timestamp'] as Timestamp?;
                      
                      final timeA = tA?.millisecondsSinceEpoch ?? 0;
                      final timeB = tB?.millisecondsSinceEpoch ?? 0;
                      
                      return timeB.compareTo(timeA);
                    });

                    // Toplu gönderimleri tek kutucukta birleştirme (Web inbox.js ile birebir uyumlu)
                    final List<MessageGroup> finalGroups = [];
                    final Map<String, List<QueryDocumentSnapshot<Map<String, dynamic>>>> bulkGroups = {};

                    for (final docSnap in sortedDocs) {
                      final m = docSnap.data();
                      final isSentFolder = _currentFolder == 'sent';
                      final isBulk = m['isBulk'] == true;
                      final participants = m['participants'] as List?;
                      final hasNoThreadId = m['threadId'] == null;
                      
                      if (isSentFolder && hasNoThreadId && isBulk && participants != null && participants.length == 2) {
                        final Timestamp? ts = m['timestamp'] as Timestamp?;
                        final minuteKey = ts != null ? (ts.seconds ~/ 60) : 0;
                        final groupKey = "${m['senderId']}_${m['subject']}_$minuteKey";
                        
                        if (!bulkGroups.containsKey(groupKey)) {
                          bulkGroups[groupKey] = [];
                        }
                        bulkGroups[groupKey]!.add(docSnap);
                      } else {
                        finalGroups.add(MessageGroup(primaryDoc: docSnap, groupMembers: [docSnap]));
                      }
                    }

                    if (_currentFolder == 'sent') {
                      bulkGroups.forEach((key, group) {
                        if (group.length > 1) {
                          finalGroups.add(MessageGroup(primaryDoc: group[0], groupMembers: group));
                        } else if (group.length == 1) {
                          finalGroups.add(MessageGroup(primaryDoc: group[0], groupMembers: [group[0]]));
                        }
                      });
                      
                      // Yeniden tarihe göre sırala
                      finalGroups.sort((a, b) {
                        final tA = a.primaryDoc.data()['timestamp'] as Timestamp?;
                        final tB = b.primaryDoc.data()['timestamp'] as Timestamp?;
                        final timeA = tA?.millisecondsSinceEpoch ?? 0;
                        final timeB = tB?.millisecondsSinceEpoch ?? 0;
                        return timeB.compareTo(timeA);
                      });
                    }

                    if (finalGroups.isEmpty) return _emptyState();

                    if (_selectedMsgId != null) {
                      QueryDocumentSnapshot<Map<String, dynamic>>? selectedDoc;
                      MessageGroup? selectedGroup;
                      
                      for (final g in finalGroups) {
                        for (final member in g.groupMembers) {
                          if (member.id == _selectedMsgId) {
                            selectedDoc = member;
                            selectedGroup = g;
                            break;
                          }
                        }
                        if (selectedDoc != null) break;
                      }

                      if (selectedDoc == null && finalGroups.isNotEmpty) {
                        WidgetsBinding.instance.addPostFrameCallback((_) {
                          if (mounted) setState(() => _selectedMsgId = null);
                        });
                        selectedDoc = finalGroups.first.primaryDoc;
                        selectedGroup = finalGroups.first;
                      }

                      if (selectedDoc != null && selectedGroup != null) {
                        return _buildDetail(selectedDoc, uid, selectedGroup);
                      }
                    }

                    return ListView.builder(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      itemCount: finalGroups.length,
                      itemBuilder: (_, i) => _buildMsgItem(finalGroups[i], uid),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  // --- MESAJ LİSTESİ KARTI — web .msg-item ile aynı stil ---
  Widget _buildMsgItem(MessageGroup group, String uid) {
    final doc = group.primaryDoc;
    final data = doc.data();
    final subject = data['subject'] ?? 'Konusuz';
    final content = data['content'] ?? data['body'] ?? '';
    final isMe = data['senderId'] == uid;
    final isDraft = data['isDraft'] == true;
    final hasAttach = data['attachmentUrl'] != null;
    final isBulkGroup = group.isBulkGroup;
    final isUrgent = data['isUrgent'] == true;

    // Eğer toplu grup ise, tüm alıcılar okuduğunda double check okundu görünür
    final isRead = isBulkGroup
        ? group.groupMembers.every((member) => (member.data()['readBy'] ?? []).contains(uid))
        : (data['readBy'] ?? []).contains(uid);

    final isDeliveredRead = isBulkGroup
        ? group.groupMembers.every((member) => member.data()['isRead'] == true)
        : data['isRead'] == true;

    String senderNameDisplay = "";
    if (isDraft) {
      senderNameDisplay = 'Taslak';
    } else if (_currentFolder == 'sent' || isMe) {
      senderNameDisplay = isBulkGroup
          ? 'Kime: Toplu Gönderim (${group.groupMembers.length} Kişi)'
          : 'Kime: ${data['receiverName'] ?? 'Bilinmiyor'}';
    } else {
      senderNameDisplay = 'Kimden: ${data['senderName'] ?? 'Bilinmiyor'}';
    }

    DateTime? time;
    if (data['timestamp'] != null) {
      time = (data['timestamp'] as Timestamp).toDate();
    }

    return GestureDetector(
      onTap: () {
        setState(() => _selectedMsgId = doc.id);
        if (!isRead) {
          FirebaseFirestore.instance.collection('messages').doc(doc.id).update({
            'readBy': FieldValue.arrayUnion([uid]),
            'isRead': true,
            'readAt': FieldValue.serverTimestamp(),
          }).catchError((_) {});
        }
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isUrgent ? const Color(0xFFFEF2F2) : surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: _selectedMsgId == doc.id
                  ? primary
                  : (isUrgent ? Colors.red.withOpacity(0.5) : (isRead ? border : primary.withOpacity(0.3))),
              width: _selectedMsgId == doc.id ? 2 : 1),
          boxShadow: [
            BoxShadow(
                color: primary.withOpacity(0.04),
                blurRadius: 8,
                offset: const Offset(0, 2))
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Avatar
            CircleAvatar(
              radius: 22,
              backgroundColor: isMe ? primary.withOpacity(0.15) : primarySoft,
              child: Text(
                isBulkGroup
                    ? '👥'
                    : (senderNameDisplay.isNotEmpty ? senderNameDisplay[0].toUpperCase() : '?'),
                style: TextStyle(
                    color: isMe ? primary : primaryHover,
                    fontWeight: FontWeight.w800,
                    fontSize: isBulkGroup ? 14 : 16),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            if (isUrgent)
                              const Padding(
                                padding: EdgeInsets.only(right: 6.0),
                                child: Icon(Icons.bolt_rounded, color: Colors.red, size: 18),
                              ),
                            Expanded(
                              child: Text(
                                isDraft ? '📝 $subject' : senderNameDisplay,
                                style: TextStyle(
                                  fontWeight:
                                      isRead ? FontWeight.w600 : FontWeight.w900,
                                  fontSize: 14,
                                  color: textMain,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (time != null)
                        Text(
                          _formatTime(time),
                          style:
                              const TextStyle(fontSize: 11, color: textMuted),
                        ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subject,
                    style: TextStyle(
                      fontWeight: isRead ? FontWeight.w400 : FontWeight.w700,
                      fontSize: 13,
                      color: isRead ? textMuted : textMain,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          content,
                          style: const TextStyle(
                              fontSize: 12, color: textMuted, height: 1.3),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (hasAttach) ...[
                        const SizedBox(width: 6),
                        const Icon(Icons.attach_file,
                            size: 14, color: textMuted),
                      ],
                      if (isMe && !isDraft) ...[
                        const SizedBox(width: 6),
                        Icon(
                          isDeliveredRead
                              ? Icons.done_all_rounded
                              : Icons.check_rounded,
                          size: 15,
                          color: isDeliveredRead
                              ? primary
                              : textMuted.withOpacity(0.6),
                        ),
                      ],
                      if (!isMe && !isRead) ...[
                        const SizedBox(width: 6),
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                              color: primary, shape: BoxShape.circle),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // --- MESAJ DETAY — web .message-content ile aynı ---
  // Web'deki btnImportant ile tam senkron: her iki alan birlikte güncellenir.
  Future<void> _toggleStar(String docId, bool isStarred, String uid) async {
    await FirebaseFirestore.instance.collection('messages').doc(docId).update({
      // importantBy → web portal ile tam uyumlu
      'importantBy': isStarred
          ? FieldValue.arrayRemove([uid])
          : FieldValue.arrayUnion([uid]),
      // starredBy → eski mobil kayıtlarla geriye dönük uyumluluk
      'starredBy': isStarred
          ? FieldValue.arrayRemove([uid])
          : FieldValue.arrayUnion([uid]),
    });
  }

  Future<void> _toggleArchive(String docId, bool isArchived, String uid) async {
    await FirebaseFirestore.instance.collection('messages').doc(docId).update({
      'archivedBy': isArchived
          ? FieldValue.arrayRemove([uid])
          : FieldValue.arrayUnion([uid]),
    });
    setState(() => _selectedMsgId = null);
  }

  Future<void> _toggleTrash(String docId, bool isTrashed, String uid) async {
    final update = isTrashed
        ? {
            'trashedBy': FieldValue.arrayRemove([uid])
          }
        : {
            'trashedBy': FieldValue.arrayUnion([uid]),
            'deletedAt': FieldValue.serverTimestamp(),
          };
    await FirebaseFirestore.instance
        .collection('messages')
        .doc(docId)
        .update(update);
    setState(() => _selectedMsgId = null);
  }

  Future<void> _deleteForever(String docId) async {
    await FirebaseFirestore.instance.collection('messages').doc(docId).delete();
    setState(() => _selectedMsgId = null);
  }

  Future<void> _pickReplyFile() async {
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
          _replyFile = File(result.files.single.path!);
          _replyFileName = result.files.single.name;
        });
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Dosya secilemedi: $e')),
      );
    }
  }

  void _clearReplyFile() {
    setState(() {
      _replyFile = null;
      _replyFileName = null;
    });
  }

  Future<void> _sendReply(String docId, List<dynamic> repliesList) async {
    final text = _replyCtrl.text.trim();
    if (text.isEmpty && _replyFile == null) return;

    setState(() => _isSendingReply = true);
    try {
      String? attachmentUrl;
      if (_replyFile != null) {
        final safeName = _replyFileName ?? 'reply_attachment';
        final ref = FirebaseStorage.instance
            .ref()
            .child('messages')
            .child('replies')
            .child('${DateTime.now().millisecondsSinceEpoch}_$safeName');
        final uploadTask = await ref.putFile(_replyFile!);
        attachmentUrl = await uploadTask.ref.getDownloadURL();
      }

      final userDoc = await FirebaseFirestore.instance
          .collection('users')
          .doc(user?.uid)
          .get();
      final myName =
          '${userDoc.data()?['name'] ?? ''} ${userDoc.data()?['surname'] ?? ''}'
              .trim();

      final newReply = {
        'authorName': myName,
        'authorId': user?.uid,
        'text': text,
        'timestamp': DateTime.now().toIso8601String(),
        'isRead': false,
        if (attachmentUrl != null) 'attachmentUrl': attachmentUrl,
        if (_replyFileName != null) 'attachmentName': _replyFileName,
      };

      final updatedReplies = List<dynamic>.from(repliesList)..add(newReply);

      await FirebaseFirestore.instance
          .collection('messages')
          .doc(docId)
          .update({
        'replies': updatedReplies,
        'lastMessage': text,
        'timestamp': FieldValue.serverTimestamp(),
        'isRead': false,
        'readAt': null,
      });

      _replyCtrl.clear();
      _clearReplyFile();
      FocusScope.of(context).unfocus();
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Yanıtınız gönderildi.')));
    } catch (e) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Hata: $e')));
    } finally {
      if (mounted) setState(() => _isSendingReply = false);
    }
  }

  Future<void> _refineReply(String docId, Map<String, dynamic> data) async {
    final text = _replyCtrl.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _isRefining = true;
    });

    try {
      final userDoc = await FirebaseFirestore.instance
          .collection('users')
          .doc(user?.uid)
          .get();
      final myName =
          '${userDoc.data()?['name'] ?? ''} ${userDoc.data()?['surname'] ?? ''}'
              .trim();
      final myCompany = userDoc.data()?['company'] ?? 'Bellona';

      final receiverName = data['senderId'] == user?.uid
          ? (data['receiverName'] ?? '').split('(')[0].trim()
          : (data['senderName'] ?? '').split('(')[0].trim();

      final refined = await AIService.refineMessageWithAI(
        text,
        receiverName,
        myName,
        myCompany,
      );

      setState(() {
        _replyCtrl.text = refined;
        _isRefining = false;
      });
    } catch (e) {
      setState(() {
        _isRefining = false;
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Hata: $e')));
    }
  }

  Future<void> _showAddUserDialog(String docId, Map<String, dynamic> data) async {
    final myUid = FirebaseAuth.instance.currentUser?.uid;
    if (myUid == null) return;
    final List<dynamic> currentParticipants = data['participants'] ?? [];
    final List<dynamic> currentAddedParticipants = data['addedParticipants'] ?? [];
    
    showDialog(
      context: context,
      builder: (context) {
        String searchQuery = '';
        return StatefulBuilder(
          builder: (context, setStateSB) {
            return AlertDialog(
              backgroundColor: surface,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              title: const Text('Konuşmaya Kişi Ekle', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              content: SizedBox(
                width: double.maxFinite,
                height: 400,
                child: Column(
                  children: [
                    TextField(
                      decoration: InputDecoration(
                        hintText: 'İsim veya kurum ara...',
                        prefixIcon: const Icon(Icons.search, color: textMuted),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: border)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: border)),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: primary)),
                        filled: true,
                        fillColor: bgApp,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                      onChanged: (val) {
                        setStateSB(() {
                          searchQuery = val.toLowerCase();
                        });
                      },
                    ),
                    const SizedBox(height: 12),
                    Expanded(
                      child: StreamBuilder<QuerySnapshot>(
                        stream: FirebaseFirestore.instance.collection('users').snapshots(),
                        builder: (context, snapshot) {
                          if (snapshot.connectionState == ConnectionState.waiting) {
                            return const Center(child: CircularProgressIndicator(color: primary));
                          }
                          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                            return const Center(child: Text('Kullanıcı bulunamadı.', style: TextStyle(color: textMuted)));
                          }
                          var docs = snapshot.data!.docs.where((d) {
                            if (d.id == myUid) return false;
                            final map = d.data() as Map<String, dynamic>;
                            final name = '${map['name'] ?? ''} ${map['surname'] ?? ''}'.trim().toLowerCase();
                            final company = (map['company'] ?? '').toString().toLowerCase();
                            return name.contains(searchQuery) || company.contains(searchQuery);
                          }).toList();
                          
                          if (docs.isEmpty) {
                            return const Center(child: Text('Eşleşen sonuç yok.', style: TextStyle(color: textMuted)));
                          }
                          
                          return ListView.separated(
                            itemCount: docs.length,
                            separatorBuilder: (context, index) => const Divider(height: 1, color: border),
                            itemBuilder: (context, index) {
                              final doc = docs[index];
                              final map = doc.data() as Map<String, dynamic>;
                              final name = '${map['name'] ?? ''} ${map['surname'] ?? ''}'.trim();
                              final company = map['company'] ?? 'Bilinmeyen Kurum';
                              final isAlreadyIn = currentParticipants.contains(doc.id);
                              
                              return ListTile(
                                contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
                                leading: CircleAvatar(
                                  backgroundColor: isAlreadyIn ? bgApp : primarySoft,
                                  child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', 
                                    style: TextStyle(color: isAlreadyIn ? textMuted : primary, fontWeight: FontWeight.bold)),
                                ),
                                title: Text(name, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: isAlreadyIn ? textMuted : textMain)),
                                subtitle: Text(company, style: TextStyle(color: textMuted, fontSize: 11)),
                                trailing: isAlreadyIn 
                                  ? const Icon(Icons.check_circle_rounded, color: Colors.green, size: 20) 
                                  : const Icon(Icons.person_add_alt_1_rounded, color: primary, size: 20),
                                onTap: isAlreadyIn ? null : () async {
                                  // Ekleme işlemi
                                  final confirm = await showDialog<bool>(
                                    context: context,
                                    builder: (c) => AlertDialog(
                                      backgroundColor: surface,
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                                      title: const Text('Kişiyi Ekle'),
                                      content: Text('$name adlı kişiyi bu yazışmaya dahil etmek istediğinize emin misiniz?'),
                                      actions: [
                                        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('İptal', style: TextStyle(color: textMuted))),
                                        ElevatedButton(
                                          style: ElevatedButton.styleFrom(backgroundColor: primary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
                                          onPressed: () => Navigator.pop(c, true),
                                          child: const Text('Evet, Ekle', style: TextStyle(color: Colors.white)),
                                        ),
                                      ],
                                    )
                                  );
                                  if (confirm != true) return;
                                  
                                  Navigator.pop(context); // Dialogu kapat
                                  
                                  try {
                                    final List<dynamic> updatedParticipants = List.from(currentParticipants);
                                    if (!updatedParticipants.contains(doc.id)) {
                                      updatedParticipants.add(doc.id);
                                    }
                                    
                                    final List<dynamic> updatedAdded = List.from(currentAddedParticipants);
                                    bool exists = updatedAdded.any((element) => element is Map && element['id'] == doc.id);
                                    if (!exists) {
                                      updatedAdded.add({'id': doc.id, 'name': name});
                                    }
                                    
                                    final List<dynamic> updatedReplies = List.from(data['replies'] ?? []);
                                    updatedReplies.add({
                                      'authorName': 'Sistem',
                                      'isSystem': true,
                                      'timestamp': DateTime.now().toIso8601String(),
                                      'text': '📢 $name bu konuşmaya eklendi.',
                                    });
                                    
                                    await FirebaseFirestore.instance.collection('messages').doc(docId).update({
                                      'participants': updatedParticipants,
                                      'addedParticipants': updatedAdded,
                                      'replies': updatedReplies,
                                      'timestamp': FieldValue.serverTimestamp(),
                                    });
                                    
                                    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('🎉 $name konuşmaya dahil edildi!')));
                                  } catch (e) {
                                    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Hata oluştu: $e')));
                                  }
                                },
                              );
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
              actionsPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Kapat', style: TextStyle(color: textMuted)),
                )
              ],
            );
          }
        );
      }
    );
  }

  Widget _buildDetail(QueryDocumentSnapshot doc, String uid, MessageGroup group) {
    final data = doc.data() as Map<String, dynamic>;
    final subject = data['subject'] ?? 'Konusuz';
    final senderName = data['senderName'] ?? 'Bilinmiyor';
    final content = data['content'] ?? data['body'] ?? '';
    final hasAttach = data['attachmentUrl'] != null;
    final attachName = data['attachmentName'] ?? 'Ekli Dosya';
    final List<dynamic> replies = data['replies'] ?? [];
    // Web yalnızca 'importantBy' günceller; mobil her ikisini de yazar.
    // Senkron olması için her iki alan da kontrol edilir.
    final isStarred = (data['starredBy'] ?? []).contains(uid) ||
        (data['importantBy'] ?? []).contains(uid);
    final isArchived = (data['archivedBy'] ?? []).contains(uid);
    final isTrashed = (data['trashedBy'] ?? []).contains(uid);

    // Auto load suggestions in background
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadAISuggestions(doc.id, data);
    });

    DateTime? time;
    if (data['timestamp'] != null) {
      time = (data['timestamp'] as Timestamp).toDate();
    }

    final isAIHidden = _hideSuggestions[doc.id] == true;
    final suggestions = _suggestionsCache[doc.id] ?? [];
    final drafts = _draftsCache[doc.id] ?? [];
    final isAILoading = _loadingAI[doc.id] == true;
    return SafeArea(
      top: true,
      bottom: false,
      child: Column(
        children: [
          // Geri butonu başlık
          Container(
            color: surface,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back_ios_rounded, color: primary),
                  onPressed: () => setState(() => _selectedMsgId = null),
                ),
                const Expanded(
                  child: Text('Mesaj Detayı',
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: textMain,
                          fontSize: 15)),
                ),
                IconButton(
                  icon: const Icon(Icons.auto_awesome_rounded, color: Colors.amber, size: 22),
                  tooltip: 'Yapay Zeka ile Özetle',
                  onPressed: () => _toggleAISummary(doc.id, data, replies),
                ),
                // Konuşmaya Kişi Ekleme Butonu (Web ile uyumlu)
                IconButton(
                  icon: const Icon(Icons.person_add_alt_1_rounded, color: primary, size: 22),
                  tooltip: 'Kişi Ekle',
                  onPressed: () => _showAddUserDialog(doc.id, data),
                ),
                IconButton(
                  icon: Icon(
                    isStarred ? Icons.star_rounded : Icons.star_border_rounded,
                    color: isStarred ? accentGold : textMuted,
                  ),
                  tooltip: isStarred ? 'Yildizi kaldir' : 'Yildizla',
                  onPressed: () => _toggleStar(doc.id, isStarred, uid),
                ),
                IconButton(
                  icon: Icon(
                    isArchived
                        ? Icons.move_to_inbox_rounded
                        : Icons.inventory_2_outlined,
                    color: primary,
                  ),
                  tooltip: isArchived ? 'Gelen kutusuna al' : 'Arsivle',
                  onPressed: () => _toggleArchive(doc.id, isArchived, uid),
                ),
                IconButton(
                  icon: Icon(
                    isTrashed
                        ? Icons.restore_from_trash_rounded
                        : Icons.delete_outline_rounded,
                    color: Colors.redAccent,
                  ),
                  tooltip: isTrashed ? 'Geri yukle' : 'Cope tasi',
                  onPressed: () => _toggleTrash(doc.id, isTrashed, uid),
                ),
                if (isTrashed)
                  IconButton(
                    icon: const Icon(Icons.delete_forever_rounded,
                        color: Colors.redAccent),
                    tooltip: 'Kalici sil',
                    onPressed: () => _deleteForever(doc.id),
                  ),
              ],
            ),
          ),
          const Divider(height: 1, color: border),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Konu başlığı — web .subject ile aynı
                  Text(subject,
                      style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: textMain,
                          height: 1.3)),
                  const SizedBox(height: 16),

                  // ── AI Akıllı Özet Kutusu (Açılır/Kapanır) ──
                  if (_showSummary[doc.id] == true) ...[
                    Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [Colors.amber.shade50.withOpacity(0.9), Colors.white],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.amber.withOpacity(0.35), width: 1.5),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.amber.withOpacity(0.06),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.auto_awesome_rounded, color: Colors.amber, size: 18),
                              const SizedBox(width: 8),
                              const Text(
                                'AI Akıllı Özet',
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 13,
                                  color: textMain,
                                  letterSpacing: 0.2,
                                ),
                              ),
                              const Spacer(),
                              GestureDetector(
                                onTap: () => setState(() => _showSummary[doc.id] = false),
                                child: const Icon(Icons.close, size: 16, color: textMuted),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          if (_loadingSummary[doc.id] == true)
                            const Row(
                              children: [
                                SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.amber,
                                  ),
                                ),
                                SizedBox(width: 10),
                                Text(
                                  'Yazışmalar inceleniyor ve özetleniyor...',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: textMuted,
                                    fontStyle: FontStyle.italic,
                                  ),
                                ),
                              ],
                            )
                          else
                            Text(
                              _summaryCache[doc.id] ?? 'Özet oluşturulamadı.',
                              style: const TextStyle(
                                fontSize: 13,
                                color: textMain,
                                height: 1.5,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],

                  // ── Toplu Gönderim Alıcı Seçici (Premium UI Redesign - Collapsible & Inactive Chip styled) ──
                  if (group.isBulkGroup) ...[
                    Container(
                      margin: const EdgeInsets.only(bottom: 20),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFE2E8F0), width: 1),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.02),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          )
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          GestureDetector(
                            onTap: () {
                              setState(() {
                                _isBulkSelectorExpanded = !_isBulkSelectorExpanded;
                              });
                            },
                            behavior: HitTestBehavior.opaque,
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(6),
                                  decoration: BoxDecoration(
                                    color: primarySoft,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: const Icon(Icons.people_alt_rounded, color: primary, size: 16),
                                ),
                                const SizedBox(width: 10),
                                const Text(
                                  'Toplu Gönderim Görüşmeleri',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 13,
                                    color: textMain,
                                    letterSpacing: 0.1,
                                  ),
                                ),
                                const Spacer(),
                                Icon(
                                  _isBulkSelectorExpanded
                                      ? Icons.keyboard_arrow_up_rounded
                                      : Icons.keyboard_arrow_down_rounded,
                                  color: textMuted,
                                  size: 20,
                                ),
                              ],
                            ),
                          ),
                          if (_isBulkSelectorExpanded) ...[
                            const SizedBox(height: 10),
                            const Text(
                              'Alıcının adına dokunarak kişisel sohbeti görüntüleyin:',
                              style: TextStyle(fontSize: 11, color: textMuted, fontWeight: FontWeight.w500),
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              height: 38,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: group.groupMembers.length,
                                separatorBuilder: (_, __) => const SizedBox(width: 8),
                                itemBuilder: (context, idx) {
                                  final member = group.groupMembers[idx];
                                  final memberData = member.data();
                                  final memberName = memberData['receiverName'] ?? 'Bilinmiyor';
                                  final isActive = member.id == doc.id;
                                  
                                  return InkWell(
                                    onTap: () {
                                      setState(() {
                                        _selectedMsgId = member.id;
                                      });
                                    },
                                    borderRadius: BorderRadius.circular(20),
                                    child: AnimatedContainer(
                                      duration: const Duration(milliseconds: 200),
                                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                                      decoration: BoxDecoration(
                                        gradient: isActive ? const LinearGradient(
                                          colors: [gradStart, gradEnd],
                                          begin: Alignment.topLeft,
                                          end: Alignment.bottomRight,
                                        ) : null,
                                        color: isActive ? null : const Color(0xFFEDF2F7),
                                        borderRadius: BorderRadius.circular(20),
                                        border: Border.all(
                                          color: isActive ? Colors.transparent : const Color(0xFFE2E8F0),
                                          width: 1,
                                        ),
                                        boxShadow: isActive ? [
                                          BoxShadow(
                                            color: primary.withOpacity(0.25),
                                            blurRadius: 8,
                                            offset: const Offset(0, 3),
                                          )
                                        ] : [],
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            isActive ? Icons.person_pin_rounded : Icons.person_outline_rounded,
                                            size: 15,
                                            color: isActive ? Colors.white : textMuted,
                                          ),
                                          const SizedBox(width: 6),
                                          Text(
                                            memberName,
                                            style: TextStyle(
                                              color: isActive ? Colors.white : textMain,
                                              fontSize: 12,
                                              fontWeight: isActive ? FontWeight.w800 : FontWeight.w600,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],

                // Gönderen bilgisi
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: bgApp,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: border),
                  ),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 20,
                        backgroundColor: primarySoft,
                        child: Text(
                          senderName.isNotEmpty
                              ? senderName[0].toUpperCase()
                              : '?',
                          style: const TextStyle(
                              color: primary,
                              fontWeight: FontWeight.w800,
                              fontSize: 14),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            RichText(
                              text: TextSpan(
                                style: const TextStyle(fontSize: 14, color: textMain),
                                children: [
                                  const TextSpan(
                                    text: 'Kimden: ',
                                    style: TextStyle(fontWeight: FontWeight.w400, color: textMuted),
                                  ),
                                  TextSpan(
                                    text: senderName,
                                    style: const TextStyle(fontWeight: FontWeight.bold, color: textMain),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 4),
                            RichText(
                              text: TextSpan(
                                style: const TextStyle(fontSize: 12, color: textMain),
                                children: [
                                  const TextSpan(
                                    text: 'Kime: ',
                                    style: TextStyle(fontWeight: FontWeight.w400, color: textMuted),
                                  ),
                                  TextSpan(
                                    text: data['receiverName'] ?? 'Bilinmiyor',
                                    style: const TextStyle(fontWeight: FontWeight.w600, color: textMain),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 6),
                            if (time != null)
                              Text(
                                '${time.day}.${time.month}.${time.year} ${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
                                style: TextStyle(
                                    fontSize: 11, color: textMuted.withOpacity(0.85), fontWeight: FontWeight.w500),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Mesaj içeriği
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: uid == data['senderId'] ? const Color(0xFFE8F5E9) : Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: uid == data['senderId'] ? const Color(0xFFC8E6C9) : border),
                  ),
                  child: Text(content,
                      style: const TextStyle(
                          color: textMain, fontSize: 15, height: 1.7)),
                ),

                // Ek dosya varsa
                if (hasAttach) ...[
                  const SizedBox(height: 16),
                  InkWell(
                    onTap: () => _openAttachment(data['attachmentUrl'] ?? '', attachName),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: primarySoft,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: primary.withOpacity(0.2)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.picture_as_pdf,
                              color: primary, size: 28),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Ekli Dosya',
                                    style: TextStyle(
                                        color: textMuted,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600)),
                                Text(attachName,
                                    style: const TextStyle(
                                        color: primary,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 14),
                                    overflow: TextOverflow.ellipsis),
                              ],
                            ),
                          ),
                          const Icon(Icons.open_in_new_rounded,
                              color: primary, size: 22),
                        ],
                      ),
                    ),
                  ),
                ],

                // Replies List — Web reply-item-for-me / reply-item-targeted / reply-item-general ile uyumlu renkler
                if (replies.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Icon(Icons.forum_rounded, color: primary.withOpacity(0.7), size: 18),
                      const SizedBox(width: 8),
                      const Text('Yanıtlar',
                          style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 15,
                              color: textMain,
                              letterSpacing: 0.2)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ...replies.map((r) {
                    final isMyReply = r['authorId'] == uid;
                    final isSystem = r['isSystem'] == true;
                    final isRead = r['isRead'] == true;
                    final replyTime = r['timestamp'] != null
                        ? DateTime.tryParse(r['timestamp'])
                        : null;
                    final timeStr = replyTime != null
                        ? '${replyTime.day}.${replyTime.month} ${replyTime.hour.toString().padLeft(2, '0')}:${replyTime.minute.toString().padLeft(2, '0')}'
                        : '';

                    // ── Web uyumlu hedefleme analizi ──
                    // Web'deki directedToId alanını kontrol ederek renk belirle
                    final String? directedToId = r['directedToId'] as String?;
                    final String? directedToName = r['directedToName'] as String?;
                    final bool isForMe = directedToId != null && directedToId == uid;
                    final bool isTargeted = directedToId != null && directedToId != uid;
                    final bool isGeneral = directedToId == null;

                    // ── Renk şeması (Web CSS ile birebir uyumlu) ──
                    // reply-item-for-me: amber/gold gradient
                    // reply-item-targeted: teal/accent
                    // reply-item-general: slate grey / white
                    Color boxColor;
                    Color borderColor;
                    Color leftBorderColor;
                    if (isSystem) {
                      boxColor = Colors.amber.shade50;
                      borderColor = Colors.amber.shade200;
                      leftBorderColor = Colors.amber.shade400;
                    } else if (isForMe) {
                      // Web: rgba(217, 119, 6, 0.03) → rgba(245, 158, 11, 0.06) + gold border
                      boxColor = const Color(0xFFFFF8E7); // Soft amber/gold
                      borderColor = const Color(0xFFF5CE6E); // rgba(245,158,11,0.25)
                      leftBorderColor = const Color(0xFFF59E0B); // #f59e0b golden
                    } else if (isTargeted) {
                      // Web: rgba(0, 130, 138, 0.02) → rgba(0, 164, 173, 0.04) + accent border
                      boxColor = const Color(0xFFE8F7F7); // Soft teal
                      borderColor = const Color(0xFFB2DFDB); // rgba(0,164,173,0.15)
                      leftBorderColor = const Color(0xFF00A4AD); // accent teal
                    } else if (isMyReply) {
                      // Kendi gönderdiğim mesaj — yeşilimsi
                      boxColor = const Color(0xFFE8F5E9);
                      borderColor = const Color(0xFFC8E6C9);
                      leftBorderColor = const Color(0xFF66BB6A);
                    } else {
                      // Web: reply-item-general — white + slate grey border
                      boxColor = Colors.white;
                      borderColor = border;
                      leftBorderColor = const Color(0xFF64748B); // Slate grey
                    }

                    Widget readReceipt = const SizedBox();
                    if (isMyReply) {
                      if (isRead) {
                        final readAtStr = r['readAt'] != null
                            ? DateTime.tryParse(r['readAt'])
                                    ?.toLocal()
                                    .toString()
                                    .substring(11, 16) ??
                                ''
                            : '';
                        readReceipt = Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.done_all,
                                color: primary, size: 13),
                            const SizedBox(width: 2),
                            Text('Okundu $readAtStr',
                                style: const TextStyle(
                                    fontSize: 9,
                                    color: primary,
                                    fontWeight: FontWeight.bold)),
                          ],
                        );
                      } else {
                        readReceipt = const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.done, color: textMuted, size: 13),
                            SizedBox(width: 2),
                            Text('İletildi',
                                style:
                                    TextStyle(fontSize: 9, color: textMuted)),
                          ],
                        );
                      }
                    }

                    // ── Hedef badge widget'ı (Web reply-badge-target ile uyumlu) ──
                    Widget targetBadge = const SizedBox.shrink();
                    if (!isSystem && !isMyReply) {
                      if (isForMe) {
                        targetBadge = Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF59E0B).withOpacity(0.12),
                            borderRadius: BorderRadius.circular(99),
                            border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.25)),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.star_rounded, size: 11, color: Color(0xFFD97706)),
                              SizedBox(width: 3),
                              Text('Sizin İçin Öncelikli',
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFFD97706),
                                    letterSpacing: 0.3,
                                  )),
                            ],
                          ),
                        );
                      } else if (isTargeted) {
                        final targetCleanName = (directedToName ?? 'Bilinmeyen').split('(')[0].trim();
                        targetBadge = Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFF00828A).withOpacity(0.08),
                            borderRadius: BorderRadius.circular(99),
                            border: Border.all(color: const Color(0xFF00828A).withOpacity(0.15)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.gps_fixed_rounded, size: 11, color: Color(0xFF00828A)),
                              const SizedBox(width: 3),
                              Text('$targetCleanName Hedefli',
                                  style: const TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF00828A),
                                    letterSpacing: 0.3,
                                  )),
                            ],
                          ),
                        );
                      } else if (isGeneral) {
                        targetBadge = Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFF64748B).withOpacity(0.08),
                            borderRadius: BorderRadius.circular(99),
                            border: Border.all(color: const Color(0xFF64748B).withOpacity(0.12)),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.campaign_rounded, size: 11, color: Color(0xFF475569)),
                              SizedBox(width: 3),
                              Text('Herkese Açık',
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF475569),
                                    letterSpacing: 0.3,
                                  )),
                            ],
                          ),
                        );
                      }
                    }

                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(
                        color: boxColor,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: borderColor, width: 1),
                        boxShadow: [
                          BoxShadow(
                            color: isForMe
                                ? const Color(0xFFF59E0B).withOpacity(0.08)
                                : Colors.black.withOpacity(0.02),
                            blurRadius: isForMe ? 12 : 6,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(11),
                        child: Container(
                          decoration: BoxDecoration(
                            border: Border(left: BorderSide(color: leftBorderColor, width: 4)),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Üst satır: Yazar adı + badge + saat
                                Row(
                                  children: [
                                    Icon(
                                      Icons.person_rounded,
                                      size: 14,
                                      color: isForMe ? const Color(0xFFD97706)
                                           : isTargeted ? const Color(0xFF00828A)
                                           : primary,
                                    ),
                                    const SizedBox(width: 5),
                                    Text(r['authorName'] ?? 'Bilinmeyen',
                                        style: TextStyle(
                                            fontWeight: FontWeight.w800,
                                            color: isForMe ? const Color(0xFFB45309)
                                                 : isTargeted ? const Color(0xFF006B72)
                                                 : textMain,
                                            fontSize: 12.5)),
                                    const SizedBox(width: 8),
                                    targetBadge,
                                    const Spacer(),
                                    Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        if (isMyReply) ...[
                                          readReceipt,
                                          const SizedBox(width: 6),
                                        ],
                                        Text(timeStr,
                                            style: const TextStyle(
                                                color: textMuted, fontSize: 10, fontWeight: FontWeight.w500)),
                                      ],
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(r['text'] ?? '',
                                    style: const TextStyle(
                                        fontSize: 13, color: textMain, height: 1.5)),
                                if (r['attachmentUrl'] != null) ...[
                                  const SizedBox(height: 8),
                                  InkWell(
                                    onTap: () => _openAttachment(r['attachmentUrl'] ?? '', r['attachmentName'] ?? 'Ekli Dosya'),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 10, vertical: 7),
                                      decoration: BoxDecoration(
                                        color: primarySoft,
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                            color: primary.withOpacity(0.2)),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Icon(Icons.attach_file_rounded,
                                              color: primary, size: 15),
                                          const SizedBox(width: 6),
                                          Flexible(
                                            child: Text(
                                              r['attachmentName'] ?? 'Ekli Dosya',
                                              style: const TextStyle(
                                                  color: primary,
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.bold),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ],
                const SizedBox(height: 100),
              ],
            ),
          ),
        ),

        // AI smart replies wrapper
        if (!isAIHidden)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: const BoxDecoration(
              color: surface,
              border: Border(top: BorderSide(color: border)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isAILoading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 8.0),
                    child: Row(
                      children: [
                        SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                                strokeWidth: 1.5, color: primary)),
                        SizedBox(width: 8),
                        Text('Yapay zeka yanıtları hazırlanıyor...',
                            style: TextStyle(
                                fontSize: 11,
                                color: textMuted,
                                fontStyle: FontStyle.italic)),
                      ],
                    ),
                  )
                else ...[
                  if (suggestions.isNotEmpty) ...[
                    const Row(
                      children: [
                        Icon(Icons.bolt_rounded, color: Colors.amber, size: 14),
                        SizedBox(width: 4),
                        Text('Hızlı Yanıt Önerileri:',
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: textMuted)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    SizedBox(
                      height: 34,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: suggestions.length,
                        itemBuilder: (ctx, idx) => Padding(
                          padding: const EdgeInsets.only(right: 6.0),
                          child: ActionChip(
                            padding: EdgeInsets.zero,
                            labelPadding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 0),
                            backgroundColor: primarySoft,
                            side: BorderSide(color: primary.withOpacity(0.15)),
                            label: Text(suggestions[idx],
                                style: const TextStyle(
                                    color: primary,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700)),
                            onPressed: () {
                              _replyCtrl.text = suggestions[idx];
                              setState(() {
                                _hideSuggestions[doc.id] = true;
                              });
                            },
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (drafts.isNotEmpty) ...[
                    const Row(
                      children: [
                        Icon(Icons.assistant_rounded, color: primary, size: 14),
                        SizedBox(width: 4),
                        Text('Detaylı Cevap Taslakları:',
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: textMuted)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    SizedBox(
                      height: 70,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: drafts.length,
                        itemBuilder: (ctx, idx) => Container(
                          width: 200,
                          margin: const EdgeInsets.only(right: 8.0),
                          decoration: BoxDecoration(
                            color: bgApp,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: border),
                          ),
                          child: InkWell(
                            onTap: () {
                              _replyCtrl.text = drafts[idx];
                              setState(() {
                                _hideSuggestions[doc.id] = true;
                              });
                            },
                            borderRadius: BorderRadius.circular(8),
                            child: Padding(
                              padding: const EdgeInsets.all(8.0),
                              child: Text(
                                drafts[idx],
                                style: const TextStyle(
                                    fontSize: 10,
                                    color: textMain,
                                    fontStyle: FontStyle.italic),
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ],
            ),
          ),

        // Reply input bar
        Container(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          decoration: const BoxDecoration(
            color: surface,
            border: Border(top: BorderSide(color: border)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _replyCtrl,
                  style: const TextStyle(color: textMain, fontSize: 13),
                  decoration: InputDecoration(
                    hintText: 'Bir yanıt yazın...',
                    hintStyle: const TextStyle(color: textMuted),
                    filled: true,
                    fillColor: bgApp,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide.none),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                icon: Icon(
                  _replyFileName == null
                      ? Icons.attach_file_rounded
                      : Icons.close_rounded,
                  color: primary,
                ),
                tooltip: _replyFileName == null ? 'Dosya ekle' : 'Eki kaldir',
                onPressed: _isSendingReply
                    ? null
                    : (_replyFileName == null
                        ? _pickReplyFile
                        : _clearReplyFile),
              ),
              if (_isRefining)
                const SizedBox(
                  width: 36,
                  height: 36,
                  child: Padding(
                    padding: EdgeInsets.all(8.0),
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: primary),
                  ),
                )
              else
                IconButton(
                  icon: const Icon(Icons.auto_awesome_rounded, color: primary),
                  tooltip: 'Akıllı Düzenle',
                  onPressed: () => _refineReply(doc.id, data),
                ),
              IconButton(
                icon: const Icon(Icons.send_rounded, color: primary),
                onPressed:
                    _isSendingReply ? null : () => _sendReply(doc.id, replies),
              ),
            ],
          ),
        ),
      ],
    ),);
  }

  // --- BOŞ DURUM — web .empty-state ile aynı ---
  Widget _emptyState() {
    const icons = {
      'inbox': Icons.inbox_rounded,
      'sent': Icons.send_rounded,
      'drafts': Icons.edit_note_rounded,
      'important': Icons.star_rounded,
      'archive': Icons.inventory_2_rounded,
      'trash': Icons.delete_rounded,
    };
    const messages = {
      'inbox': 'Gelen kutunuz boş.',
      'sent': 'Henüz mesaj göndermediniz.',
      'drafts': 'Taslağınız bulunmuyor.',
      'important': 'Yıldızlı mesajınız yok.',
      'archive': 'Arşiviniz boş.',
      'trash': 'Çöp kutunuz boş.',
    };
    const subMessages = {
      'inbox': 'Yeni bir mesaj gelince burada görünecektir.',
      'sent': 'Yeni bir mesaj göndererek iletişime geçin.',
      'drafts': 'Yazmaya başladığınız taslaklar burada saklanır.',
      'important': 'Önemli mesajlarınızı yıldızlayarak buraya ekleyebilirsiniz.',
      'archive': 'Arşivlediğiniz mesajlar burada tutulur.',
      'trash': 'Silinen mesajlarınız çöp kutusunda toplanır.',
    };
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: primarySoft,
              shape: BoxShape.circle,
            ),
            child: Icon(icons[_currentFolder] ?? Icons.inbox,
                color: primary, size: 52),
          ),
          const SizedBox(height: 24),
          Text(
            messages[_currentFolder] ?? 'Boş',
            style: const TextStyle(
                color: textMain, fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40),
            child: Text(
              subMessages[_currentFolder] ?? '',
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: textMuted, fontSize: 13, height: 1.4, fontWeight: FontWeight.w400),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Çıkış Yap',
            style: TextStyle(
                fontWeight: FontWeight.w800, color: Color(0xFF0C2D30))),
        content: const Text('Oturumunuzu kapatmak istediğinize emin misiniz?',
            style: TextStyle(color: Color(0xFF5C7B7D))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child:
                const Text('İptal', style: TextStyle(color: Color(0xFF5C7B7D))),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              FirebaseAuth.instance.signOut();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF43F5E),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
            child:
                const Text('Çıkış Yap', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  // Zaman formatlama — web ile aynı
  String _formatTime(DateTime t) {
    final now = DateTime.now();
    if (t.day == now.day && t.month == now.month && t.year == now.year) {
      return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    }
    return '${t.day}.${t.month}';
  }

  // ── Klasör tab (yatay bar'da görünen chip) ──────────────
  Widget _folderTab(String value, IconData icon, String label) {
    final selected = _currentFolder == value;
    return GestureDetector(
      onTap: () => setState(() {
        _currentFolder = value;
        _selectedMsgId = null;
      }),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? primarySoft : surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? primary.withOpacity(0.3) : const Color(0xFFE2E8F0),
            width: selected ? 1.5 : 1,
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                      color: primary.withOpacity(0.05),
                      blurRadius: 6,
                      offset: const Offset(0, 2))
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: selected ? primaryHover : textMuted, size: 14),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                color: selected ? primaryHover : textMuted,
                fontSize: 12,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  PopupMenuItem<String> _menuItem(String value, IconData icon, String label) {
    return PopupMenuItem(
      value: value,
      child: Row(children: [
        Icon(icon, color: primary, size: 18),
        const SizedBox(width: 10),
        Text(label,
            style: TextStyle(
                fontWeight:
                    _currentFolder == value ? FontWeight.w800 : FontWeight.w400,
                color: _currentFolder == value ? primary : textMain)),
      ]),
    );
  }
}

class MessageGroup {
  final QueryDocumentSnapshot<Map<String, dynamic>> primaryDoc;
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> groupMembers;

  MessageGroup({required this.primaryDoc, required this.groupMembers});

  bool get isBulkGroup => groupMembers.length > 1;
  String get id => primaryDoc.id;
  Map<String, dynamic> get data => primaryDoc.data();
}
