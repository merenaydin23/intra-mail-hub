import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

// [SUNUM NOTU]: Mobil Profil Ekranı
// Web'deki sidebar user-card + logout butonunun mobil karşılığıdır.
// Aynı Firebase 'users' koleksiyonundan kullanıcı bilgisini çeker.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  // Login ekranı ile aynı renk paleti
  static const Color primary    = Color(0xFF00A4AD);
  static const Color primarySoft = Color(0xFFEAF7F7);
  static const Color bgApp     = Color(0xFFF1F5F9);
  static const Color surface   = Colors.white;
  static const Color textMain  = Color(0xFF0C2D30);
  static const Color textMuted = Color(0xFF5C7B7D);
  static const Color border    = Color(0xFFE0ECEC);
  static const Color gradStart = Color(0xFF004D52);
  static const Color gradEnd   = Color(0xFF00828A);
  static const Color accentGold = Color(0xFFEAB308);

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

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
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.person_rounded, color: Colors.white, size: 20),
          ),
          const SizedBox(width: 10),
          const Text('Profilim',
              style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 17)),
        ]),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: StreamBuilder<DocumentSnapshot>(
        stream: FirebaseFirestore.instance
            .collection('users')
            .doc(user?.uid)
            .snapshots(),
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(
                child: CircularProgressIndicator(color: primary));
          }

          final data = snap.data?.data() as Map<String, dynamic>?;
          final name     = data?['name'] ?? 'Bilinmeyen';
          final surname  = data?['surname'] ?? '';
          final email    = data?['email'] ?? user?.email ?? '';
          final role     = data?['role'] ?? 'employee';
          final category = data?['category'] ?? '';
          final company  = data?['company'] ?? data?['firmName'] ?? '';
          final fullName = '$name $surname'.trim();
          final profileUrl = data?['profileImageUrl'] as String?;

          // Rol etiketi — web'deki .user-role ile aynı
          String roleLabel = role.toUpperCase();
          if (role == 'employee')   roleLabel = 'ÇALIŞAN';
          if (role == 'factory')    roleLabel = 'FABRİKA';
          if (role == 'regional')   roleLabel = 'BÖLGE';
          if (role == 'local')      roleLabel = 'YEREL BAYİ';

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                const SizedBox(height: 12),

                // Avatar — web .user-avatar ile aynı stil
                Container(
                  width: 130,
                  height: 130,
                  decoration: BoxDecoration(
                    color: primarySoft,
                    shape: BoxShape.circle,
                    border: Border.all(
                        color: primary.withOpacity(0.3), width: 4),
                  ),
                  child: (profileUrl != null && profileUrl.isNotEmpty)
                      ? ClipOval(
                          child: profileUrl.startsWith('data:')
                              ? Image.memory(
                                  base64Decode(profileUrl.split(',').last),
                                  fit: BoxFit.cover,
                                )
                              : Image.network(
                                  profileUrl,
                                  fit: BoxFit.cover,
                                ),
                        )
                      : Center(
                          child: Text(
                            name.isNotEmpty ? name[0].toUpperCase() : 'U',
                            style: const TextStyle(
                                fontSize: 42,
                                fontWeight: FontWeight.w900,
                                color: primary),
                          ),
                        ),
                ),
                const SizedBox(height: 16),

                // İsim
                Text(fullName,
                    style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        color: textMain)),
                const SizedBox(height: 6),

                // Rol badge — web .nav-item.active badge gibi
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 5),
                  decoration: BoxDecoration(
                    color: primarySoft,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: primary.withOpacity(0.3)),
                  ),
                  child: Text(roleLabel,
                      style: const TextStyle(
                          color: primary,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.2)),
                ),
                const SizedBox(height: 32),

                // Bilgi kartları — web .user-card ile aynı
                _infoCard(Icons.email_outlined, 'E-posta', email),
                const SizedBox(height: 12),
                if (company.isNotEmpty) ...[
                  _infoCard(Icons.business_rounded, 'Şirket', company),
                  const SizedBox(height: 12),
                ],
                if (category.isNotEmpty) ...[
                  _infoCard(Icons.location_on_rounded, 'Bölge / Kategori',
                      category.toUpperCase()),
                  const SizedBox(height: 12),
                ],
                _infoCard(Icons.badge_rounded, 'Kullanıcı Rolü', roleLabel),
                const SizedBox(height: 32),

                // Şifre Değiştir butonu
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: ElevatedButton.icon(
                    onPressed: () => _showChangePasswordDialog(context),
                    icon: const Icon(Icons.key_rounded, color: Colors.white),
                    label: const Text('Şifre Değiştir',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.bold)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primary,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16)),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Çıkış butonu — web'deki logout-sm gibi
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: ElevatedButton.icon(
                    onPressed: () => _confirmLogout(context),
                    icon: const Icon(Icons.logout_rounded,
                        color: Colors.white),
                    label: const Text('Oturumu Kapat',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.bold)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFF43F5E),
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16)),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _infoCard(IconData icon, String label, String value) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.02),
              blurRadius: 8,
              offset: const Offset(0, 2))
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: primarySoft,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: primary, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        color: textMuted,
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 3),
                Text(value,
                    style: const TextStyle(
                        color: textMain,
                        fontSize: 14,
                        fontWeight: FontWeight.w700)),
              ],
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
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20)),
        title: const Text('Çıkış Yap',
            style: TextStyle(
                fontWeight: FontWeight.w800, color: Color(0xFF0C2D30))),
        content: const Text(
            'Oturumunuzu kapatmak istediğinize emin misiniz?',
            style: TextStyle(color: Color(0xFF5C7B7D))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('İptal',
                style: TextStyle(color: Color(0xFF5C7B7D))),
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
            child: const Text('Çıkış Yap',
                style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showChangePasswordDialog(BuildContext context) {
    final currentPwController = TextEditingController();
    final newPwController = TextEditingController();
    final confirmPwController = TextEditingController();
    bool isUpdating = false;
    String? statusMessage;
    bool isSuccess = false;

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              backgroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
              title: const Row(
                children: [
                  Icon(Icons.vpn_key_rounded, color: primary, size: 28),
                  SizedBox(width: 8),
                  Text(
                    "Şifre Değiştir",
                    style: TextStyle(color: textMain, fontWeight: FontWeight.bold, fontSize: 18),
                  ),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      "Lütfen mevcut şifrenizi ve yeni şifrenizi girin. Güncelleme işlemi anında sisteme yansıyacaktır.",
                      style: TextStyle(color: textMuted, fontSize: 13, height: 1.4),
                    ),
                    const SizedBox(height: 20),
                    const Text("Mevcut Şifre", style: TextStyle(color: textMain, fontSize: 13, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: currentPwController,
                      obscureText: true,
                      style: const TextStyle(color: textMain, fontSize: 14, fontWeight: FontWeight.w600),
                      decoration: InputDecoration(
                        hintText: "••••••••",
                        hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                        filled: true,
                        fillColor: bgApp,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.transparent),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: primary, width: 2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text("Yeni Şifre", style: TextStyle(color: textMain, fontSize: 13, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: newPwController,
                      obscureText: true,
                      style: const TextStyle(color: textMain, fontSize: 14, fontWeight: FontWeight.w600),
                      decoration: InputDecoration(
                        hintText: "••••••••",
                        hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                        filled: true,
                        fillColor: bgApp,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.transparent),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: primary, width: 2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text("Yeni Şifre Tekrar", style: TextStyle(color: textMain, fontSize: 13, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: confirmPwController,
                      obscureText: true,
                      style: const TextStyle(color: textMain, fontSize: 14, fontWeight: FontWeight.w600),
                      decoration: InputDecoration(
                        hintText: "••••••••",
                        hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                        filled: true,
                        fillColor: bgApp,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.transparent),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: primary, width: 2),
                        ),
                      ),
                    ),
                    if (statusMessage != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: isSuccess ? const Color(0xFFECFDF5) : const Color(0xFFFEF2F2),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: isSuccess ? const Color(0xFFD1FAE5) : const Color(0xFFFEE2E2)),
                        ),
                        child: Text(
                          statusMessage!,
                          style: TextStyle(
                            color: isSuccess ? const Color(0xFF065F46) : const Color(0xFF991B1B),
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: isUpdating ? null : () => Navigator.pop(context),
                  child: const Text("İptal", style: TextStyle(color: textMuted, fontWeight: FontWeight.bold)),
                ),
                ElevatedButton(
                  onPressed: isUpdating || isSuccess
                      ? null
                      : () async {
                          final currentPw = currentPwController.text;
                          final newPw = newPwController.text;
                          final confirmPw = confirmPwController.text;

                          if (currentPw.isEmpty || newPw.isEmpty || confirmPw.isEmpty) {
                            setState(() {
                              statusMessage = "Lütfen tüm alanları doldurun.";
                              isSuccess = false;
                            });
                            return;
                          }

                          if (newPw != confirmPw) {
                            setState(() {
                              statusMessage = "Yeni şifreler uyuşmuyor!";
                              isSuccess = false;
                            });
                            return;
                          }

                          if (newPw.length < 6) {
                            setState(() {
                              statusMessage = "Yeni şifre en az 6 karakter olmalıdır.";
                              isSuccess = false;
                            });
                            return;
                          }

                          setState(() {
                            isUpdating = true;
                            statusMessage = null;
                          });

                          try {
                            final user = FirebaseAuth.instance.currentUser;
                            if (user != null && user.email != null) {
                              final credential = EmailAuthProvider.credential(
                                email: user.email!,
                                password: currentPw,
                              );
                              await user.reauthenticateWithCredential(credential);
                              await user.updatePassword(newPw);
                              await FirebaseFirestore.instance
                                  .collection('users')
                                  .doc(user.uid)
                                  .update({'password': newPw});

                              setState(() {
                                statusMessage = "Şifreniz başarıyla güncellendi!";
                                isSuccess = true;
                              });

                              Future.delayed(const Duration(seconds: 2), () {
                                if (context.mounted) {
                                  Navigator.pop(context);
                                }
                              });
                            } else {
                              setState(() {
                                statusMessage = "Kullanıcı oturumu bulunamadı.";
                                isSuccess = false;
                              });
                            }
                          } catch (e) {
                            setState(() {
                              statusMessage = "Hata: Mevcut şifreniz yanlış veya bir sorun oluştu.";
                              isSuccess = false;
                            });
                          } finally {
                            setState(() {
                              isUpdating = false;
                            });
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: isUpdating
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        )
                      : const Text("Güncelle", style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ],
            );
          },
        );
      },
    );
  }
}
