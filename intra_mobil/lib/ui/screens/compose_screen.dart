import 'dart:typed_data';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:file_picker/file_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:intra_mobil/core/backend/ai_service.dart';

/// Mobil Yeni Mesaj (Compose) Ekranı
/// 
/// Web portalındaki gelişmiş mesaj gönderme altyapısının mobil karşılığıdır.
/// - Gelişmiş çoklu/toplu alıcı seçimi (Bulk sending)
/// - Kategori ve bölge bazlı filtreleme (Yetki ağacına göre)
/// - Yapay zeka ile konu/içerik oluşturma (Gemini AI API)
/// - Firebase Storage üzerinden dosya eki gönderme
class ComposeScreen extends StatefulWidget {
  final String? preSelectedReceiverId;
  final String? preSelectedReceiverName;

  const ComposeScreen({
    super.key,
    this.preSelectedReceiverId,
    this.preSelectedReceiverName,
  });

  @override
  State<ComposeScreen> createState() => _ComposeScreenState();
}

class _ComposeScreenState extends State<ComposeScreen> {
  final _subjectCtrl = TextEditingController();
  final _bodyCtrl    = TextEditingController();
  final _searchCtrl  = TextEditingController();
  
  /// Alıcı yönetimi (Web'deki `selectedReceivers` dizisine karşılık gelir)
  /// Her alıcı map olarak tutulur: { 'id': '', 'name': '', 'type': 'individual'|'bulk', ... }
  final List<Map<String, dynamic>> _selectedReceiversList = [];
  
  // ── Arama ve Filtreleme Durumları ──
  
  /// Giriş yapan kullanıcının veritabanındaki rol/yetki bilgileri
  Map<String, dynamic>? _currentUserData;
  
  /// Kullanıcının seçtiği birim/kategori (Örn: 'factory_hq')
  String _selectedCategory = '';
  
  /// Kullanıcının seçtiği bölge (Örn: 'Marmara')
  String _selectedRegion = '';
  
  /// Seçilen kategori ve bölgeye uyan kullanıcıların ham listesi
  List<Map<String, dynamic>> _currentCategoryUsers = [];
  
  /// Arama çubuğuna yazılan metne göre filtrelenmiş kullanıcı listesi
  List<Map<String, dynamic>> _filteredUsers = [];

  // ── Yüklenme Durumları (State Flags) ──
  bool _isSending = false;
  bool _isSavingDraft = false;
  bool _isAISuggesting = false;
  bool _isUploadingFile = false;
  bool _isUrgent = false;
  bool _isSearchingLoading = false;
  
  // Dosya Eki Değişkenleri
  Uint8List? _attachedFileBytes;
  String? _attachedFileName;
  String? _attachedFileUrl;

  final user = FirebaseAuth.instance.currentUser;

  @override
  void initState() {
    super.initState();
    _loadCurrentUser();
    
    // Profil üzerinden direkt mesaj atılıyorsa
    if (widget.preSelectedReceiverId != null && widget.preSelectedReceiverName != null) {
      _selectedReceiversList.add({
        'id': widget.preSelectedReceiverId!,
        'name': widget.preSelectedReceiverName!,
        'type': 'individual',
        'region': '',
        'company': '',
        'category': '',
        'subRole': '',
        'dealerCode': '',
      });
    }

    _searchCtrl.addListener(_filterUsers);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _subjectCtrl.dispose();
    _bodyCtrl.dispose();
    super.dispose();
  }

  // Renk Paleti (Modern HSL uyarlaması)
  static const Color primary      = Color(0xFF00A4AD);
  static const Color primarySoft  = Color(0xFFEAF7F7);
  static const Color bgApp        = Color(0xFFF8FAFC); // Slate 50
  static const Color textMain     = Color(0xFF0F172A); // Slate 900
  static const Color textMuted    = Color(0xFF64748B); // Slate 500
  static const Color border       = Color(0xFFE2E8F0); // Slate 200
  static const Color gradStart    = Color(0xFF004D52);
  static const Color gradEnd      = Color(0xFF00828A);
  static const Color accentGold   = Color(0xFFEAB308);
  static const Color danger       = Color(0xFFEF4444);

  /// Mevcut kullanıcının Firestore `users` koleksiyonundaki detaylı 
  /// verilerini çeker. Kategori filtreleme yetkileri bu verilere göre belirlenir.
  Future<void> _loadCurrentUser() async {
    try {
      final docSnap = await FirebaseFirestore.instance.collection('users').doc(user?.uid).get();
      if (docSnap.exists) {
        setState(() {
          _currentUserData = docSnap.data();
        });
      }
    } catch (e) {
      print('Kullanıcı verisi yüklenirken hata: $e');
    }
  }

  /// Kullanıcının rolüne (`category` ve `subRole`) göre, kime mesaj 
  /// atabileceğini (hangi birimleri görebileceğini) kısıtlar.
  /// Admin/Factory Manager -> Herkese, Local Employee -> Sadece Local Boss/Colleagues
  List<String> _getAvailableCategories() {
    if (_currentUserData == null) return [];
    final cat = _currentUserData!['category'] ?? 'local';
    final subRole = _currentUserData!['subRole'] ?? 'employee';
    final role = _currentUserData!['role'] ?? 'employee';
    final isAdmin = cat == 'admin' || role == 'admin' || subRole == 'admin';

    if (isAdmin) {
      return ['local_colleagues', 'local_boss', 'region_dealers', 'factory_hq', 'global'];
    } else if (cat == 'factory') {
      return ['factory_hq', 'region_dealers'];
    } else if (cat == 'regional') {
      if (subRole == 'manager') {
        return ['local_colleagues', 'local_boss', 'region_dealers', 'factory_hq', 'global'];
      } else {
        return ['local_colleagues', 'local_boss', 'region_dealers', 'factory_hq'];
      }
    } else { // local
      if (subRole == 'manager') {
        return ['local_colleagues', 'local_boss', 'region_dealers'];
      } else {
        return ['local_colleagues', 'local_boss'];
      }
    }
  }

