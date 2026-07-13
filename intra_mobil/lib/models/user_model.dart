class UserModel {
  final String uid;
  final String name;
  final String email;
  final String role;
  final String category;

  UserModel({
    required this.uid,
    required this.name,
    required this.email,
    required this.role,
    required this.category,
  });

  factory UserModel.fromMap(Map<String, dynamic> data, String documentId) {
    return UserModel(
      uid: documentId,
      name: data['name'] ?? 'Bilinmeyen Kullanıcı',
      email: data['email'] ?? '',
      role: data['role'] ?? 'employee',
      category: data['category'] ?? 'local',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'name': name,
      'email': email,
      'role': role,
      'category': category,
    };
  }
}


