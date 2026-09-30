import 'dart:io';
import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_messenger/core/network/api_client.dart';
import '../../features/chats/widgets/notification_permission_dialog.dart';

Future<void> _processNotificationAction(String actionId) async {
  final api = Api();

  if (actionId.startsWith('accept_')) {
    final inviteId = actionId.replaceFirst('accept_', '');
    try {
      debugPrint('[NotificationService] Accepting invitation $inviteId');
      await api.post('/invitations/$inviteId/accept', {});
    } catch (e) {
      debugPrint('[NotificationService] Error accepting invitation: $e');
    }
  } else if (actionId.startsWith('decline_')) {
    final inviteId = actionId.replaceFirst('decline_', '');
    try {
      debugPrint('[NotificationService] Declining invitation $inviteId');
      await api.post('/invitations/$inviteId/decline', {});
    } catch (e) {
      debugPrint('[NotificationService] Error declining invitation: $e');
    }
  }
}

@pragma('vm:entry-point')
void notificationTapBackground(NotificationResponse response) async {
  WidgetsFlutterBinding.ensureInitialized();
  final actionId = response.actionId;
  if (actionId != null && actionId.isNotEmpty) {
    await _processNotificationAction(actionId);
  }
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
  } catch (_) {}

  final data = message.data;
  final type = data['type'] ?? '';

  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('user');
    if (raw != null) {
      final map = jsonDecode(raw) as Map;
      final myId = (map['id'] ?? (map['user'] as Map?)?['id'])?.toString();
      final senderId = data['senderId']?.toString();
      if (myId != null && senderId != null && senderId == myId) {
        return;
      }
    }
  } catch (_) {}

  if (type == 'invitation_received') {
    final invitationId = data['invitationId'] ?? '';
    final senderName = data['senderName'] ?? 'Someone';
    await NotificationService().showInvitationNotification(
      invitationId: invitationId,
      senderName: senderName,
    );
  } else if (type == 'invitation_accepted' || type == 'invitation_declined') {
    final title =
        data['title'] ?? message.notification?.title ?? 'Invitation update';
    final body = data['body'] ?? message.notification?.body ?? '';
    await NotificationService().showSimpleNotification(
      title: title,
      body: body,
    );
  } else if (type == 'chat_message') {
    final chatId = data['chatId']?.toString() ?? '';
    final senderName = data['senderName'] ?? 'New message';
    final content =
        data['body'] ?? data['content'] ?? message.notification?.body ?? '';
    final msgType = data['messageType'] ?? 'TEXT';

    if (chatId.isNotEmpty) {
      try {
        await Api().post('/chats/$chatId/delivered', {});
      } catch (_) {}
    }

    await NotificationService().showChatMessageNotification(
      chatId: chatId,
      senderName: senderName,
      content: content,
      type: msgType,
    );
  }
}

class NotificationController {
  @pragma('vm:entry-point')
  static Future<void> onActionReceivedMethod(String? chatId) async {
    if (chatId != null && chatId.isNotEmpty && chatId != 'invitations') {
      await NotificationService().markChatAsRead(chatId);
      NotificationService.navigateToChat(chatId);
    }
  }
}

class NotificationService {
  NotificationService._internal();
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;

  final FlutterLocalNotificationsPlugin _notificationsPlugin =
      FlutterLocalNotificationsPlugin();

  static GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
  static String? activeChatId;
  static String? currentUserId;
  bool _isInitialized = false;
  bool _isFirebaseInitialized = false;

  static Future<String?> getCurrentUserId() async {
    if (currentUserId != null) return currentUserId;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('user');
    if (raw == null) return null;
    final map = jsonDecode(raw) as Map;
    return (map['id'] ?? (map['user'] as Map?)?['id'])?.toString();
  }

  bool get isPlatformSupported {
    if (kIsWeb) return false;
    return Platform.isAndroid ||
        Platform.isIOS ||
        Platform.isWindows ||
        Platform.isLinux ||
        Platform.isMacOS;
  }