  /// Sistem kategorilerini kullanıcı dostu Türkçe isimlere çevirir.
  /// Web portalındaki etiket isimlendirmeleriyle birebir aynıdır.
  String _getCategoryLabel(String key) {
    switch (key) {
      case 'local_colleagues':
        return 'Bölge Personeli (Kendi Bölgem)';
      case 'local_boss':
        return 'Bölge Bayi Temsilcileri';
      case 'region_dealers':
        return 'Bölge Müdürlüğü Yetkilileri';
      case 'factory_hq':
        return 'Genel Müdürlük ve Fabrika Birimleri';
      case 'global':
        return 'Global Organizasyon Arama';
      default:
        return 'Global Organizasyon Arama';
    }
  }

  /// Kullanıcının ve seçilen hedefin durumuna göre "Bölge (Region)" 
  /// filtresi (dropdown) gösterilip gösterilmeyeceğine karar verir.
  bool _needsRegionFilter() {
    if (_currentUserData == null) return false;
    final cat = _currentUserData!['category'] ?? 'local';
    final subRole = _currentUserData!['subRole'] ?? 'employee';
    final role = _currentUserData!['role'] ?? 'employee';
    final isAdmin = cat == 'admin' || role == 'admin' || subRole == 'admin';

    final allowedToFilter = isAdmin || cat == 'factory' || (cat == 'regional' && subRole == 'manager');
    return allowedToFilter && ['local_boss', 'region_dealers', 'global', 'local_colleagues'].contains(_selectedCategory);
  }

  /// Seçilen kategori ve bölgedeki tüm kullanıcıları Firestore `users` 
  /// koleksiyonundan getirir ve `_currentCategoryUsers` listesine atar.
  Future<void> _loadReceiversByCategory() async {
    if (_selectedCategory.isEmpty) {
      setState(() {
        _currentCategoryUsers = [];
        _filteredUsers = [];
      });
      return;
    }

    setState(() {
      _isSearchingLoading = true;
      _currentCategoryUsers = [];
      _filteredUsers = [];
    });

    final usersRef = FirebaseFirestore.instance.collection('users');
    Query? q;

    final myCat = _currentUserData?['category'] ?? 'local';
    final mySubRole = _currentUserData?['subRole'] ?? 'employee';
    final myRegion = _currentUserData?['region'] ?? '';
    final myDealerCode = _currentUserData?['dealerCode'] ?? '';

    try {
      if (_selectedCategory == 'local_boss') {
        if (_selectedRegion.isNotEmpty) {
          q = usersRef
              .where('category', isEqualTo: 'local')
              .where('subRole', isEqualTo: 'manager')
              .where('region', isEqualTo: _selectedRegion);
        } else {
          if (myCat == 'local' && myDealerCode.isNotEmpty) {
            q = usersRef
                .where('category', isEqualTo: 'local')
                .where('subRole', isEqualTo: 'manager')
                .where('dealerCode', isEqualTo: myDealerCode);
          } else {
            q = usersRef
                .where('region', isEqualTo: myRegion)
                .where('category', isEqualTo: 'local')
                .where('subRole', isEqualTo: 'manager');
          }
        }
      } else if (_selectedCategory == 'local_colleagues') {
        if (myCat == 'local' && myDealerCode.isNotEmpty) {
          q = usersRef
              .where('category', isEqualTo: 'local')
              .where('dealerCode', isEqualTo: myDealerCode)
              .where('subRole', isEqualTo: mySubRole);
        } else {
          q = usersRef
              .where('region', isEqualTo: myRegion)
              .where('category', isEqualTo: myCat)
              .where('subRole', isEqualTo: mySubRole);
        }
      } else if (_selectedCategory == 'region_dealers') {
        if (_selectedRegion.isNotEmpty) {
          q = usersRef
              .where('category', isEqualTo: 'regional')
              .where('region', isEqualTo: _selectedRegion);
        } else {
          q = usersRef
              .where('region', isEqualTo: myRegion)
              .where('category', isEqualTo: 'regional');
        }
      } else if (_selectedCategory == 'factory_hq') {
        q = usersRef.where('category', isEqualTo: 'factory');
      } else if (_selectedCategory == 'global') {
        if (_selectedRegion.isNotEmpty) {
          q = usersRef.where('region', isEqualTo: _selectedRegion);
        } else {
          q = usersRef;
        }
      }

      if (q != null) {
        final snap = await q.get();
        final List<Map<String, dynamic>> loadedUsers = [];
        for (var doc in snap.docs) {
          if (doc.id != user?.uid) {
            loadedUsers.add({'id': doc.id, ...doc.data() as Map<String, dynamic>});
          }
        }
        setState(() {
          _currentCategoryUsers = loadedUsers;
          _filterUsers();
        });
      }
    } catch (e) {
      _showSnack('Kullanıcılar yüklenirken hata oluştu: $e', isError: true);
    } finally {
      setState(() => _isSearchingLoading = false);
    }
  }

