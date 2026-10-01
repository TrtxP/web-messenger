import 'dart:async';
import '../services/chat_service.dart';


class ChatPresenceController {
  final String chatId;
  final bool isGroupChat;
  final ChatService chatService;
  final void Function(bool isOnline, String? activity, DateTime? lastSeenAt)
      onPartnerPresenceChanged;

  Timer? _presenceRefreshTimer;
  Timer? _typingDebounceTimer;
  Timer? _activityHeartbeatTimer;
  String? _myActivity;
  bool _isDisposed = false;

  ChatPresenceController({
    required this.chatId,
    required this.isGroupChat,
    required this.chatService,
    required this.onPartnerPresenceChanged,
  });

  String? get myActivity => _myActivity;

  void init() {
    if (isGroupChat || chatId.isEmpty) return;
    refreshContactPresence();
    _presenceRefreshTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => refreshContactPresence(),
    );
  }

  Future<void> refreshContactPresence() async {
    if (chatId.isEmpty || isGroupChat || _isDisposed) return;
    try {
      final presence = await chatService.fetchPartnerPresence(chatId);
      final isOnline = presence['isOnline'] == true;
      final activity = presence['activity']?.toString();
      final lastSeenAt =
          DateTime.tryParse(presence['lastSeenAt']?.toString() ?? '');
      if (!_isDisposed) {
        onPartnerPresenceChanged(isOnline, activity, lastSeenAt);
      }
    } catch (_) {}
  }

  void onTextChanged(String value) {
    if (value.trim().isEmpty) {
      _typingDebounceTimer?.cancel();
      if (_myActivity == 'typing') unawaited(setMyActivity(null));
      return;
    }
    unawaited(setMyActivity('typing'));
    _typingDebounceTimer?.cancel();
    _typingDebounceTimer = Timer(const Duration(milliseconds: 1800), () {
      if (_myActivity == 'typing') unawaited(setMyActivity(null));
    });
  }

  Future<void> setMyActivity(String? activity) async {
    if (_isDisposed) return;
    _myActivity = activity;
    if (activity == null) {
      _activityHeartbeatTimer?.cancel();
      _activityHeartbeatTimer = null;
    } else {
      _activityHeartbeatTimer ??=
          Timer.periodic(const Duration(seconds: 4), (_) {
        final current = _myActivity;
        if (current != null && !_isDisposed) {
          unawaited(chatService.updateChatActivity(chatId, current));
        }
      });
    }
    try {
      await chatService.updateChatActivity(chatId, activity);
    } catch (_) {}
  }

  void dispose() {
    _isDisposed = true;
    _presenceRefreshTimer?.cancel();
    _typingDebounceTimer?.cancel();
    _activityHeartbeatTimer?.cancel();
    if (_myActivity != null && chatId.isNotEmpty) {
      unawaited(chatService.updateChatActivity(chatId, null));
    }
  }
}