  String formatNotificationContent({
    required String type,
    required String content,
  }) {
    switch (type.toUpperCase()) {
      case 'IMAGE':
        return '📷 Photo';
      case 'VIDEO':
        return '🎥 Video Message';
      case 'AUDIO':
        return '🎤 Audio Message';
      case 'TEXT':
      default:
        return content.isNotEmpty ? content : 'New message';
    }
  }

  String formatInvitationContent({required String senderName}) {
    return 'User $senderName sent you a chat invitation';
  }

  bool shouldShowNotification({
    required bool isMuted,
    required bool isChatActive,
    required bool isSenderBlocked,
  }) {
    if (isMuted || isChatActive || isSenderBlocked) {
      return false;
    }
    return true;
  }

  Future<void> initialize({GlobalKey<NavigatorState>? navKey}) async {
    if (_isInitialized) return;
    if (navKey != null) {
      navigatorKey = navKey;
    }

    try {
      const androidSettings =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      const darwinSettings = DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );
      const linuxSettings =
          LinuxInitializationSettings(defaultActionName: 'Open chat');
      const windowsSettings = WindowsInitializationSettings(
        appName: 'Mobile Messenger',
        appUserModelId: 'com.example.mobile_messenger',
        guid: '27040409-7704-4c40-9d0d-773a4b087093',
      );

      const initSettings = InitializationSettings(
        android: androidSettings,
        iOS: darwinSettings,
        macOS: darwinSettings,
        linux: linuxSettings,
        windows: windowsSettings,
      );

      await _notificationsPlugin.initialize(
        settings: initSettings,
        onDidReceiveNotificationResponse:
            (NotificationResponse response) async {
          final actionId = response.actionId;
          final payload = response.payload;

          if (actionId != null && actionId.isNotEmpty) {
            await _processNotificationAction(actionId);
            return;
          }

          if (payload != null && payload.isNotEmpty) {
            NotificationController.onActionReceivedMethod(payload);
          }
        },
        onDidReceiveBackgroundNotificationResponse: notificationTapBackground,
      );

      if (!kIsWeb && Platform.isAndroid) {
        final androidPlugin =
            _notificationsPlugin.resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin>();

        const msgChannel = AndroidNotificationChannel(
          'chat_messages',
          'Chat Notifications',
          description: 'Notifications about new messages and chat invitations',
          importance: Importance.high,
          playSound: true,
          enableVibration: true,
        );

        const inviteChannel = AndroidNotificationChannel(
          'chat_invitations',
          'Chat Invitations',
          description:
              'Notifications about incoming chat invitations with action buttons',
          importance: Importance.max,
          playSound: true,
          enableVibration: true,
        );

        const sysChannel = AndroidNotificationChannel(
          'chat_system',
          'System Notifications',
          description: 'System alerts and invitation updates',
          importance: Importance.high,
          playSound: true,
          enableVibration: true,
        );

        await androidPlugin?.createNotificationChannel(msgChannel);
        await androidPlugin?.createNotificationChannel(inviteChannel);
        await androidPlugin?.createNotificationChannel(sysChannel);
      }

      _isInitialized = true;
      debugPrint('[NotificationService] Successfully initialized');
    } catch (e, st) {
      debugPrint('[NotificationService] Initialization error: $e\n$st');
    }
  }

  Future<void> initFirebaseMessaging(Api api) async {
    if (_isFirebaseInitialized) return;
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('[FCM] Firebase.initializeApp skipped or not configured: $e');
      return;
    }

    try {
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty) {
        debugPrint('[FCM] Token acquired: $token');
        try {
          await api.post('/users/fcm-token', {'token': token});
        } catch (e) {
          debugPrint('[FCM] Failed to send token to backend: $e');
        }
      }

      messaging.onTokenRefresh.listen((newToken) async {
        try {
          await api.post('/users/fcm-token', {'token': newToken});
        } catch (_) {}
      });

      FirebaseMessaging.onMessage.listen((RemoteMessage message) async {
        final data = message.data;
        final type = data['type'] ?? '';
        final myId = await NotificationService.getCurrentUserId();

        if (type == 'invitation_received') {
          if (data['senderId'] != null &&
              data['senderId'].toString().isNotEmpty &&
              data['senderId'] == myId) {
            return;
          }
          showInvitationNotification(
            invitationId: data['invitationId'] ?? '',
            senderName: data['senderName'] ?? 'Someone',
          );
        } else if (type == 'invitation_accepted' ||
            type == 'invitation_declined') {
          if (data['senderId'] != null &&
              data['senderId'].toString().isNotEmpty &&
              data['senderId'] == myId) {
            return;
          }
          final responder = data['responderName'] ?? 'User';
          final title = type == 'invitation_accepted'
              ? 'Invitation accepted'
              : 'Invitation rejected';
          final body = data['body'] ??
              message.notification?.body ??
              (type == 'invitation_accepted'
                  ? 'User $responder accepted your invitation'
                  : 'User $responder rejected your invitation');
          showSimpleNotification(title: title, body: body);
        } else if (type == 'chat_message') {
          if (data['senderId'] != null &&
              data['senderId'].toString().isNotEmpty &&
              data['senderId'] == myId) {
            return;
          }
          final chatId = data['chatId'] ?? '';
          final senderName = data['senderName'] ?? 'New message';
          final content = data['body'] ??
              data['content'] ??
              message.notification?.body ??
              '';
          final msgType = data['messageType'] ?? 'TEXT';

          if (chatId.isNotEmpty) {
            try {
              api.post('/chats/$chatId/delivered', {});
            } catch (_) {}
          }

          showChatMessageNotification(
            chatId: chatId,
            senderName: senderName,
            content: content,
            type: msgType,
            isChatActive: activeChatId == chatId,
          );
        }
      });

      _isFirebaseInitialized = true;
    } catch (e) {
      debugPrint('[FCM] initFirebaseMessaging error: $e');
    }
  }

  Future<bool> requestPermission(BuildContext context,
      {bool force = false}) async {
    if (kIsWeb) return false;
    if (Platform.isWindows || Platform.isLinux) {
      return true;
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      final alreadyPrompted =
          prefs.getBool('notification_permission_prompted') ?? false;

      if (!force) {
        if (Platform.isAndroid) {
          final androidImplementation =
              _notificationsPlugin.resolvePlatformSpecificImplementation<
                  AndroidFlutterLocalNotificationsPlugin>();
          final areEnabled =
              await androidImplementation?.areNotificationsEnabled();
          if (areEnabled == true) {
            return true;
          }
          if (alreadyPrompted) {
            return false;
          }
        } else if (Platform.isIOS || Platform.isMacOS) {
          if (alreadyPrompted) {
            return false;
          }
        }
      }

      if (!context.mounted) return false;
      final grantedByDialog = await NotificationPermissionDialog.show(context);
      await prefs.setBool('notification_permission_prompted', true);
      if (grantedByDialog != true) return false;

      if (Platform.isAndroid) {
        final androidImplementation =
            _notificationsPlugin.resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin>();
        final granted =
            await androidImplementation?.requestNotificationsPermission();
        return granted ?? true;
      } else if (Platform.isIOS || Platform.isMacOS) {
        final iosImplementation =
            _notificationsPlugin.resolvePlatformSpecificImplementation<
                IOSFlutterLocalNotificationsPlugin>();
        final granted = await iosImplementation?.requestPermissions(
          alert: true,
          badge: true,
          sound: true,
        );
        return granted ?? true;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  Future<void> showChatMessageNotification({
    required String chatId,
    required String senderName,
    required String content,
    required String type,
    bool isChatActive = false,
    bool isMuted = false,
    bool isSenderBlocked = false,
  }) async {
    if (!shouldShowNotification(
      isMuted: isMuted,
      isChatActive: isChatActive,
      isSenderBlocked: isSenderBlocked,
    )) {
      return;
    }

    final body = formatNotificationContent(type: type, content: content);
    final notificationId = notificationIdForChat(chatId);

    const androidDetails = AndroidNotificationDetails(
      'chat_messages',
      'Chat Notifications',
      channelDescription:
          'Notifications about new messages and chat invitations',
      importance: Importance.high,
      priority: Priority.high,
      playSound: true,
      enableVibration: true,
    );

    const darwinDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: darwinDetails,
      macOS: darwinDetails,
      windows: WindowsNotificationDetails(),
    );

    try {
      if (!_isInitialized) await initialize();
      await _notificationsPlugin.show(
        id: notificationId,
        title: senderName,
        body: body,
        notificationDetails: details,
        payload: chatId,
      );
      debugPrint(
          '[NotificationService] showChatMessageNotification success: $senderName - $body');
    } catch (e, st) {
      debugPrint(
          '[NotificationService] showChatMessageNotification error: $e\n$st');
    }
  }

  Future<void> showInvitationNotification({
    required String invitationId,
    required String senderName,
  }) async {
    final body = formatInvitationContent(senderName: senderName);
    final notificationId = notificationIdForInvitation(invitationId);

    final androidDetails = AndroidNotificationDetails(
      'chat_invitations',
      'Chat Invitations',
      channelDescription:
          'Notifications about incoming chat invitations with action buttons',
      importance: Importance.max,
      priority: Priority.high,
      actions: <AndroidNotificationAction>[
        AndroidNotificationAction('accept_$invitationId', 'Accept',
            showsUserInterface: true, cancelNotification: true),
        AndroidNotificationAction('decline_$invitationId', 'Decline',
            showsUserInterface: true, cancelNotification: true),
      ],
      playSound: true,
      enableVibration: true,
    );

    const darwinDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    final details = NotificationDetails(
      android: androidDetails,
      iOS: darwinDetails,
      macOS: darwinDetails,
      windows: const WindowsNotificationDetails(),
    );

    try {
      if (!_isInitialized) await initialize();
      await _notificationsPlugin.show(
        id: notificationId,
        title: 'Chat Invitation',
        body: body,
        notificationDetails: details,
        payload: 'invitations',
      );
      debugPrint(
          '[NotificationService] showInvitationNotification success: $senderName');
    } catch (e, st) {
      debugPrint(
          '[NotificationService] showInvitationNotification error: $e\n$st');
    }
  }

  Future<void> showSimpleNotification({
    required String title,
    required String body,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      'chat_system',
      'System Notifications',
      importance: Importance.high,
      priority: Priority.high,
      playSound: true,
      enableVibration: true,
    );
    const details = NotificationDetails(
      android: androidDetails,
      windows: WindowsNotificationDetails(),
    );
    final id = DateTime.now().microsecondsSinceEpoch % 100000;
    try {
      if (!_isInitialized) await initialize();
      await _notificationsPlugin.show(
        id: id,
        title: title,
        body: body,
        notificationDetails: details,
      );
      debugPrint(
          '[NotificationService] showSimpleNotification success: $title - $body');
    } catch (e, st) {
      debugPrint('[NotificationService] showSimpleNotification error: $e\n$st');
    }
  }

  static int notificationIdForChat(String chatId) {
    return chatId.hashCode.abs() % 100000;
  }

  static int notificationIdForInvitation(String invitationId) {
    return ('inv_$invitationId').hashCode.abs() % 100000;
  }

  Future<void> cancelChatNotifications(String chatId) async {
    if (chatId.isEmpty) return;
    try {
      if (!_isInitialized) await initialize();
      await _notificationsPlugin.cancel(id: notificationIdForChat(chatId));
    } catch (_) {}
  }

  Future<void> cancelInvitationNotifications(String invitationId) async {
    if (invitationId.isEmpty) return;
    try {
      if (!_isInitialized) await initialize();
      await _notificationsPlugin.cancel(
        id: notificationIdForInvitation(invitationId),
      );
    } catch (_) {}
  }

  Future<void> cancelAllNotifications() async {
    try {
      if (!_isInitialized) await initialize();
      await _notificationsPlugin.cancelAll();
    } catch (_) {}
  }

  Future<void> markChatAsRead(String chatId) async {
    if (chatId.isEmpty) return;
    activeChatId = chatId;
    await cancelChatNotifications(chatId);
    try {
      await Api().post('/chats/$chatId/read', {});
    } catch (_) {}
  }

  Future<void> markInvitationAsSeen(String invitationId) async {
    await cancelInvitationNotifications(invitationId);
  }

  static void navigateToChat(String chatId) {
    final state = navigatorKey.currentState;
    if (state != null && state.mounted && chatId.isNotEmpty) {
      state.popUntil((route) => route.isFirst);
    }
  }
}
