import 'package:flutter/material.dart';

class AppColors {
  static const Color primary = Color(0xFF00828A);
  static const Color background = Color(0xFFF5F9F9);
  static const Color surface = Colors.white;
  static const Color textMain = Color(0xFF0C2D30);
  static const Color textSecondary = Color(0xFF5C7B7D);
  static const Color border = Color(0xFFE0ECEC);
}

class AppTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      brightness: Brightness.light,
      primaryColor: AppColors.primary,
      scaffoldBackgroundColor: AppColors.background,
      fontFamily: 'Inter',
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.surface,
        elevation: 2,
        iconTheme: IconThemeData(color: AppColors.textMain),
        titleTextStyle: TextStyle(
          color: AppColors.textMain,
          fontSize: 18,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}


