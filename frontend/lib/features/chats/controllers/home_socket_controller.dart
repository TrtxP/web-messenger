// ignore_for_file: library_prefixes

import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';
import '../../../core/services/notification_service.dart';

class HomeSocketController {
  final Api api;
  final VoidCallback onChatsNeedsRefresh;
  final void Function(String chatId)? onChatDeleted;
  final void Function(bool isOffline) onConnectivityChanged;

  IO.Socket? _socket;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  bool _isDisposed = false;

  HomeSocketController({
    required this.api,
    required this.onChatsNeedsRefresh,
    this.onChatDeleted,
    required this.onConnectivityChanged,
  });

  Future<void> connect() async {
    if (_isDisposed) return;
    final token = await api.getToken();
    if (token == null || _isDisposed) return;

    _socket = IO.io(
      apiUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .build(),
    );

    _socket?.onConnect((_) => _onConnect());
    _socket?.onDisconnect((_) => _onDisconnect());

    _socket?.on('invitation:resolved', (data) {
      if (_isDisposed) return;
      final status = data is Map ? data['status'] : null;
      final name = (data is Map ? data['responderName'] : null) ?? 'User';

      if (status == 'accepted') {
        NotificationService().showSimpleNotification(
          title: 'Invitation accepted',
          body:
              'User $name accepted your invitation. Now you can chat with each other.',
        );
        onChatsNeedsRefresh();
      } else {
        NotificationService().showSimpleNotification(
          title: 'Invitation rejected',
          body: 'User $name rejected your invitation.',
        );
      }
    });

    _socket?.on('chat:deleted', (data) {
      if (_isDisposed) return;
      final deletedChatId = data is Map ? data['chatId']?.toString() : null;
      if (deletedChatId != null) {
        onChatDeleted?.call(deletedChatId);
      }
      onChatsNeedsRefresh();
    });

    _socket?.on('group:invitation', (_) {
      if (!_isDisposed) onChatsNeedsRefresh();
    });

    _socket?.on('group:member_updated', (_) {
      if (!_isDisposed) onChatsNeedsRefresh();
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
