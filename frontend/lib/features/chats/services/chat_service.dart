import '../../../core/network/api_client.dart';

class ChatService {
  ChatService({Api? api}) : _api = api ?? Api();

  final Api _api;

  Future<List<dynamic>> fetchMessages(String chatId) async {
    final list = await _api.get('/chats/$chatId/messages');
    return List<dynamic>.from(list);
  }

  Future<Map<String, dynamic>> fetchPartnerPresence(String chatId) async {
    final result = await _api.get('/chats/$chatId/presence');
    if (result.isNotEmpty && result.first is Map) {
      return Map<String, dynamic>.from(result.first as Map);
    }
    return const {};
  }

  Future<void> updateChatActivity(String chatId, String? activity) async {
    await _api.post('/chats/$chatId/activity', {'activity': activity});
  }

  Future<void> markMessagesDelivered(String chatId) async {
    await _api.post('/chats/$chatId/delivered', {});
  }

  Future<void> markChatRead(String chatId) async {
    await _api.post('/chats/$chatId/read', {});
  }

  Future<void> deleteChat(String chatId) async {
    await _api.delete('/chats/$chatId');
  }

  Future<Map<String, dynamic>> sendMessage(
    String chatId,
    String content,
    String type, {
    String? mediaId,
  }) async {
    final res = await _api.post('/chats/$chatId/messages', {
      'content': content,
      'type': type,
      if (mediaId != null) 'mediaId': mediaId,
    });
    return res;
  }

  Future<Map<String, dynamic>> editMessage(
    String chatId,
    String msgId,
    String newContent,
  ) async {
    final res = await _api.put('/chats/$chatId/messages/$msgId', {
      'content': newContent,
    });
    return res;
  }

  Future<Map<String, dynamic>> deleteMessage(
    String chatId,
    String msgId,
  ) async {
    final res = await _api.delete('/chats/$chatId/messages/$msgId');
    return res;
  }

  Future<void> toggleMute(String chatId, bool muted) async {
    await _api.post('/chats/$chatId/mute', {'muted': muted});
  }

  Future<void> sendTyping(String chatId) async {
    try {
      await _api.post('/chats/$chatId/typing', {'isTyping': true});
    } catch (_) {}
  }

  Future<Map<String, dynamic>> uploadMedia(
    List<int> bytes,
    String filename,
  ) async {
    final res = await _api.uploadFile(
      '/media/upload',
      'media',
      bytes,
      filename,
    );
    return res;
  }

  String formatMediaStreamUrl(String mediaId) {
    return _api.formatUrl('/media/stream/$mediaId?token=${Api.token ?? ''}');
  }
}
