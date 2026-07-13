import 'dart:convert';
import 'package:http/http.dart' as http;

class AIService {
  static const String _cohereUrl = "https://api.cohere.ai/v1/chat";
  static const List<String> _cohereKeys = [
    "XcEa1sBkZn8M29BMRwKWVVB5ES1PZsIQzNjkjjtI2zMCaf",
    "BxXIPk5YNRlkYMk4kMffyqGIA4PjkIarA1qimodt12RPUS",
    "SIMp9lNijXKnlEFzYRwo1MK5EV9RsnbBVWzHsKiQ"
  ];

  static Future<Map<String, dynamic>> _cohereRequest(String message, String preamble) async {
    for (var i = 0; i < _cohereKeys.length; i++) {
      try {
        final key = _cohereKeys[i];
        final body = {
          'message': message,
          'preamble': preamble,
          'model': 'command-nightly'
        };

        final response = await http.post(
          Uri.parse(_cohereUrl),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $key',
          },
          body: jsonEncode(body),
        );

        if (response.statusCode != 200) {
          continue; // try next key
        }

        final data = jsonDecode(response.body);
        if (data['text'] != null) {
          return {'text': data['text'].toString().trim(), 'error': null};
        }
      } catch (e) {
        if (i == _cohereKeys.length - 1) {
          return {'text': null, 'error': e.toString()};
        }
      }
    }
    return {'text': null, 'error': 'Tüm anahtarlar başarısız oldu.'};
  }

  static String _buildThreadText(String subject, String senderName, String receiverName, String content, List<dynamic> replies) {
    var text = "Konu: $subject\nGönderen: $senderName\nAlıcı: $receiverName\nMesaj:\n$content\n";
    if (replies.isNotEmpty) {
      text += "\n── Yanıtlar ──\n";
      for (var i = 0; i < replies.length; i++) {
        final r = replies[i];
        if (r['isSystem'] != true) {
          text += "[${i + 1}] ${r['authorName']}: ${r['text']}\n";
        }
      }
    }
    return text;
  }

  static Future<List<String>> getReplySuggestionsWithAI({
    required String subject,
    required String senderName,
    required String receiverName,
    required String content,
    required List<dynamic> replies,
  }) async {
    final threadText = _buildThreadText(subject, senderName, receiverName, content, replies);
    const preamble = """Sen, Bellona IntraMail Hub platformu için akıllı hızlı yanıt önerileri üreten uzman bir yapay zekasın.
Görevlerin:
1. Sana iletilen e-posta yazışmasını ve geçmiş tüm yanıtları oku.
2. ÇOK ÖNEMLİ: Özellikle yazışmadaki EN SON GELEN e-postaya doğrudan yanıt niteliğinde öneriler üret. Öneri son mesaja doğrudan cevap olmalı, bağlamla uyumlu, son derece nazik, kurumsal ve mantıklı olmalıdır.
3. Dil ve Üslup: Her zaman resmi, kibar, profesyonel kurumsal Türkçe kullan. Günlük kelimeler veya laubali ifadeler kesinlikle yasaktır.
4. Örneğin: Son mesaj "İlgili birime iletilmiştir" veya "İşlemlerinizi başlattık" gibi bir bilgilendirmeyse, buna doğrudan cevap olarak "Teşekkür eder, iyi çalışmalar dilerim.", "Bilgilendirme için teşekkürler.", "Süreci yakından takip ediyoruz." gibi nazik ve takipçi yanıtlar öner. Asla alakasız, genel geçer veya jenerik şablonlar üretme.
5. Her yanıt önerisi maksimum 4-6 kelime olmalıdır.
6. Çıktın KESİNLİKLE sadece geçerli ve temiz bir JSON dizisi (Array) formatında olmalıdır. Başka hiçbir açıklama, giriş veya çıkış kelimesi yazma.

Örnek Çıktı:
["Detayları inceleyip dönüş yapacağım.", "Siparişi onaylıyorum.", "Yarın toplantıda görüşelim."]""";

    final prompt = "Şu yazışma geçmişine ve özellikle gelen son e-postaya doğrudan yanıt olacak, kurumsal ve bağlamı takip eden 3 kısa yanıt önerisi oluştur:\n\n$threadText";
    final result = await _cohereRequest(prompt, preamble);
    if (result['text'] != null) {
      try {
        final cleanText = result['text'].toString().replaceAll('```json', '').replaceAll('```', '').trim();
        final List<dynamic> parsed = jsonDecode(cleanText);
        return parsed.map((e) => e.toString()).take(3).toList();
      } catch (e) {
        // Parse error fallback
      }
    }
    return ["Detayları inceleyip bilgi vereceğim.", "Teşekkürler, iyi çalışmalar.", "Konuyu ilgili birimle görüşüyorum."];
  }

  static Future<List<String>> getDetailedReplyDraftsWithAI({
    required String subject,
    required String senderName,
    required String receiverName,
    required String content,
    required List<dynamic> replies,
  }) async {
    final threadText = _buildThreadText(subject, senderName, receiverName, content, replies);
    const preamble = """Sen, Bellona IntraMail Hub platformu için detaylı e-posta cevap taslakları hazırlayan uzman bir kurumsal asistan yapay zekasın.
Görevlerin:
1. Sana iletilen e-posta yazışmasını, konu başlığını ve geçmişte karşılıklı yazılmış olan tüm iletileri oku.
2. ÇOK ÖNEMLİ: Özellikle yazışmadaki EN SON GELEN e-postaya doğrudan yanıt niteliğinde taslaklar üret. Taslaklar son mesaja doğrudan cevap olmalı, bağlamla tam uyumlu, nazik ve mantıklı olmalıdır.
3. Dil ve Üslup: Her zaman resmi, saygılı, kurumsal ve profesyonel Türkçe kullan. "Saygılarımla", "İyi çalışmalar dilerim" gibi kurumsal nezaket ifadeleri mutlaka yer almalıdır.
4. Örneğin: Son mesaj "İlgili birime iletilmiştir" veya "İşlemlerinizi başlattık" gibi bir bilgilendirmeyse, buna doğrudan cevap olarak "Geri bildiriminiz ve bilgilendirmeniz için teşekkür ederim. Süreci takip ederek en kısa sürede tarafınıza dönüş sağlayacağım, iyi çalışmalar dilerim." veya "Konuya dair verdiğiniz bilgi için teşekkürler, gelişmeleri takip ediyor olacağız." gibi nazik ve takipçi yanıtlar oluştur. Asla alakasız veya genel geçer şablonlar üretme.
5. Taslaklardan biri olumlu/net bir dönüş/yanıt olmalı; diğeri ise konunun incelenmesi, alternatif önerilmesi veya ek süre/bilgi/teşekkür içermelidir.
6. Her bir taslak 2-4 profesyonel kurumsal cümleden oluşmalı, saygılı ve akıcı olmalıdır.
7. Çıktın KESİNLİKLE sadece geçerli ve temiz bir JSON dizisi (Array) formatında olmalıdır. Başka hiçbir açıklama, giriş veya çıkış kelimesi yazma.

Örnek Çıktı:
["İletmiş olduğunuz ayrıntıları detaylıca inceledim. Talebinizi onaylıyorum, gün içerisinde ilgili işlemler tamamlanarak tarafınıza bilgi aktarılacaktır.", "Göndermiş olduğunuz e-posta için teşekkürler. Bahsettiğiniz konuyu ilgili departmanımız ile paylaşıp inceleme başlattık. En kısa sürede dönüş sağlayacağız."]""";

    final prompt = "Şu yazışma geçmişine ve özellikle gelen son e-postaya doğrudan yanıt olacak, son derece kurumsal, nazik, baştan savma olmayan ve bağlamla doğrudan ilişkili 2 farklı detaylı Türkçe cevap taslağı oluştur:\n\n$threadText";
    final result = await _cohereRequest(prompt, preamble);
    if (result['text'] != null) {
      try {
        final cleanText = result['text'].toString().replaceAll('```json', '').replaceAll('```', '').trim();
        final List<dynamic> parsed = jsonDecode(cleanText);
        return parsed.map((e) => e.toString()).take(2).toList();
      } catch (e) {
        // Parse error fallback
      }
    }
    return [
      "İletiniz tarafımıza ulaştı. Detaylı bir inceleme gerçekleştirdikten sonra en kısa süre içerisinde size dönüş sağlayacağız. İyi çalışmalar dileriz.",
      "Konuyla ilgili talebinizi aldık ve gerekli birimlerimize ilettik. En geç yarın mesai bitimine kadar sizi bilgilendirmiş olacağız."
    ];
  }

  static Future<String> refineMessageWithAI(String originalText, String receiverName, String senderName, String senderCompany) async {
    final prompt = "Alıcı: $receiverName\nGönderen: $senderName\nŞirket: $senderCompany\nMetin: \"$originalText\"\n\nLütfen sadece düzenlenmiş nihai metni döndür.";
    const preamble = """Sen, "IntraMail Hub" platformuna entegre edilmiş uzman bir metin düzenleme ve e-posta yazım asistanısın.
Görevin: Kullanıcının taslak halinde, kaba, karışık veya günlük dille yazdığı metinleri alıp, BİZZAT KULLANICININ AĞZINDAN KURUMSAL BİR E-POSTA olarak YENİDEN YAZMAKTIR.

ÇOK ÖNEMLİ UYARI:
- Sen kullanıcının sorusuna veya mesajına CEVAP VERMİYORSUN!
- Müşteri temsilcisi rolüne BÜRÜNME.
- Görevin, kullanıcının yazdığı metni "Alıcı"ya gönderilecek resmi bir e-postaya dönüştürmektir. Metni her zaman Gönderen'in (kullanıcının) ağzından yaz.

Çıktı Formatın KESİNLİKLE VE SADECE şu şekilde olmalıdır:

Konu: [E-postanın Konusu]

Sayın [Alıcı Adı],

[Metin]

Saygılarımla,
[Gönderen Adı]
[Şirket / Departman]""";

    final result = await _cohereRequest(prompt, preamble);
    if (result['error'] != null) {
      throw Exception(result['error']);
    }
    return result['text'] ?? "Mesaj düzenlenirken bir hata oluştu.";
  }

  static Future<String> summarizeThreadWithAI({
    required String subject,
    required String senderName,
    required String receiverName,
    required String content,
    required List<dynamic> replies,
  }) async {
    final threadText = _buildThreadText(subject, senderName, receiverName, content, replies);
    const preamble = """Sen üst düzey bir kurumsal yönetici asistanısın. Sana iletilen e-posta yazışmasını 3-4 cümlelik akıcı bir paragraf halinde özetle.
Bunu yaparken:
- Olayın ana konusunu ve sürecin içinde kimlerin yer aldığını (kişileri) kısaca belirt.
- Her detaya girmek yerine sadece sürecin nasıl bağlandığına (karar, tarih, sipariş adedi vb.) ve bir sonraki adıma odaklan.
- Çok kısa veya çok uzun olmasın; okuyan yönetici süreci ve kişileri anlayabilsin ama gereksiz detaylarla yorulmasın.
Sohbet, selamlaşma veya giriş cümlesi KESİNLİKLE kullanma, doğrudan özet metnini ver.""";
    final prompt = "Şu yazışmayı özetle:\n\n$threadText";
    final result = await _cohereRequest(prompt, preamble);
    return result['text'] ?? "Özet oluşturulurken bir hata oluştu.";
  }
}

