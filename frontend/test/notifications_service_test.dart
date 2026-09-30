import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_messenger/core/services/notification_service.dart';
import 'package:mobile_messenger/features/chats/widgets/notification_permission_dialog.dart';

void main() {
  group('NotificationService & Push Notifications TDD Tests', () {
    late NotificationService service;

    setUp(() {
      service = NotificationService();
    });

    test('Notification formatting: TEXT message uses original text as body',
        () {
      final formatted = service.formatNotificationContent(
        type: 'TEXT',
        content: 'Hello, how are you?',
      );
      expect(formatted, 'Hello, how are you?');
    });

    test('Notification formatting: IMAGE message uses "📷 Photo"', () {
      final formatted = service.formatNotificationContent(
        type: 'IMAGE',
        content: 'https://example.com/photo.jpg',
      );
      expect(formatted, '📷 Photo');
    });

    test('Notification formatting: VIDEO message uses "🎥 Video Message"', () {
      final formatted = service.formatNotificationContent(
        type: 'VIDEO',
        content: 'https://example.com/video.mp4',
      );
      expect(formatted, '🎥 Video Message');
    });

    test('Notification formatting: AUDIO message uses "🎤 Audio Message"', () {
      final formatted = service.formatNotificationContent(
        type: 'AUDIO',
        content: 'Voice message (5 s)',
      );
      expect(formatted, '🎤 Audio Message');
    });

    test('Suppression rules: notification is BLOCKED when isMuted is true', () {
      final shouldShow = service.shouldShowNotification(
        isMuted: true,
        isChatActive: false,
        isSenderBlocked: false,
      );
      expect(shouldShow, isFalse,
          reason: 'Muted chats must never show notifications');
    });

    test(
        'Suppression rules: notification is BLOCKED when user is in the active chat',
        () {
      final shouldShow = service.shouldShowNotification(
        isMuted: false,
        isChatActive: true,
        isSenderBlocked: false,
      );
      expect(shouldShow, isFalse,
          reason: 'Active open chat must suppress notifications');
    });

    test('Suppression rules: notification is BLOCKED when sender is blocked',
        () {
      final shouldShow = service.shouldShowNotification(
        isMuted: false,
        isChatActive: false,
        isSenderBlocked: true,
      );
      expect(shouldShow, isFalse,
          reason: 'Blocked users must not trigger notifications');
    });

    test(
        'Suppression rules: notification is ALLOWED when chat is unmuted, inactive, and not blocked',
        () {
      final shouldShow = service.shouldShowNotification(
        isMuted: false,
        isChatActive: false,
        isSenderBlocked: false,
      );
      expect(shouldShow, isTrue);
    });

    test(
        'Cross-platform safety: platform-specific initialization handles desktop gracefully',
        () {
      final isSupported = service.isPlatformSupported;
      if (Platform.isWindows ||
          Platform.isLinux ||
          Platform.isMacOS ||
          Platform.isAndroid ||
          Platform.isIOS) {
        expect(isSupported, isTrue);
      }
    });

    testWidgets(
        'NotificationPermissionDialog renders explanatory rationale and actions',
        (tester) async {
      bool? userResponse;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () async {
                    userResponse =
                        await NotificationPermissionDialog.show(context);
                  },
                  child: const Text('Request Permission'),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Request Permission'));
      await tester.pumpAndSettle();

      expect(find.text('Allow Notifications?'), findsOneWidget);
      expect(
        find.text(
            'The app wants to send you notifications about new messages and chat invitations.'),
        findsOneWidget,
      );
      expect(find.text('Allow'), findsOneWidget);
      expect(find.text('Later'), findsOneWidget);

      await tester.tap(find.text('Allow'));
      await tester.pumpAndSettle();

      expect(userResponse, isTrue);
    });

    testWidgets('NotificationPermissionDialog dismiss returns false on "Later"',
        (tester) async {
      bool? userResponse;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () async {
                    userResponse =
                        await NotificationPermissionDialog.show(context);
                  },
                  child: const Text('Request Permission'),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Request Permission'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Later'));
      await tester.pumpAndSettle();

      expect(userResponse, isFalse);
    });

    test('Notification formatting: Invitation notification formats sender name',
        () {
      final formatted = service.formatInvitationContent(senderName: 'Alice');
      expect(formatted, contains('Alice'));
    });

    test('Invitation notifications: showInvitationNotification succeeds',
        () async {
      await expectLater(
        service.showInvitationNotification(
          invitationId: 'inv-123',
          senderName: 'Alice',
        ),
        completes,
      );
    });

    test('Chat mute suppression: muting any chat blocks chat notifications',
        () {
      final shouldShowUnmuted = service.shouldShowNotification(
        isMuted: false,
        isChatActive: false,
        isSenderBlocked: false,
      );
      expect(shouldShowUnmuted, isTrue);

      final shouldShowMuted = service.shouldShowNotification(
        isMuted: true,
        isChatActive: false,
        isSenderBlocked: false,
      );
      expect(shouldShowMuted, isFalse);
    });
  });
}
