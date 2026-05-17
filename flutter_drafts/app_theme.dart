import 'package:flutter/material.dart';

class AppTheme {
  // Web CSS değişkenlerimizle (inbox.css) birebir aynı renk paleti
  static const Color background = Color(0xFF1E1E1E); // --bg
  static const Color surface = Color(0xFF2C2C2C); // --surface
  static const Color primary = Color(0xFF00a4ad); // --primary (Turkuaz/Mavi)
  static const Color primaryHover = Color(0xFF00868d); // --primary-hover
  static const Color accent = Color(0xFF6B4EE6); // --accent (Mor)
  static const Color textMain = Color(0xFFFFFFFF); // --text-main
  static const Color textMuted = Color(0xFFB3B3B3); // --text-muted
  static const Color border = Color(0xFF3F3F3F); // --border
  static const Color danger = Color(0xFFE53935); // --danger

  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: background,
      primaryColor: primary,
      colorScheme: const ColorScheme.dark(
        primary: primary,
        secondary: accent,
        surface: surface,
        background: background,
        error: danger,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: surface,
        elevation: 0,
        centerTitle: true,
        iconTheme: IconThemeData(color: textMain),
        titleTextStyle: TextStyle(
          color: textMain,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: textMain,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10), // btn-primary border-radius
          ),
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
        ),
      ),
      cardTheme: CardTheme(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: border, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: background,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: primary, width: 2),
        ),
        labelStyle: const TextStyle(color: textMuted),
        hintStyle: const TextStyle(color: textMuted),
      ),
    );
  }
}