  // Arama girişine göre liste filtreleme (Türkçe harf desteği dahil)
  void _filterUsers() {
    final query = _searchCtrl.text.trim();
    if (query.isEmpty) {
      setState(() {
        _filteredUsers = [];
      });
      return;
    }

    String clean(String s) {
      return s.toLowerCase()
          .replaceAll('ı', 'i')
          .replaceAll('ğ', 'g')
          .replaceAll('ü', 'u')
          .replaceAll('ş', 's')
          .replaceAll('ö', 'o')
          .replaceAll('ç', 'c');
    }

    final cleanQuery = clean(query);

    final List<Map<String, dynamic>> temp = [];
    for (var u in _currentCategoryUsers) {
      final name = clean('${u['name'] ?? ''} ${u['surname'] ?? ''}');
      final company = clean(u['company'] ?? '');
      final code = clean(u['dealerCode'] ?? '');
      final city = clean(u['city'] ?? '');

      if (name.contains(cleanQuery) ||
          company.contains(cleanQuery) ||
          code.contains(cleanQuery) ||
          city.contains(cleanQuery)) {
        temp.add(u);
      }
    }

    setState(() {
      _filteredUsers = temp;
    });
  }

  // Alıcı Ekleme
  void _selectReceiver(Map<String, dynamic> r) {
    if (_selectedReceiversList.any((selected) => selected['id'] == r['id'])) {
      _showSnack('⚠️ ${r['name']} zaten ekli!', isError: true);
      return;
    }

    // Toplu seçim değilse, toplu bir grubun altında olup olmadığını kontrol et
    if (r['type'] == 'individual') {
      final isCovered = _selectedReceiversList.any((selected) {
        if (selected['type'] != 'bulk') return false;
        final parts = selected['id'].split(':');
        final cat = parts[1];
        final reg = parts.length > 2 ? parts[2] : "";

        if (cat == 'local_boss') {
          return r['category'] == 'local' && r['subRole'] == 'manager' && (reg.isNotEmpty ? r['region'] == reg : true);
        } else if (cat == 'local_colleagues') {
          return r['category'] == 'local' && r['subRole'] == (_currentUserData?['subRole'] ?? 'employee') && (reg.isNotEmpty ? r['region'] == reg : true);
        } else if (cat == 'region_dealers') {
          return r['category'] == 'regional' && (reg.isNotEmpty ? r['region'] == reg : true);
        } else if (cat == 'factory_hq') {
          return r['category'] == 'factory';
        } else if (cat == 'global') {
          return reg.isNotEmpty ? r['region'] == reg : true;
        }
        return false;
      });

      if (isCovered) {
        _showSnack('Bu alıcı zaten eklediğiniz bir gruba (Toplu) dahil.', isError: true);
        return;
      }
    }

    setState(() {
      _selectedReceiversList.add(r);
      _searchCtrl.clear();
      _filteredUsers = [];
    });
  }

  // Toplu Grubu Dağıt (Expand Bulk)
  Future<void> _expandBulk(int index) async {
    final item = _selectedReceiversList[index];
    if (item['type'] != 'bulk') return;

    final parts = item['id'].split(':');
    final cat = parts[1];
    final reg = parts.length > 2 ? parts[2] : "";

    setState(() => _isSearchingLoading = true);
    final groupUsers = await _loadReceiversForExpansion(cat, reg);
    setState(() => _isSearchingLoading = false);

    if (groupUsers.isEmpty) {
      _showSnack('Bu grupta kimse bulunamadı.', isError: true);
      return;
    }

    setState(() {
      _selectedReceiversList.removeAt(index);
      for (var u in groupUsers) {
        final uid = u['id'];
        final name = '${u['name'] ?? ''} ${u['surname'] ?? ''}'.trim();
        if (uid != user?.uid && !_selectedReceiversList.any((r) => r['id'] == uid)) {
          _selectedReceiversList.add({
            'id': uid,
            'name': name,
            'type': 'individual',
            'region': u['region'] ?? '',
            'company': u['company'] ?? '',
            'category': u['category'] ?? '',
            'subRole': u['subRole'] ?? '',
            'dealerCode': u['dealerCode'] ?? '',
          });
        }
      }
    });
  }

