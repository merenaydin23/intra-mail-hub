import 'dart:convert';
import 'package:flutter/material.dart';
import 'compose_screen.dart';

class UserDetailScreen extends StatelessWidget {
  final String userId;
  final Map<String, dynamic> data;

  const UserDetailScreen({
    super.key,
    required this.userId,
    required this.data,
  });

  // ─── Renk paleti ─────────────────────────────────────────
  static const Color gradStart   = Color(0xFF004D52);
  static const Color gradEnd     = Color(0xFF00828A);
  static const Color primary     = Color(0xFF00A4AD);
  static const Color primarySoft = Color(0xFFEAF7F7);
  static const Color bgApp       = Color(0xFFF1F5F9);
  static const Color surface     = Colors.white;
  static const Color textMain    = Color(0xFF0C2D30);
  static const Color textMuted   = Color(0xFF5C7B7D);
  static const Color border      = Color(0xFFE0ECEC);

  // ─── Rol etiketi (web roleLabel() ile aynı) ──────────────
  static String _roleLabel(String role) {
    const map = {
      'factory'       : 'Fabrika',
      'regional'      : 'Bölge',
      'local'         : 'Bayi Sahibi',
      'local_employee': 'Personel',
      'admin'         : 'Sistem Admin',
    };
    return map[role] ?? role.toUpperCase();
  }

  static Color _roleColor(String role) {
    switch (role) {
      case 'factory':        return const Color(0xFF0EA5E9);
      case 'regional':       return const Color(0xFF8B5CF6);
      case 'local':          return const Color(0xFF10B981);
      case 'local_employee': return const Color(0xFFF59E0B);
      default:               return primary;
    }
  }

  // ─── Yardımcı getter'lar ──────────────────────────────────
  String get _name =>
      '${data['name'] ?? ''} ${data['surname'] ?? ''}'.trim();
  String get _initial =>
      _name.isNotEmpty ? _name[0].toUpperCase() : '?';
  String get _role     => data['role']       ?? '';
  String get _category => data['category']   ?? _role;
  String get _email    => data['email']      ?? '';
  String get _company  => data['company']    ?? data['firmName'] ?? '';
  String get _dept     => data['department'] ?? '';
  String get _subRole  => data['subRole']    ?? '';
  bool   get _isActive => data['isActive']   ?? false;

  @override
  Widget build(BuildContext context) {
    final roleColor = _roleColor(_role);

    return Scaffold(
      backgroundColor: bgApp,

      // ── AppBar ───────────────────────────────────────────
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
        title: const Text(
          'Kullanıcı Detayı',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            fontSize: 17,
          ),
        ),
      ),

      // ── Mesaj gönder FAB ─────────────────────────────────
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ComposeScreen(
              preSelectedReceiverId:   userId,
              preSelectedReceiverName: _name,
            ),
          ),
        ),
        backgroundColor: primary,
        elevation: 8,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        icon: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
        label: const Text(
          'Mesaj Gönder',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            fontSize: 14,
          ),
        ),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,

      body: SingleChildScrollView(
        padding: const EdgeInsets.only(bottom: 100),
        child: Column(
          children: [
            // ── Header kartı (gradient arka plan) ────────────
            Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [gradStart, gradEnd],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
              ),
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 36),
              child: Column(
                children: [
                  // Avatar
                  Container(
                    width: 90,
                    height: 90,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white.withOpacity(0.4), width: 3),
                    ),
                    child: (data['profileImageUrl'] != null && data['profileImageUrl'].toString().isNotEmpty)
                        ? ClipOval(
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
                              _initial,
                              style: const TextStyle(
                                fontSize: 40,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                              ),
                            ),
                          ),
                  ),
                  const SizedBox(height: 14),

                  // İsim
                  Text(
                    _name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),

                  // Rol badge + aktif badge
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.18),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.white.withOpacity(0.3)),
                        ),
                        child: Text(
                          _roleLabel(_role),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                        decoration: BoxDecoration(
                          color: _isActive
                              ? const Color(0xFF10B981).withOpacity(0.25)
                              : Colors.red.withOpacity(0.25),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: _isActive
                                ? const Color(0xFF10B981).withOpacity(0.5)
                                : Colors.red.withOpacity(0.5),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 7,
                              height: 7,
                              decoration: BoxDecoration(
                                color: _isActive ? const Color(0xFF10B981) : Colors.redAccent,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 5),
                            Text(
                              _isActive ? 'Aktif' : 'Pasif',
                              style: TextStyle(
                                color: _isActive ? const Color(0xFF6EE7B7) : const Color(0xFFFCA5A5),
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // ── Bilgi kartları ───────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionTitle('İletişim'),
                  _infoCard([
                    if (_email.isNotEmpty)
                      _infoRow(Icons.alternate_email_rounded, 'E-posta', _email, roleColor),
                    if (_company.isNotEmpty)
                      _infoRow(Icons.business_rounded, 'Şirket / Bayi', _company, roleColor),
                  ]),

                  const SizedBox(height: 16),
                  _sectionTitle('Görev Bilgileri'),
                  _infoCard([
                    _infoRow(Icons.badge_rounded, 'Rol', _roleLabel(_role), roleColor),
                    if (_category.isNotEmpty)
                      _infoRow(Icons.category_rounded, 'Kategori', _category.toUpperCase(), roleColor),
                    if (_dept.isNotEmpty)
                      _infoRow(Icons.work_rounded, 'Departman', _dept, roleColor),
                    if (_subRole.isNotEmpty)
                      _infoRow(Icons.manage_accounts_rounded, 'Alt Görev',
                          _subRole == 'manager' ? 'Yönetici' : 'Personel', roleColor),
                  ]),

                  const SizedBox(height: 16),
                  _sectionTitle('Durum'),
                  _infoCard([
                    _infoRow(
                      _isActive ? Icons.check_circle_rounded : Icons.cancel_rounded,
                      'Hesap Durumu',
                      _isActive ? 'Aktif' : 'Pasif',
                      _isActive ? const Color(0xFF10B981) : Colors.redAccent,
                    ),
                  ]),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8),
        child: Text(
          title,
          style: const TextStyle(
            color: textMuted,
            fontSize: 12,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
          ),
        ),
      );

  Widget _infoCard(List<Widget> rows) {
    final visible = rows.where((w) => w is! SizedBox).toList();
    if (visible.isEmpty) return const SizedBox.shrink();
    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: List.generate(rows.length, (i) {
          return Column(
            children: [
              rows[i],
              if (i < rows.length - 1)
                Divider(height: 1, indent: 56, endIndent: 16, color: border),
            ],
          );
        }),
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value, Color iconColor) =>
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: iconColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: iconColor, size: 18),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      color: textMuted,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    style: const TextStyle(
                      color: textMain,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
