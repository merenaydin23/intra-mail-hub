import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'user_detail_screen.dart';

class EmployeeDirectoryScreen extends StatefulWidget {
  const EmployeeDirectoryScreen({super.key});

  @override
  State<EmployeeDirectoryScreen> createState() =>
      _EmployeeDirectoryScreenState();
}

class _EmployeeDirectoryScreenState extends State<EmployeeDirectoryScreen> {
  String _search        = '';
  String _filterRole    = 'all';
  String _myCategory    = '';

  // ── Temel renk paleti ───────────────────────────────────────
  static const Color primary      = Color(0xFF00A4AD);
  static const Color primarySoft  = Color(0xFFEAF7F7);
  static const Color bgApp        = Color(0xFFF1F5F9);
  static const Color surface      = Colors.white;
  static const Color textMain     = Color(0xFF0C2D30);
  static const Color textMuted    = Color(0xFF5C7B7D);
  static const Color border       = Color(0xFFE0ECEC);
  static const Color gradStart    = Color(0xFF004D52);
  static const Color gradEnd      = Color(0xFF00828A);

  // ── Kategori renkleri ───────────────────────────────────────
  // Fabrika → Premium İndigo (Lacivert)
  static const Color factoryColor = Color(0xFF4338CA); // Indigo 700
  static const Color factorySoft  = Color(0xFFEEF2FF); // Indigo 50
  static const Color factoryBdr   = Color(0xFFC7D2FE); // Indigo 200
  // Bölge → Uyumlu Mavi
  static const Color regionColor  = Color(0xFF0284C7); // Light Blue 600
  static const Color regionSoft   = Color(0xFFE0F2FE); // Light Blue 100
  static const Color regionBdr    = Color(0xFFBAE6FD); // Light Blue 200
  // Bayi → Zümrüt Yeşili
  static const Color dealerColor  = Color(0xFF059669); // Emerald 600
  static const Color dealerSoft   = Color(0xFFD1FAE5); // Emerald 100
  static const Color dealerBdr    = Color(0xFFA7F3D0); // Emerald 200

  @override
  void initState() {
    super.initState();
    _fetchMyCategory();
  }

