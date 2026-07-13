import 'package:flutter/material.dart';
import 'inbox_screen.dart';
import 'compose_screen.dart';
import 'employee_directory_screen.dart';
import 'profile_screen.dart';

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;

  static const Color primary  = Color(0xFF00A4AD);
  static const Color navBg    = Color(0xFF002E31);
  static const Color navMuted = Color(0xFF6BADB2);

  static const List<_NavDef> _navDefs = [
    _NavDef(icon: Icons.inbox_rounded,      label: 'Mesajlar'),
    _NavDef(icon: Icons.people_alt_rounded, label: 'Rehber'),
    _NavDef(icon: Icons.person_rounded,     label: 'Profil'),
  ];

  final List<Widget> _screens = const [
    InboxScreen(),
    EmployeeDirectoryScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),

      bottomNavigationBar: _PremiumNavBar(
        currentIndex: _currentIndex,
        navDefs: _navDefs,
        navBg: navBg,
        onTap: (i) => setState(() => _currentIndex = i),
      ),
    );
  }
}

// ── Veri sınıfı ────────────────────────────────────────────
class _NavDef {
  final IconData icon;
  final String label;
  const _NavDef({required this.icon, required this.label});
}

// ── Premium nav bar widget ──────────────────────────────────
class _PremiumNavBar extends StatelessWidget {
  final int currentIndex;
  final List<_NavDef> navDefs;
  final Color navBg;
  final ValueChanged<int> onTap;

  const _PremiumNavBar({
    required this.currentIndex,
    required this.navDefs,
    required this.navBg,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      child: SafeArea(
        top: false,
        child: Container(
          height: 68,
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            boxShadow: [
              BoxShadow(
                color: Color(0x0F000000),
                blurRadius: 16,
                offset: Offset(0, -4),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Row(
            children: List.generate(navDefs.length, (i) {
              final selected = currentIndex == i;
              return Expanded(
                child: _NavTile(
                  icon: navDefs[i].icon,
                  label: navDefs[i].label,
                  selected: selected,
                  onTap: () => onTap(i),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

// ── Tek bir nav tile ────────────────────────────────────────
class _NavTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _NavTile({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  static const Color activeColor = Color(0xFF00828A);
  static const Color mutedColor  = Color(0xFF94A3B8);
  static const Color pillColor   = Color(0xFFEAF7F7);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // İkon + pill arka plan
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            padding: const EdgeInsets.symmetric(
              horizontal: 20,
              vertical: 6,
            ),
            decoration: BoxDecoration(
              color: selected
                  ? pillColor
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(16),
            ),
            child: AnimatedScale(
              scale: selected ? 1.05 : 1.0,
              duration: const Duration(milliseconds: 200),
              child: Icon(
                icon,
                color: selected ? activeColor : mutedColor,
                size: 24,
              ),
            ),
          ),

          const SizedBox(height: 5),

          // Label
          AnimatedDefaultTextStyle(
            duration: const Duration(milliseconds: 200),
            style: TextStyle(
              fontSize: 10,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color: selected ? activeColor : mutedColor,
              letterSpacing: selected ? 0.1 : 0,
            ),
            child: Text(label, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }
}
