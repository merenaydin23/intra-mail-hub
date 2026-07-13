import 'package:cloud_firestore/cloud_firestore.dart';

class MessageModel {
  final String id;
  final String senderId;
  final String senderName;
  final String subject;
  final String content;
  final DateTime? timestamp;
  final String type;
  final String? attachmentUrl;
  final String? attachmentName;
  final bool isRead;

  MessageModel({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.subject,
    required this.content,
    this.timestamp,
    required this.type,
    this.attachmentUrl,
    this.attachmentName,
    this.isRead = false,
  });

  factory MessageModel.fromMap(Map<String, dynamic> data, String documentId) {
    return MessageModel(
      id: documentId,
      senderId: data['senderId'] ?? '',
      senderName: data['senderName'] ?? 'Bilinmeyen Gönderici',
      subject: data['subject'] ?? '',
      content: data['content'] ?? data['body'] ?? '',
      timestamp: data['timestamp'] != null ? (data['timestamp'] as Timestamp).toDate() : null,
      type: data['type'] ?? 'chat',
      attachmentUrl: data['attachmentUrl'],
      attachmentName: data['attachmentName'],
      isRead: data['isRead'] ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'senderId': senderId,
      'senderName': senderName,
      'subject': subject,
      'content': content,
      'timestamp': FieldValue.serverTimestamp(),
      'type': type,
    };
  }
}


