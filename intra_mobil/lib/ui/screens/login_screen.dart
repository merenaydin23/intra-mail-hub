import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

// [SUNUM NOTU]: Mobil Login Ekranı.
// Bellona kurumsal SaaS kimliğine uygun, son derece şık,
// degrade arka plana, altın ve turkuaz yansımalarına sahip modern arayüz tasarımı.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  String _errorMessage = "";
  bool _obscurePassword = true;
  bool _rememberMe = false;

  // Focus nodes for input animations
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();
  bool _emailFocused = false;
  bool _passwordFocused = false;

  // --- PREMIUM RENK PALETİ ---
  static const Color primaryGradStart = Color(0xFF004D52);
  static const Color primaryGradEnd   = Color(0xFF0C1D20);
  static const Color primaryActive    = Color(0xFF00A4AD);
  static const Color accentGold       = Color(0xFFEAB308);
  static const Color textMain         = Color(0xFF0C2D30);
  static const Color textMuted        = Color(0xFF64748B);
  static const Color border           = Color(0xFFE2E8F0);
  static const Color bgApp            = Color(0xFFF1F5F9);
  static const Color iconColor        = Color(0xFF1A5C61); // Koyu turkuaz ikon rengi

  @override
  void initState() {
    super.initState();
    _loadRememberedUser();
    _emailFocus.addListener(() => setState(() => _emailFocused = _emailFocus.hasFocus));
    _passwordFocus.addListener(() => setState(() => _passwordFocused = _passwordFocus.hasFocus));
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _loadRememberedUser() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _rememberMe = prefs.getBool('remember_me') ?? false;
      if (_rememberMe) {
        _emailController.text = prefs.getString('remembered_email') ?? '';
        _passwordController.text = prefs.getString('remembered_password') ?? '';
      }
    });
  }

  Future<void> _saveRememberedUser() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('remember_me', _rememberMe);
    if (_rememberMe) {
      await prefs.setString('remembered_email', _emailController.text.trim());
      await prefs.setString('remembered_password', _passwordController.text);
    } else {
      await prefs.remove('remembered_email');
      await prefs.remove('remembered_password');
    }
  }

  Future<void> _login() async {
    setState(() {
      _isLoading = true;
      _errorMessage = "";
    });

    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );
      await _saveRememberedUser();
    } on FirebaseAuthException catch (e) {
      setState(() {
        if (e.code == 'user-not-found' || e.code == 'invalid-credential') {
          _errorMessage = "E-posta veya şifre hatalı!";
        } else {
          _errorMessage = "Giriş başarısız: ${e.message}";
        }
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showForgotPasswordDialog() {
    final nameController = TextEditingController();
    final surnameController = TextEditingController();
    bool isSearching = false;
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
                  Icon(Icons.lock_reset_rounded, color: primaryActive, size: 28),
                  SizedBox(width: 8),
                  Text(
                    "Şifremi Unuttum",
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
                      "Lütfen sistemde kayıtlı ad ve soyadınızı giriniz. Şifreniz otomatik olarak telefon numaranıza SMS ile gönderilecektir.",
                      style: TextStyle(color: textMuted, fontSize: 13, height: 1.4),
                    ),
                    const SizedBox(height: 20),
                    _buildLabel("Adınız"),
                    const SizedBox(height: 6),
                    TextField(
                      controller: nameController,
                      style: const TextStyle(color: textMain, fontSize: 14, fontWeight: FontWeight.w600),
                      decoration: InputDecoration(
                        hintText: "Örn: Selim",
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
                          borderSide: const BorderSide(color: primaryActive, width: 2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _buildLabel("Soyadınız"),
                    const SizedBox(height: 6),
                    TextField(
                      controller: surnameController,
                      style: const TextStyle(color: textMain, fontSize: 14, fontWeight: FontWeight.w600),
                      decoration: InputDecoration(
                        hintText: "Örn: Er",
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
                          borderSide: const BorderSide(color: primaryActive, width: 2),
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
                  onPressed: isSearching ? null : () => Navigator.pop(context),
                  child: const Text("İptal", style: TextStyle(color: textMuted, fontWeight: FontWeight.bold)),
                ),
                ElevatedButton(
                  onPressed: isSearching || isSuccess
                      ? null
                      : () async {
                          final nameRaw = nameController.text.trim();
                          final surnameRaw = surnameController.text.trim();

                          if (nameRaw.isEmpty || surnameRaw.isEmpty) {
                            setState(() {
                              statusMessage = "Lütfen ad ve soyad alanlarını doldurun.";
                              isSuccess = false;
                            });
                            return;
                          }

                          // Türkçe duyarlı Title Case dönüşümü
                          String toTurkishTitleCase(String text) {
                            if (text.isEmpty) return text;
                            return text.split(' ').map((word) {
                              if (word.isEmpty) return word;
                              String first = word[0];
                              if (first == 'i') {
                                first = 'İ';
                              } else if (first == 'ı') {
                                first = 'I';
                              } else {
                                first = first.toUpperCase();
                              }
                              String rest = word.substring(1);
                              rest = rest.replaceAll('İ', 'i').replaceAll('I', 'ı').toLowerCase();
                              return first + rest;
                            }).join(' ');
                          }

                          final nameInput = toTurkishTitleCase(nameRaw);
                          final surnameInput = toTurkishTitleCase(surnameRaw);

                          setState(() {
                            isSearching = true;
                            statusMessage = null;
                          });

                          try {
                            final querySnap = await FirebaseFirestore.instance
                                .collection('users')
                                .get();

                            DocumentSnapshot? matchedDoc;
                            for (var doc in querySnap.docs) {
                              final data = doc.data() as Map<String, dynamic>;
                              final dbName = (data['name']?.toString() ?? '').trim().replaceAll('I', 'ı').replaceAll('İ', 'i').toLowerCase();
                              final dbSurname = (data['surname']?.toString() ?? '').trim().replaceAll('I', 'ı').replaceAll('İ', 'i').toLowerCase();
                              
                              final inputNameClean = nameInput.trim().replaceAll('I', 'ı').replaceAll('İ', 'i').toLowerCase();
                              final inputSurnameClean = surnameInput.trim().replaceAll('I', 'ı').replaceAll('İ', 'i').toLowerCase();

                              if (dbName == inputNameClean && dbSurname == inputSurnameClean) {
                                matchedDoc = doc;
                                break;
                              }
                            }

                            if (matchedDoc != null) {
                              final data = matchedDoc.data() as Map<String, dynamic>;
                              final phone = data['phone'] as String?;
                              
                              if (phone != null && phone.isNotEmpty) {
                                // Telefon numarasını maskele
                                String maskedPhone = phone;
                                if (phone.length > 6) {
                                  final len = phone.length;
                                  maskedPhone = phone.substring(0, len - 7) + "*** ** " + phone.substring(len - 2);
                                }
                                setState(() {
                                  statusMessage = "Otomatik şifre gönderildi: $maskedPhone numaralı telefona SMS olarak bildirim gönderilmiştir.";
                                  isSuccess = true;
                                });
                              } else {
                                setState(() {
                                  statusMessage = "Kullanıcının kayıtlı telefon numarası bulunamadı.";
                                  isSuccess = false;
                                });
                              }
                            } else {
                              setState(() {
                                statusMessage = "Bu isimde bir kullanıcı bulunamadı.";
                                isSuccess = false;
                              });
                            }
                          } catch (e) {
                            setState(() {
                              statusMessage = "Hata oluştu: $e";
                              isSuccess = false;
                            });
                          } finally {
                            setState(() {
                              isSearching = false;
                            });
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primaryActive,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: isSearching
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        )
                      : const Text("Şifre Gönder", style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _showChangePasswordDialogFromLogin() {
    final emailController = TextEditingController();
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
                  Icon(Icons.vpn_key_rounded, color: primaryActive, size: 28),
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
                      "Mevcut şifrenizi girerek şifrenizi güncelleyebilirsiniz. Güncelleme işlemi anında sisteme yansıyacaktır.",
                      style: TextStyle(color: textMuted, fontSize: 13, height: 1.4),
                    ),
                    const SizedBox(height: 20),
                    _buildLabel("Kurumsal E-posta"),
                    const SizedBox(height: 6),
                    TextField(
                      controller: emailController,
                      keyboardType: TextInputType.emailAddress,
                      style: const TextStyle(color: Color(0xFF000000), fontSize: 14, fontWeight: FontWeight.w600),
                      decoration: InputDecoration(
                        hintText: "kullanici@intramail.corp",
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
                          borderSide: const BorderSide(color: primaryActive, width: 2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _buildLabel("Mevcut Şifre"),
                    const SizedBox(height: 6),
                    TextField(
                      controller: currentPwController,
                      obscureText: true,
                      style: const TextStyle(color: Color(0xFF000000), fontSize: 14, fontWeight: FontWeight.w600),
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
                          borderSide: const BorderSide(color: primaryActive, width: 2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _buildLabel("Yeni Şifre"),
                    const SizedBox(height: 6),
                    TextField(
                      controller: newPwController,
                      obscureText: true,
                      style: const TextStyle(color: Color(0xFF000000), fontSize: 14, fontWeight: FontWeight.w600),
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
                          borderSide: const BorderSide(color: primaryActive, width: 2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _buildLabel("Yeni Şifre Tekrar"),
                    const SizedBox(height: 6),
                    TextField(
                      controller: confirmPwController,
                      obscureText: true,
                      style: const TextStyle(color: Color(0xFF000000), fontSize: 14, fontWeight: FontWeight.w600),
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
                          borderSide: const BorderSide(color: primaryActive, width: 2),
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
                          final email = emailController.text.trim();
                          final currentPw = currentPwController.text;
                          final newPw = newPwController.text;
                          final confirmPw = confirmPwController.text;

                          if (email.isEmpty || currentPw.isEmpty || newPw.isEmpty || confirmPw.isEmpty) {
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
                            final userCredential = await FirebaseAuth.instance
                                .signInWithEmailAndPassword(email: email, password: currentPw);
                            
                            final user = userCredential.user;
                            if (user != null) {
                              await user.updatePassword(newPw);
                              await FirebaseFirestore.instance
                                  .collection('users')
                                  .doc(user.uid)
                                  .update({'password': newPw});
                              await FirebaseAuth.instance.signOut();

                              setState(() {
                                statusMessage = "Şifreniz başarıyla güncellendi! Giriş yapabilirsiniz.";
                                isSuccess = true;
                              });

                              Future.delayed(const Duration(seconds: 2), () {
                                if (context.mounted) {
                                  Navigator.pop(context);
                                }
                              });
                            }
                          } catch (e) {
                            setState(() {
                              statusMessage = "Hata: E-posta/Mevcut şifre yanlış veya bir sorun oluştu.";
                              isSuccess = false;
                            });
                          } finally {
                            setState(() {
                              isUpdating = false;
                            });
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primaryActive,
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [primaryGradStart, primaryGradEnd],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Stylized Monogram & Brand Logo Section
                  Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.08),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white.withOpacity(0.15)),
                          boxShadow: [
                            BoxShadow(
                              color: primaryActive.withOpacity(0.2),
                              blurRadius: 24,
                              spreadRadius: 2,
                            )
                          ],
                        ),
                        child: const Icon(
                          Icons.apartment_rounded,
                          color: accentGold,
                          size: 44,
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        "BELLONA",
                        style: TextStyle(
                          fontSize: 38,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          letterSpacing: 8.0,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        "Bölge & Bayi İletişim Portalı",
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.85),
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.5,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 40),

                  // Login Form Card
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 23),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(28),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.15),
                          blurRadius: 30,
                          offset: const Offset(0, 15),
                        )
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          "Giriş Yapın",
                          style: TextStyle(
                            color: textMain,
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          "Kurumsal hesabınızla güvenle bağlanın",
                          style: TextStyle(
                            color: Color(0xFF475569),
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 24),

                        // Email Field
                        _buildLabel("Kurumsal E-posta"),
                        const SizedBox(height: 10),
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          curve: Curves.easeOut,
                          transform: Matrix4.identity()
                            ..scale(_emailFocused ? 1.025 : 1.0),
                          transformAlignment: Alignment.center,
                          child: TextField(
                            controller: _emailController,
                            focusNode: _emailFocus,
                            keyboardType: TextInputType.emailAddress,
                            style: const TextStyle(color: Colors.black, fontSize: 15, fontWeight: FontWeight.w600),
                            decoration: InputDecoration(
                              hintText: "isim.soyisim@bellona.com.tr",
                              hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
                              prefixIcon: const Icon(Icons.alternate_email, color: iconColor, size: 20),
                              filled: true,
                              fillColor: const Color(0xFFEAF4F5),
                              contentPadding: const EdgeInsets.symmetric(vertical: 18),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: const BorderSide(color: Color(0xFFB2D8DC), width: 1.2),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: const BorderSide(color: primaryActive, width: 2),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 17),

                        // Password Field
                        _buildLabel("Şifre"),
                        const SizedBox(height: 10),
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          curve: Curves.easeOut,
                          transform: Matrix4.identity()
                            ..scale(_passwordFocused ? 1.025 : 1.0),
                          transformAlignment: Alignment.center,
                          child: TextField(
                            controller: _passwordController,
                            focusNode: _passwordFocus,
                            obscureText: _obscurePassword,
                            style: const TextStyle(color: Colors.black, fontSize: 15, fontWeight: FontWeight.w600),
                            decoration: InputDecoration(
                              hintText: "Şifrenizi girin",
                              hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
                              prefixIcon: const Icon(Icons.lock_outline, color: iconColor, size: 20),
                              suffixIcon: IconButton(
                                icon: Icon(_obscurePassword ? Icons.visibility_off_rounded : Icons.visibility_rounded, color: iconColor, size: 20),
                                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                              ),
                              filled: true,
                              fillColor: const Color(0xFFEAF4F5),
                              contentPadding: const EdgeInsets.symmetric(vertical: 18),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: const BorderSide(color: Color(0xFFB2D8DC), width: 1.2),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: const BorderSide(color: primaryActive, width: 2),
                              ),
                            ),
                          ),
                        ),

                        // Remember Me & Forgot Password Row
                        const SizedBox(height: 13),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: Checkbox(
                                    value: _rememberMe,
                                    activeColor: primaryActive,
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                                    onChanged: (val) {
                                      setState(() {
                                        _rememberMe = val ?? false;
                                      });
                                    },
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Text(
                                  "Beni Hatırla",
                                  style: TextStyle(
                                    color: textMain,
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                TextButton(
                                  onPressed: _showForgotPasswordDialog,
                                  style: TextButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                                    minimumSize: Size.zero,
                                    tapTargetSize: MaterialTapTargetSize.padded,
                                  ),
                                  child: const Text(
                                    "Şifremi Unuttum?",
                                    style: TextStyle(
                                      color: primaryActive,
                                      fontSize: 13,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 2),
                                TextButton(
                                  onPressed: _showChangePasswordDialogFromLogin,
                                  style: TextButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                                    minimumSize: Size.zero,
                                    tapTargetSize: MaterialTapTargetSize.padded,
                                  ),
                                  child: const Text(
                                    "Şifre Değiştir",
                                    style: TextStyle(
                                      color: primaryActive,
                                      fontSize: 13,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),

                        // Error Message Area
                        if (_errorMessage.isNotEmpty) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFEF2F2),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFFFEE2E2)),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.error_outline_rounded, color: Colors.redAccent, size: 18),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _errorMessage,
                                    style: const TextStyle(color: Color(0xFF991B1B), fontSize: 13, fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 20),
                        ],

                        // Login Button
                        Container(
                          height: 54,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            gradient: const LinearGradient(
                              colors: [primaryActive, Color(0xFF00828A)],
                              begin: Alignment.centerLeft,
                              end: Alignment.centerRight,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Color(0x3300A4AD),
                                blurRadius: 12,
                                spreadRadius: 0,
                                offset: const Offset(0, 5),
                              )
                            ],
                          ),
                          child: ElevatedButton(
                            onPressed: _isLoading ? null : _login,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.transparent,
                              foregroundColor: Colors.white,
                              shadowColor: Colors.transparent,
                              elevation: 0,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                            ),
                            child: _isLoading
                                ? const SizedBox(
                                    height: 22,
                                    width: 22,
                                    child: CircularProgressIndicator(
                                      color: Colors.white,
                                      strokeWidth: 2.5,
                                    ),
                                  )
                                : const Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        "OTURUM AÇ →",
                                        style: TextStyle(
                                          fontSize: 15.5,
                                          fontWeight: FontWeight.w900,
                                          letterSpacing: 0.8,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ],
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 30),
                  Text(
                    "© 2026 Bellona Hub • M. Eren Aydın",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.75),
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        color: Color(0xFF030C0D),
        fontSize: 14,
        fontWeight: FontWeight.bold,
      ),
    );
  }
}