  // Genişletme için arka planda sorgu
  Future<List<Map<String, dynamic>>> _loadReceiversForExpansion(String cat, String reg) async {
    final usersRef = FirebaseFirestore.instance.collection('users');
    Query? q;

    final myCat = _currentUserData?['category'] ?? 'local';
    final mySubRole = _currentUserData?['subRole'] ?? 'employee';
    final myRegion = _currentUserData?['region'] ?? '';
    final myDealerCode = _currentUserData?['dealerCode'] ?? '';

    if (cat == 'local_boss') {
      if (reg.isNotEmpty) {
        q = usersRef.where('category', isEqualTo: 'local').where('subRole', isEqualTo: 'manager').where('region', isEqualTo: reg);
      } else {
        if (myCat == 'local' && myDealerCode.isNotEmpty) {
          q = usersRef.where('category', isEqualTo: 'local').where('subRole', isEqualTo: 'manager').where('dealerCode', isEqualTo: myDealerCode);
        } else {
          q = usersRef.where('region', isEqualTo: myRegion).where('category', isEqualTo: 'local').where('subRole', isEqualTo: 'manager');
        }
      }
    } else if (cat == 'local_colleagues') {
      if (myCat == 'local' && myDealerCode.isNotEmpty) {
        q = usersRef.where('category', isEqualTo: 'local').where('dealerCode', isEqualTo: myDealerCode).where('subRole', isEqualTo: mySubRole);
      } else {
        q = usersRef.where('region', isEqualTo: myRegion).where('category', isEqualTo: myCat).where('subRole', isEqualTo: mySubRole);
      }
    } else if (cat == 'region_dealers') {
      if (reg.isNotEmpty) {
        q = usersRef.where('category', isEqualTo: 'regional').where('region', isEqualTo: reg);
      } else {
        q = usersRef.where('region', isEqualTo: myRegion).where('category', isEqualTo: 'regional');
      }
    } else if (cat == 'factory_hq') {
      q = usersRef.where('category', isEqualTo: 'factory');
    } else if (cat == 'global') {
      if (reg.isNotEmpty) {
        q = usersRef.where('region', isEqualTo: reg);
      } else {
        q = usersRef;
      }
    }

    if (q != null) {
      try {
        final snap = await q.get();
        final List<Map<String, dynamic>> res = [];
        for (var doc in snap.docs) {
          if (doc.id != user?.uid) {
            res.add({'id': doc.id, ...doc.data() as Map<String, dynamic>});
          }
        }
        return res;
      } catch (e) {
        print('Genişletme verisi yükleme hatası: $e');
      }
    }
    return [];
  }

