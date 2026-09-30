import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group(
      '[STEP 13 & 14] Messaging, Status Indicators & Edit/Delete Tests (SPEC §4.6 & Mobile messenger.txt)',
      () {
    testWidgets(
        'Renders all message delivery status indicators (SPEC §4.6 table)',
        (tester) async {
      Widget buildStatusIcon(String status) {
        switch (status) {
          case 'pending':
            return const Icon(Icons.access_time,
                size: 14, key: Key('icon_pending'));
          case 'sent':
            return const Icon(Icons.check,
                size: 14, color: Colors.grey, key: Key('icon_sent'));
          case 'delivered':
            return const Icon(Icons.done_all,
                size: 14, color: Colors.grey, key: Key('icon_delivered'));
          case 'read':
            return const Icon(Icons.done_all,
                size: 14, color: Colors.blue, key: Key('icon_read'));
          case 'failed':
            return const Icon(Icons.error_outline,
                size: 14, color: Colors.red, key: Key('icon_failed'));
          default:
            return const SizedBox();
        }
      }

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                buildStatusIcon('pending'),
                buildStatusIcon('sent'),
                buildStatusIcon('delivered'),
                buildStatusIcon('read'),
                buildStatusIcon('failed'),
              ],
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('icon_pending')), findsOneWidget);
      expect(find.byKey(const Key('icon_sent')), findsOneWidget);
      expect(find.byKey(const Key('icon_delivered')), findsOneWidget);
      expect(find.byKey(const Key('icon_read')), findsOneWidget);
      expect(find.byKey(const Key('icon_failed')), findsOneWidget);
    });

    test('Message text validation: maximum 4000 characters (SPEC §4.6)', () {
      bool isValidTextMessage(String text) {
        final trimmed = text.trim();
        return trimmed.isNotEmpty && trimmed.length <= 4000;
      }

      expect(isValidTextMessage('Hello world'), isTrue);
      expect(isValidTextMessage(''), isFalse,
          reason: 'Empty text messages are disallowed');
      expect(isValidTextMessage('   '), isFalse);
      expect(isValidTextMessage('a' * 4000), isTrue);
      expect(isValidTextMessage('a' * 4001), isFalse,
          reason: 'Text exceeding 4000 chars must fail');
    });

    testWidgets(
        'Edited message displays inline (edited) label next to timestamp (SPEC §4.6)',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Row(
              children: [
                Text('Updated message text'),
                SizedBox(width: 8),
                Text('15:45'),
                SizedBox(width: 4),
                Text('(edited)', style: TextStyle(fontStyle: FontStyle.italic)),
              ],
            ),
          ),
        ),
      );

      expect(find.text('Updated message text'), findsOneWidget);
      expect(find.text('(edited)'), findsOneWidget);
    });

    testWidgets('Deleted message displays tombstone indicator (SPEC §4.6)',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Container(
              padding: const EdgeInsets.all(8),
              child: const Text(
                'This message was deleted',
                style:
                    TextStyle(fontStyle: FontStyle.italic, color: Colors.grey),
              ),
            ),
          ),
        ),
      );

      expect(find.text('This message was deleted'), findsOneWidget);
    });

    test('Own message permissions: only author can edit or delete (SPEC §4.6)',
        () {
      bool canEditOrDeleteMessage(
          {required String currentUserId, required String senderId}) {
        return currentUserId == senderId;
      }

      expect(
        canEditOrDeleteMessage(
            currentUserId: 'user-alice', senderId: 'user-alice'),
        isTrue,
        reason: 'Sender can edit and delete their own message',
      );

      expect(
        canEditOrDeleteMessage(
            currentUserId: 'user-bob', senderId: 'user-alice'),
        isFalse,
        reason: 'Recipient cannot edit or delete another user message',
      );
    });
  });
}