  /// Giriş yapan kullanıcının kategorisini çek → akıllı varsayılan filtre
  Future<void> _fetchMyCategory() async {
    try {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid == null) return;
      final doc = await FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .get();
      if (!doc.exists || !mounted) return;
      final cat = (doc.data()?['category'] ?? '').toString();
      setState(() {
        _myCategory = cat;
        // Varsayılan filtre: kendi kategorisi
        if (cat == 'factory')  _filterRole = 'factory';
        else if (cat == 'regional') _filterRole = 'regional';
        else if (cat == 'local')    _filterRole = 'local';
      });
    } catch (_) {}
  }

  // ── Yardımcı renk seçiciler ──────────────────────────────────
  Color _catColor(String cat) {
    switch (cat) {
      case 'factory':  return factoryColor;
      case 'regional': return regionColor;
      case 'local':    return dealerColor;
      default:         return primary;
    }
  }

  Color _catSoft(String cat) {
    switch (cat) {
      case 'factory':  return factorySoft;
      case 'regional': return regionSoft;
      case 'local':    return dealerSoft;
      default:         return primarySoft;
    }
  }

  Color _catBdr(String cat) {
    switch (cat) {
      case 'factory':  return factoryBdr;
      case 'regional': return regionBdr;
      case 'local':    return dealerBdr;
      default:         return border;
    }
  }

  IconData _catIcon(String cat) {
    switch (cat) {
      case 'factory':  return Icons.factory_rounded;
      case 'regional': return Icons.map_rounded;
      case 'local':    return Icons.store_rounded;
      default:         return Icons.person_rounded;
    }
  }

  String _catLabel(String cat, String subRole) {
    final isManager = subRole == 'manager';
    switch (cat) {
      case 'factory':
        return isManager ? 'FABRİKA YÖN.' : 'FABRİKA';
      case 'regional':
        return isManager ? 'BÖLGE YÖN.' : 'BÖLGE';
      case 'local':
        return isManager ? 'BAYİ SAHİBİ' : 'BAYİ PER.';
      default:
        return 'PERSONEL';
    }
  }

  // ── Türkçe harf normalize (sıralama için) ───────────────────
  String _normalize(String s) => s
      .toLowerCase()
      .replaceAll('ı', 'i')
      .replaceAll('ğ', 'g')
      .replaceAll('ü', 'u')
      .replaceAll('ş', 's')
      .replaceAll('ö', 'o')
      .replaceAll('ç', 'c');

  // ── Ana build ────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
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
        title: Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.18),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.white.withOpacity(0.25)),
            ),
            child: const Icon(Icons.people_alt_rounded,
                color: Colors.white, size: 20),
          ),
          const SizedBox(width: 10),
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Rehber',
                  style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 16)),
              Text('Organizasyon Dizini',
                  style: TextStyle(
                      color: Colors.white70,
                      fontWeight: FontWeight.w500,
                      fontSize: 10)),
            ],
          ),
        ]),
        iconTheme: const IconThemeData(color: Colors.white),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: TextField(
              onChanged: (v) => setState(() => _search = _normalize(v)),
              style: const TextStyle(color: textMain, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'İsim, şirket, bölge veya bayi kodu ara...',
                hintStyle:
                    const TextStyle(color: textMuted, fontSize: 13),
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
                    borderSide:
                        const BorderSide(color: primary, width: 1.5)),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
              ),
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          // ── Renkli kategori chip'leri ──────────────────────
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
            child: Row(
              children: [
                _chip('all',      'Tümü',    primary,      primarySoft,  Icons.apps_rounded),
                _chip('factory',  'Fabrika', factoryColor, factorySoft,  Icons.factory_rounded),
                _chip('regional', 'Bölge',   regionColor,  regionSoft,   Icons.map_rounded),
                _chip('local',    'Bayi',    dealerColor,  dealerSoft,   Icons.store_rounded),
              ],
            ),
          ),

          // ── Kullanıcı listesi ─────────────────────────────
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('users')
                  .snapshots(),
              builder: (ctx, snap) {
                if (!snap.hasData) {
                  return const Center(
                      child: CircularProgressIndicator(color: primary));
                }

                final uid = FirebaseAuth.instance.currentUser?.uid;

                // Kendini ve admin'leri filtrele
                var docs = snap.data!.docs.where((d) {
                  final data = d.data() as Map<String, dynamic>;
                  return d.id != uid && data['role'] != 'admin';
                }).toList();

                // Arama filtresi
                if (_search.isNotEmpty) {
                  docs = docs.where((d) {
                    final data = d.data() as Map<String, dynamic>;
                    final name = _normalize(
                        '${data['name'] ?? ''} ${data['surname'] ?? ''}');
                    final company = _normalize(
                        (data['company'] ?? data['firmName'] ?? '')
                            .toString());
                    final code = (data['dealerCode'] ?? '').toString();
                    final region =
                        _normalize((data['region'] ?? '').toString());
                    return name.contains(_search) ||
                        company.contains(_search) ||
                        code.contains(_search) ||
                        region.contains(_search);
                  }).toList();
                }

                // Kategori filtresi
                if (_filterRole != 'all') {
                  docs = docs.where((d) {
                    final data = d.data() as Map<String, dynamic>;
                    return data['category'] == _filterRole;
                  }).toList();
                }

                // A-Z alfabetik sıralama (Türkçe normalize)
                docs.sort((a, b) {
                  final dA = a.data() as Map<String, dynamic>;
                  final dB = b.data() as Map<String, dynamic>;
                  final nA = _normalize(
                      '${dA['name'] ?? ''} ${dA['surname'] ?? ''}');
                  final nB = _normalize(
                      '${dB['name'] ?? ''} ${dB['surname'] ?? ''}');
                  return nA.compareTo(nB);
                });

                if (docs.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(24),
                          decoration: const BoxDecoration(
                              color: primarySoft, shape: BoxShape.circle),
                          child: const Icon(Icons.person_search_rounded,
                              color: primary, size: 40),
                        ),
                        const SizedBox(height: 16),
                        const Text('Kullanıcı bulunamadı',
                            style: TextStyle(
                                color: textMuted,
                                fontSize: 15,
                                fontWeight: FontWeight.w600)),
                        const SizedBox(height: 6),
                        const Text('Arama kriterlerinizi değiştirin.',
                            style: TextStyle(
                                color: textMuted, fontSize: 12)),
                      ],
                    ),
                  );
                }

                return _buildAlphabeticalList(docs);
              },
            ),
          ),
        ],
      ),
    );
  }

  // ── Harf bazlı gruplu liste ───────────────────────────────────
  Widget _buildAlphabeticalList(
      List<QueryDocumentSnapshot> docs) {
    // İlk harfe göre grupla
    final Map<String, List<QueryDocumentSnapshot>> groups = {};
    for (final doc in docs) {
      final data = doc.data() as Map<String, dynamic>;
      final first = ((data['name'] ?? '') as String).trim();
      final letter = first.isNotEmpty ? first[0].toUpperCase() : '#';
      groups.putIfAbsent(letter, () => []).add(doc);
    }

    // Harfleri alfabetik sırala (Türkçe alfabesi)
    final sortedLetters = groups.keys.toList()
      ..sort((a, b) => _normalize(a).compareTo(_normalize(b)));

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
      itemCount: sortedLetters.length,
      itemBuilder: (_, i) {
        final letter = sortedLetters[i];
        final group = groups[letter]!;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Harf başlığı
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 14, 0, 6),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [gradStart, gradEnd],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Center(
                      child: Text(letter,
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                              fontSize: 13)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${group.length} kişi',
                    style: const TextStyle(
                        color: textMuted,
                        fontSize: 11,
                        fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
            ...group.map((doc) => _buildUserCard(doc)),
          ],
        );
      },
    );
  }

  // ── Kullanıcı kartı ───────────────────────────────────────────
  Widget _buildUserCard(QueryDocumentSnapshot doc) {
    final data    = doc.data() as Map<String, dynamic>;
    final name    = '${data['name'] ?? ''} ${data['surname'] ?? ''}'.trim();
    final cat     = (data['category'] ?? '').toString();
    final subRole = (data['subRole'] ?? '').toString();
    final company = (data['company'] ?? data['firmName'] ?? '').toString();
    final region  = (data['region'] ?? '').toString();
    final code    = (data['dealerCode'] ?? '').toString();

    final catC    = _catColor(cat);
    final catS    = _catSoft(cat);
    final catB    = _catBdr(cat);
    final label   = _catLabel(cat, subRole);
    final icon    = _catIcon(cat);
    final isMgr   = subRole == 'manager';

    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => UserDetailScreen(userId: doc.id, data: data),
        ),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: catB),
          boxShadow: [
            BoxShadow(
                color: catC.withOpacity(0.07),
                blurRadius: 8,
                offset: const Offset(0, 2)),
          ],
        ),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Sol renkli accent bar (kategori rengi)
              Container(
                width: 5,
                decoration: BoxDecoration(
                  color: catC,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(14),
                    bottomLeft: Radius.circular(14),
                  ),
                ),
              ),
              const SizedBox(width: 12),

              // Avatar
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: catS,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: (data['profileImageUrl'] != null && data['profileImageUrl'].toString().isNotEmpty)
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: data['profileImageUrl'].toString().startsWith('data:')
                                  ? Image.memory(
                                      base64Decode(data['profileImageUrl'].toString().split(',').last),
                                      fit: BoxFit.cover,
                                    )
                                  : Image.network(
                                      data['profileImageUrl'],
                                      fit: BoxFit.cover,
                                    ),
                            )
                          : Center(
                              child: Text(
                                name.isNotEmpty ? name[0].toUpperCase() : '?',
                                style: TextStyle(
                                    color: catC,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 20),
                              ),
                            ),
                    ),
                    // Yönetici rozeti
                    if (isMgr)
                      Positioned(
                        right: -4,
                        top: -4,
                        child: Container(
                          width: 16,
                          height: 16,
                          decoration: BoxDecoration(
                            color: catC,
                            shape: BoxShape.circle,
                            border: Border.all(
                                color: Colors.white, width: 1.5),
                          ),
                          child: const Icon(Icons.star_rounded,
                              color: Colors.white, size: 9),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 12),

              // İsim, şirket, bölge, kod
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(name,
                          style: const TextStyle(
                              color: textMain,
                              fontWeight: FontWeight.w700,
                              fontSize: 14),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                      if (company.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(company,
                            style: const TextStyle(
                                color: textMuted, fontSize: 11),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                      ],
                      const SizedBox(height: 5),
                      // Bölge + Kod satırı
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          if (region.isNotEmpty)
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.location_on_rounded,
                                    size: 10,
                                    color: catC.withOpacity(0.8)),
                                const SizedBox(width: 2),
                                Text(region,
                                    style: TextStyle(
                                        fontSize: 10,
                                        color: catC.withOpacity(0.85),
                                        fontWeight: FontWeight.w600)),
                              ],
                            ),
                          if (code.isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 5, vertical: 2),
                              decoration: BoxDecoration(
                                color: catS,
                                borderRadius: BorderRadius.circular(5),
                                border: Border.all(
                                    color: catC.withOpacity(0.35)),
                              ),
                              child: Text(
                                '#$code',
                                style: TextStyle(
                                    fontSize: 9,
                                    color: catC,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.6),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              // Sağ: renkli badge + chevron
              Padding(
                padding: const EdgeInsets.only(right: 10),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 4),
                      decoration: BoxDecoration(
                        color: catC,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(icon, size: 9, color: Colors.white),
                          const SizedBox(width: 3),
                          Text(label,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 8,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.4)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 6),
                    Icon(Icons.chevron_right_rounded,
                        color: catC.withOpacity(0.4), size: 18),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Renkli filtre chip'i ──────────────────────────────────────
  Widget _chip(String value, String label, Color color, Color soft,
      IconData icon) {
    final selected = _filterRole == value;
    return GestureDetector(
      onTap: () => setState(() => _filterRole = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        margin: const EdgeInsets.only(right: 8),
        padding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? color : surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: selected ? color : color.withOpacity(0.3),
              width: 1.5),
          boxShadow: selected
              ? [
                  BoxShadow(
                      color: color.withOpacity(0.3),
                      blurRadius: 8,
                      offset: const Offset(0, 3))
                ]
              : [],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 13,
                color: selected ? Colors.white : color.withOpacity(0.8)),
            const SizedBox(width: 5),
            Text(label,
                style: TextStyle(
                    color: selected ? Colors.white : textMuted,
                    fontSize: 12,
                    fontWeight: selected
                        ? FontWeight.w700
                        : FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}
