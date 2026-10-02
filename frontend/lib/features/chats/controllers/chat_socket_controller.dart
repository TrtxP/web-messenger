// ignore_for_file: library_prefixes

import 'dart:async';
import 'dart:math';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';

class ChatSocketController {
  final String chatId;
  final void Function(String userId, String username, String? activity)
      onChatActivityChanged;
  final void Function(String messageId, String status, String? targetChatId)
      onMessageStatusUpdated;
  final void Function(String deletedChatId) onChatDeleted;
  final void Function(bool isOffline) onConnectivityChanged;

  IO.Socket? _socket;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  bool _isDisposed = false;

  ChatSocketController({
    required this.chatId,
    required this.onMessageStatusUpdated,
    required this.onChatDeleted,
    required this.onConnectivityChanged,
    required this.onChatActivityChanged,
  });

  Future<void> connect() async {
    if (_isDisposed) return;
    final token = await Api().getToken();
    if (token == null || _isDisposed) return;

    final socketUrl =
        apiUrl.endsWith('/messenger') ? apiUrl : '$apiUrl/messenger';
    _socket = IO.io(
      socketUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .build(),
    );

    _socket?.onConnect((_) => _onConnect());
    _socket?.onDisconnect((_) => _onDisconnect());

    _socket?.on('message:status_updated', (data) {
      if (_isDisposed) return;
      if (data is Map && data['messageId'] != null && data['status'] != null) {
        final targetChatId = data['chatId']?.toString();
        final msgId = data['messageId'].toString();
        final newStatus = data['status'].toString();
        onMessageStatusUpdated(msgId, newStatus, targetChatId);
      }
    });

    _socket?.on('chat:deleted', (data) {
      if (_isDisposed) return;
      final deletedChatId = data is Map ? data['chatId']?.toString() : null;
      if (deletedChatId != null) {
        onChatDeleted(deletedChatId);
      }
    });

    _socket?.on('chat:activity', (data) {
      if (_isDisposed) return;
      if (data is Map && data['chatId']?.toString() == chatId) {
        final userId = data['userId']?.toString() ?? '';
        final username = data['username']?.toString() ?? 'User';
        final activity = data['activity']?.toString();
        onChatActivityChanged.call(userId, username, activity);
      }
    });
  }

  void _onConnect() {
    _reconnectAttempts = 0;
    _reconnectTimer?.cancel();
    if (!_isDisposed) onConnectivityChanged(false);
  }

  void _onDisconnect() {
    if (!_isDisposed) onConnectivityChanged(true);
    if (_isDisposed) return;
    _reconnectTimer?.cancel();
    final delay = Duration(
      milliseconds: min(1000 * pow(2, _reconnectAttempts).toInt(), 30000),
    );
    _reconnectTimer = Timer(delay, () {
      if (_isDisposed) return;
      _reconnectAttempts++;
      _socket?.connect();
      connect();
    });
  }

  void dispose() {
    _isDisposed = true;
    _reconnectTimer?.cancel();
    _socket?.clearListeners();
    _socket?.disconnect();
    _socket?.dispose();
  }
}