  // Dosya Eki Seçici
  Future<void> _pickFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'rar'],
        withData: true,
      );

      if (result != null && result.files.isNotEmpty) {
        setState(() {
          _attachedFileBytes = result.files.first.bytes;
          _attachedFileName = result.files.first.name;
        });
        _showSnack('Dosya seçildi: $_attachedFileName');
      }
    } catch (e) {
      _showSnack('Dosya seçme hatası: $e', isError: true);
    }
  }

  // AI ile Mesaj/Konu Düzenleme Metodu
  Future<void> _suggestSubjectWithAI() async {
    final text = _bodyCtrl.text.trim();
    if (text.isEmpty) {
      _showSnack('Öneri alabilmek için önce mesaj içeriğini yazmalısınız!', isError: true);
      return;
    }

    setState(() => _isAISuggesting = true);

    try {
      final myName = '${_currentUserData?['name'] ?? ''} ${_currentUserData?['surname'] ?? ''}'.trim();
      final myCompany = _currentUserData?['company'] ?? 'Bellona';
      final receiverNames = _selectedReceiversList.isNotEmpty 
          ? _selectedReceiversList.map((r) => r['name']).join(', ') 
          : 'Alıcılar';

      final refined = await AIService.refineMessageWithAI(
        text,
        receiverNames,
        myName,
        myCompany,
      );

      String finalBody = refined;
      final subjectReg = RegExp(r'^(?:Konu|Subject):\s*([^\n]+)', caseSensitive: false);
      final match = subjectReg.firstMatch(refined);
      
      if (match != null) {
        String sugSubject = match.group(1)!.trim();
        _subjectCtrl.text = sugSubject;
        finalBody = refined.replaceFirst(match.group(0)!, '').trim();
      }

      setState(() {
        _bodyCtrl.text = "✨ " + finalBody;
      });
      _showSnack('Yapay zeka konuyu ve içeriği düzenledi ✓');
    } catch (e) {
      _showSnack('Yapay zeka hatası: $e', isError: true);
    } finally {
      setState(() => _isAISuggesting = false);
    }
  }

  // Alıcı ismine özel resmi hitap ekleme (Web ile aynı)
  String _customizeMessageForRecipient(String body, String recipientName) {
    final cleanName = recipientName.split('(')[0].trim();
    final welcomeRegex = RegExp(
      r'^(✨\s*)?(Sayın|Merhaba|Sevgili|Değerli|Saygıdeğer)[^\n]*(\n\s*\n|\n|$)',
      caseSensitive: false,
    );

    if (welcomeRegex.hasMatch(body)) {
      return body.replaceFirstMapped(welcomeRegex, (match) {
        final spark = match.group(1) ?? '';
        return '${spark}Sayın $cleanName,\n\n';
      });
    } else {
      return 'Sayın $cleanName,\n\n$body';
    }
  }

  // Mesajı Gönder (Web sürümü gibi çoklu alıcıya tek tek gönderme ve Audit Log yazma)
  Future<void> _sendMessage() async {
    if (_selectedReceiversList.isEmpty) {
      _showSnack('Lütfen en az bir alıcı ekleyin!', isError: true);
      return;
    }
    if (_subjectCtrl.text.trim().isEmpty || _bodyCtrl.text.trim().isEmpty) {
      _showSnack('Konu ve mesaj alanları boş olamaz!', isError: true);
      return;
    }

    setState(() => _isSending = true);

    try {
      // Dosya Yükleme (Varsa)
      if (_attachedFileBytes != null) {
        setState(() => _isUploadingFile = true);
        final ref = FirebaseStorage.instance
            .ref()
            .child('messages')
            .child('${DateTime.now().millisecondsSinceEpoch}_${_attachedFileName}');
        
        final uploadTask = await ref.putData(_attachedFileBytes!);
        _attachedFileUrl = await uploadTask.ref.getDownloadURL();
      }

      // Alıcıları bireysel olarak çöz (Toplu grupları çözerek)
      final finalRecipients = <String, String>{}; // id -> name

      for (var item in _selectedReceiversList) {
        if (item['type'] == 'bulk') {
          final parts = item['id'].split(':');
          final cat = parts[1];
          final reg = parts.length > 2 ? parts[2] : "";
          final groupUsers = await _loadReceiversForExpansion(cat, reg);
          for (var u in groupUsers) {
            finalRecipients[u['id']] = '${u['name'] ?? ''} ${u['surname'] ?? ''}'.trim();
          }
        } else {
          finalRecipients[item['id']] = item['name'];
        }
      }

      if (finalRecipients.isEmpty) {
        throw Exception('Mesajın iletilebileceği geçerli bir alıcı bulunamadı.');
      }

      final batch = FirebaseFirestore.instance.batch();
      final senderName = '${_currentUserData?['name'] ?? ''} ${_currentUserData?['surname'] ?? ''}'.trim();

      finalRecipients.forEach((tid, tname) {
        final pArr = [user!.uid, tid];
        final customizedBody = _customizeMessageForRecipient(_bodyCtrl.text.trim(), tname);

        final newMsgRef = FirebaseFirestore.instance.collection('messages').doc();
        final auditRef = FirebaseFirestore.instance.collection('auditLogs').doc();

        // Denetim Günlüğü (Audit Log)
        batch.set(auditRef, {
          'actorUid': user!.uid,
          'actorName': senderName,
          'actorEmail': user!.email ?? '-',
          'action': 'BIREYSEL_MESAJ',
          'targetType': 'user',
          'targetId': tid,
          'detail': '"$tname" adlı kullanıcıya mobil uygulama üzerinden mesaj gönderildi.',
          'createdAt': FieldValue.serverTimestamp(),
        });

        // Bireysel Mesaj Belgesi
        batch.set(newMsgRef, {
          'senderId': user!.uid,
          'senderName': senderName,
          'receiverId': tid,
          'receiverName': tname,
          'participants': pArr,
          'receivers': [tid],
          'subject': _subjectCtrl.text.trim(),
          'content': customizedBody,
          'lastMessage': customizedBody,
          'status': 'active',
          'isRead': false,
          'readBy': [],
          'type': 'mail',
          'timestamp': FieldValue.serverTimestamp(),
          'isBulk': finalRecipients.length > 1,
          'isUrgent': _isUrgent,
          'isDraft': false,
          if (_attachedFileUrl != null) 'attachmentUrl': _attachedFileUrl,
          if (_attachedFileName != null) 'attachmentName': _attachedFileName,
          'originalSenderId': null,
          'originalSenderName': null,
        });
      });

      await batch.commit();

      if (!mounted) return;
      _showSnack('${finalRecipients.length} alıcıya mesaj başarıyla gönderildi ✓');
      Navigator.pop(context);
    } catch (e) {
      _showSnack('Mesaj gönderilirken hata oluştu: $e', isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _isSending = false;
          _isUploadingFile = false;
        });
      }
    }
  }

  // Taslağı Kaydet
  Future<void> _saveDraft() async {
    if (_subjectCtrl.text.trim().isEmpty && _bodyCtrl.text.trim().isEmpty && _selectedReceiversList.isEmpty) {
      Navigator.pop(context);
      return;
    }
    setState(() => _isSavingDraft = true);
    try {
      final senderName = '${_currentUserData?['name'] ?? ''} ${_currentUserData?['surname'] ?? ''}'.trim();
      final receiverIds = _selectedReceiversList.map((r) => r['id'].toString()).toList();
      final participants = [user!.uid, ...receiverIds];

      await FirebaseFirestore.instance.collection('messages').add({
        'subject': _subjectCtrl.text.trim().isEmpty
            ? 'İsimsiz Taslak'
            : _subjectCtrl.text.trim(),
        'content': _bodyCtrl.text.trim(),
        'senderId': user?.uid,
        'senderName': senderName,
        'participants': participants,
        'receivers': receiverIds,
        'timestamp': FieldValue.serverTimestamp(),
        'isDraft': true,
        'status': 'active',
        'isRead': false,
        'readBy': [],
        'type': 'mail',
        '_draftReceivers': jsonEncode(_selectedReceiversList),
      });
      if (!mounted) return;
      _showSnack('Taslak kaydedildi.');
      Navigator.pop(context);
    } catch (e) {
      _showSnack('Taslak kaydedilemedi: $e', isError: true);
    } finally {
      if (mounted) setState(() => _isSavingDraft = false);
    }
  }

  void _showSnack(String msg, {bool isError = false, Duration duration = const Duration(milliseconds: 800)}) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg, style: const TextStyle(fontWeight: FontWeight.w600)),
      backgroundColor: isError ? danger : primary,
      behavior: SnackBarBehavior.floating,
      duration: duration,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final availableCategories = _getAvailableCategories();

    return Scaffold(
      backgroundColor: bgApp,
      appBar: AppBar(
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
        iconTheme: const IconThemeData(color: Colors.white),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded, color: Colors.white),
          onPressed: _saveDraft,
          tooltip: 'Kapat (taslak kaydedilir)',
        ),
        title: const Text('Yeni Mesaj',
            style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 16)),
        actions: [
          // Acil Durum Seçeneği
          IconButton(
            icon: Icon(
              _isUrgent ? Icons.bolt_rounded : Icons.bolt_outlined,
              color: _isUrgent ? danger : Colors.white70,
            ),
            onPressed: () {
              setState(() {
                _isUrgent = !_isUrgent;
              });
              _showSnack(_isUrgent ? 'Mesaj ACİL olarak işaretlendi.' : 'Acil durum kaldırıldı.');
            },
            tooltip: 'Acil Mesaj',
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ==========================================
            // KART 1: ALICI SEÇİM PANELİ (Web uyarlaması)
            // ==========================================
            _buildCard(
              label: 'ALICI SEÇİMİ',
              icon: Icons.people_rounded,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // 1. Kategori Seçimi (Alıcı Birimi)
                  DropdownButtonFormField<String>(
                    value: _selectedCategory.isEmpty ? null : _selectedCategory,
                    isExpanded: true,
                    hint: const Text('Alıcı Birimi Seçin...', style: TextStyle(color: textMuted, fontSize: 13)),
                    style: const TextStyle(color: textMain, fontSize: 14, fontWeight: FontWeight.w600),
                    decoration: _inputDecoration(
                      hint: 'Birim filtreleyin',
                      prefixIcon: Icons.category_rounded,
                    ),
                    items: availableCategories.map((catKey) {
                      return DropdownMenuItem(
                        value: catKey,
                        child: Text(_getCategoryLabel(catKey), overflow: TextOverflow.ellipsis),
                      );
                    }).toList(),
                    onChanged: (val) {
                      if (val == null) return;
                      setState(() {
                        _selectedCategory = val;
                        _selectedRegion = '';
                      });
                      _loadReceiversByCategory();
                    },
                  ),
                  if (_selectedCategory.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primarySoft,
                        foregroundColor: primary,
                        elevation: 0,
                        minimumSize: const Size.fromHeight(48),
                        shadowColor: Colors.transparent,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: const BorderSide(color: Color(0xFFD2EBEB)),
                        ),
                      ),
                      icon: const Icon(Icons.group_add_rounded, size: 20),
                      label: Text('${_getCategoryLabel(_selectedCategory)} Tümünü Seç', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                      onPressed: () {
                        if (_selectedCategory == 'global' && _selectedRegion.isEmpty) {
                          _showSnack('Global birim tümüyle eklenemez, lütfen bölge seçiniz veya arama yapınız.', isError: true);
                          return;
                        }
                        _selectReceiver({
                          'id': 'BULK:$_selectedCategory:$_selectedRegion',
                          'name': '📢 ${_getCategoryLabel(_selectedCategory)}${_selectedRegion.isNotEmpty ? ' ($_selectedRegion)' : ''}',
                          'type': 'bulk',
                        });
                      },
                    ),
                  ],
                  const SizedBox(height: 12),

                  // 2. Bölge Filtresi (Gerekiyorsa)
                  if (_needsRegionFilter()) ...[
                    DropdownButtonFormField<String>(
                      value: _selectedRegion.isEmpty ? null : _selectedRegion,
                      hint: const Text('Bölge Filtreleyin (Opsiyonel)...', style: TextStyle(color: textMuted, fontSize: 13)),
                      style: const TextStyle(color: textMain, fontSize: 14, fontWeight: FontWeight.w600),
                      decoration: _inputDecoration(
                        hint: 'Bölge filtreleyin',
                        prefixIcon: Icons.location_on_rounded,
                      ),
                      items: const [
                        DropdownMenuItem(value: '', child: Text('Tüm Bölgeler')),
                        DropdownMenuItem(value: 'Marmara Bölgesi', child: Text('Marmara Bölgesi')),
                        DropdownMenuItem(value: 'İç Anadolu Bölgesi', child: Text('İç Anadolu Bölgesi')),
                        DropdownMenuItem(value: 'Ege Bölgesi', child: Text('Ege Bölgesi')),
                        DropdownMenuItem(value: 'Akdeniz Bölgesi', child: Text('Akdeniz Bölgesi')),
                        DropdownMenuItem(value: 'Karadeniz Bölgesi', child: Text('Karadeniz Bölgesi')),
                        DropdownMenuItem(value: 'Doğu Anadolu Bölgesi', child: Text('Doğu Anadolu Bölgesi')),
                        DropdownMenuItem(value: 'Güneydoğu Anadolu Bölgesi', child: Text('Güneydoğu Anadolu Bölgesi')),
                      ],
                      onChanged: (val) {
                        setState(() {
                          _selectedRegion = val ?? '';
                        });
                        _loadReceiversByCategory();
                      },
                    ),
                    const SizedBox(height: 12),
                  ],

                  // 3. Arama Kutusu
                  TextField(
                    controller: _searchCtrl,
                    enabled: _selectedCategory.isNotEmpty,
                    style: const TextStyle(color: textMain, fontSize: 13),
                    decoration: _inputDecoration(
                      hint: _selectedCategory.isEmpty 
                          ? 'Önce alıcı birimi seçmelisiniz' 
                          : 'İsim, şirket veya bayi kodu ile arayın...',
                      prefixIcon: Icons.search_rounded,
                      enabled: _selectedCategory.isNotEmpty,
                    ),
                  ),

                  // Arama Yükleniyor Göstergesi
                  if (_isSearchingLoading) ...[
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: LinearProgressIndicator(color: primary, backgroundColor: primarySoft),
                    ),
                  ],

                  // 4. Arama Sonuçları Listesi
                  if (_filteredUsers.isNotEmpty || 
                     (_searchCtrl.text.length > 2 && _currentCategoryUsers.length > 1)) ...[
                    Container(
                      margin: const EdgeInsets.only(top: 8),
                      constraints: const BoxConstraints(maxHeight: 200),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: border),
                      ),
                      child: ListView(
                        shrinkWrap: true,
                        children: [
                          // Toplu Ekleme Seçeneği (Web'deki search-result-item bulk-option gibi)
                          if (_currentCategoryUsers.length > 1)
                            ListTile(
                              leading: const CircleAvatar(
                                backgroundColor: primarySoft,
                                child: Icon(Icons.people_rounded, color: primary, size: 20),
                              ),
                              title: Text(
                                '📢 ${_getCategoryLabel(_selectedCategory)}${_selectedRegion.isNotEmpty ? ' ($_selectedRegion)' : ''} (${_currentCategoryUsers.length} Kişi)',
                                style: const TextStyle(fontWeight: FontWeight.bold, color: primary, fontSize: 13),
                              ),
                              subtitle: const Text('Bu birimdeki tüm kullanıcılara toplu gönderim yapar.', style: TextStyle(fontSize: 11)),
                              onTap: () {
                                _selectReceiver({
                                  'id': 'BULK:$_selectedCategory:$_selectedRegion',
                                  'name': '📢 ${_getCategoryLabel(_selectedCategory)}${_selectedRegion.isNotEmpty ? ' ($_selectedRegion)' : ''}',
                                  'type': 'bulk',
                                });
                              },
                            ),
                          
                          // Bireysel Sonuçlar
                          ..._filteredUsers.map((u) {
                            final isManager = u['subRole'] == 'manager';
                            final isColleague = u['category'] == _currentUserData?['category'] && u['region'] == _currentUserData?['region'];
                            
                            Color itemColor = textMain;
                            Color bgItemColor = Colors.transparent;
                            if (isManager) {
                              bgItemColor = const Color(0xFFF1F5F9);
                            } else if (isColleague) {
                              bgItemColor = const Color(0xFFF0FDF4);
                            }

                            return ListTile(
                              tileColor: bgItemColor,
                              leading: (u['profileImageUrl'] != null && u['profileImageUrl'].toString().isNotEmpty)
                                  ? CircleAvatar(
                                      backgroundImage: u['profileImageUrl'].toString().startsWith('data:')
                                          ? MemoryImage(base64Decode(u['profileImageUrl'].toString().split(',').last)) as ImageProvider
                                          : NetworkImage(u['profileImageUrl']),
                                      radius: 18,
                                    )
                                  : CircleAvatar(
                                      backgroundColor: primarySoft,
                                      radius: 18,
                                      child: Text(
                                        (u['name'] != null && u['name'].toString().isNotEmpty) ? u['name'].toString()[0].toUpperCase() : '?',
                                        style: const TextStyle(color: primary, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                              title: Text(
                                '${u['name'] ?? ''} ${u['surname'] ?? ''}',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: itemColor,
                                  fontSize: 13,
                                ),
                              ),
                              subtitle: Text(
                                '${u['company'] ?? 'Bellona'} - ${isManager ? 'Yönetici' : 'Personel'} (${u['region'] ?? 'Genel'})',
                                style: const TextStyle(fontSize: 11),
                              ),
                              trailing: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: primarySoft,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  '#${u['dealerCode'] ?? '0000'}',
                                  style: const TextStyle(color: primary, fontWeight: FontWeight.w700, fontSize: 10),
                                ),
                              ),
                              onTap: () {
                                _selectReceiver({
                                  'id': u['id'],
                                  'name': '${u['name'] ?? ''} ${u['surname'] ?? ''}'.trim(),
                                  'type': 'individual',
                                  'region': u['region'] ?? '',
                                  'company': u['company'] ?? '',
                                  'category': u['category'] ?? '',
                                  'subRole': u['subRole'] ?? '',
                                  'dealerCode': u['dealerCode'] ?? '',
                                });
                              },
                            );
                          }),
                        ],
                      ),
                    ),
                  ],

                  // 5. Seçilen Alıcılar Listesi (Modern Chips Görünümü)
                  if (_selectedReceiversList.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    const Text('Seçilen Alıcılar:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: textMuted)),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: List.generate(_selectedReceiversList.length, (index) {
                        final r = _selectedReceiversList[index];
                        final isBulk = r['type'] == 'bulk';
                        final isManager = r['subRole'] == 'manager';
                        final isColleague = r['category'] == _currentUserData?['category'] && r['region'] == _currentUserData?['region'];

                        // Dinamik çiplerin görsel tasarımı
                        Color chipBg = primary;
                        Color chipText = Colors.white;
                        IconData icon = Icons.person_rounded;
                        Border? chipBorder;

                        if (isBulk) {
                          chipBg = const Color(0xFF0284C7); // Sky Blue
                          icon = Icons.people_alt_rounded;
                        } else if (isManager) {
                          chipBg = const Color(0xFF0F172A); // Slate 900
                          chipText = Colors.white;
                          icon = Icons.military_tech_rounded; // Gold/Tie simülasyonu
                        } else if (isColleague) {
                          chipBg = const Color(0xFFF0FDF4); // Light Green
                          chipText = const Color(0xFF15803D);
                          chipBorder = Border.all(color: const Color(0xFFBBF7D0));
                          icon = Icons.handshake_rounded;
                        } else {
                          chipBg = primarySoft;
                          chipText = primary;
                          chipBorder = Border.all(color: const Color(0xFFD2EBEB));
                        }

                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: chipBg,
                            borderRadius: BorderRadius.circular(10),
                            border: chipBorder,
                            boxShadow: const [
                              BoxShadow(color: Colors.black12, blurRadius: 2, offset: Offset(0, 1)),
                            ],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(icon, size: 14, color: chipText),
                              const SizedBox(width: 6),
                              Text(
                                r['name'],
                                style: TextStyle(color: chipText, fontWeight: FontWeight.bold, fontSize: 11),
                              ),
                              // Toplu Grubu Genişletme (Dağıtma) Butonu
                              if (isBulk) ...[
                                const SizedBox(width: 6),
                                GestureDetector(
                                  onTap: () => _expandBulk(index),
                                  child: Icon(Icons.zoom_out_map_rounded, size: 14, color: chipText.withOpacity(0.9)),
                                ),
                              ],
                              const SizedBox(width: 6),
                              GestureDetector(
                                onTap: () {
                                  setState(() {
                                    _selectedReceiversList.removeAt(index);
                                  });
                                },
                                child: Icon(Icons.cancel_rounded, size: 14, color: chipText.withOpacity(0.9)),
                              ),
                            ],
                          ),
                        );
                      }),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),

            // ==========================================
            // KART 2: KONU VE MESAJ ALANI
            // ==========================================
            _buildCard(
              label: 'MESAJ BİLGİLERİ',
              icon: Icons.edit_note_rounded,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Konu Girişi
                  TextField(
                    controller: _subjectCtrl,
                    style: const TextStyle(color: textMain, fontSize: 14, fontWeight: FontWeight.bold),
                    decoration: _inputDecoration(
                      hint: 'E-posta konusunu girin...',
                      prefixIcon: Icons.title_rounded,
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Mesaj Girişi
                  Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: border),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: TextField(
                      controller: _bodyCtrl,
                      maxLines: null,
                      minLines: 8,
                      style: const TextStyle(color: textMain, fontSize: 14, height: 1.5),
                      decoration: const InputDecoration(
                        hintText: 'Mesajınızı buraya yazın...',
                        hintStyle: TextStyle(color: textMuted),
                        border: InputBorder.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  // Yapay Zeka ile Düzenleme Butonu
                  Align(
                    alignment: Alignment.centerRight,
                    child: ElevatedButton.icon(
                      onPressed: _isAISuggesting ? null : _suggestSubjectWithAI,
                      icon: _isAISuggesting
                          ? const SizedBox(
                              width: 14, height: 14,
                              child: CircularProgressIndicator(strokeWidth: 1.5, color: Colors.white),
                            )
                          : const Icon(Icons.auto_awesome_rounded, size: 16, color: Colors.white),
                      label: Text(
                        _isAISuggesting ? 'AI Düzenliyor...' : 'AI ile Düzenle',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.white),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primary,
                        elevation: 0,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // ==========================================
            // KART 3: DOSYA EKİ PANELİ
            // ==========================================
            _buildCard(
              label: 'DOSYA EKİ (.PDF, .PNG, vb.)',
              icon: Icons.attach_file_rounded,
              child: Row(
                children: [
                  ElevatedButton.icon(
                    onPressed: _pickFile,
                    icon: const Icon(Icons.upload_file_rounded, size: 18, color: primary),
                    label: const Text('Dosya Seç', style: TextStyle(color: primary, fontWeight: FontWeight.bold, fontSize: 12)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primarySoft,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _attachedFileName ?? 'Ekli dosya yok',
                      style: TextStyle(
                        color: _attachedFileName != null ? textMain : textMuted,
                        fontSize: 12,
                        fontWeight: _attachedFileName != null ? FontWeight.bold : FontWeight.normal,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (_attachedFileName != null)
                    IconButton(
                      icon: const Icon(Icons.cancel_rounded, color: danger, size: 20),
                      onPressed: () {
                        setState(() {
                          _attachedFileBytes = null;
                          _attachedFileName = null;
                        });
                      },
                    ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // ==========================================
            // AKSİYON: GÖNDERME BUTONU
            // ==========================================
            SizedBox(
              height: 52,
              child: ElevatedButton.icon(
                onPressed: (_isSending || _isUploadingFile) ? null : _sendMessage,
                icon: (_isSending || _isUploadingFile)
                    ? const SizedBox(
                        width: 18, height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send_rounded, color: Colors.white),
                label: Text(
                  _isUploadingFile
                      ? 'Dosya Yükleniyor...'
                      : (_isSending ? 'Gönderiliyor...' : 'Mesajı Gönder'),
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: primary,
                  elevation: 2,
                  shadowColor: primary.withOpacity(0.3),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
              ),
            ),
          ],
        ),
      ),
    ));
  }

  // Premium Görsel Bölüm Kartları
  Widget _buildCard({required String label, required IconData icon, required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 8, offset: const Offset(0, 4)),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Kart Başlığı
          Row(
            children: [
              Icon(icon, color: primary, size: 18),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  color: Color(0xFF334155),
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                  letterSpacing: 0.8,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }

  // Premium Input Tasarımı
  InputDecoration _inputDecoration({required String hint, required IconData prefixIcon, bool enabled = true}) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: textMuted, fontSize: 13),
      prefixIcon: Icon(prefixIcon, color: textMuted, size: 18),
      filled: true,
      fillColor: enabled ? const Color(0xFFF8FAFC) : const Color(0xFFF1F5F9),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: primary, width: 1.5),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: border),
      ),
    );
  }
}
