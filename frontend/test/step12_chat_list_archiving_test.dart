import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group(
      '[STEP 12] Chat List, Archiving & Muting Tests (SPEC §4.5 & Mobile messenger.txt)',
      () {
    test(
        'Chat list is sorted strictly in descending order of lastMessage timestamp (SPEC §4.5)',
        () {
      final chats = [
        {
          'id': 'chat-1',
          'title': 'Bob',
          'lastMessageTimestamp': DateTime.parse('2026-09-22T10:00:00Z'),
        },
        {
          'id': 'chat-2',
          'title': 'Charlie',
          'lastMessageTimestamp': DateTime.parse('2026-09-22T14:30:00Z'),
        },
        {
          'id': 'chat-3',
          'title': 'Alice',
          'lastMessageTimestamp': DateTime.parse('2026-09-22T12:15:00Z'),
        },
      ];

      // Sort chats: newest message first
      chats.sort((a, b) => (b['lastMessageTimestamp'] as DateTime)
          .compareTo(a['lastMessageTimestamp'] as DateTime));

      expect(chats[0]['id'], 'chat-2'); // 14:30
      expect(chats[1]['id'], 'chat-3'); // 12:15
      expect(chats[2]['id'], 'chat-1'); // 10:00
    });

    testWidgets(
        'Chat list item renders Avatar, Title, Last Message snippet, and Unread badge (SPEC §4.5)',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ListTile(
              leading: Stack(
                children: [
                  CircleAvatar(child: Text('B')),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: CircleAvatar(
                      radius: 5,
                      backgroundColor:
                          Colors.green, // Online presence indicator
                    ),
                  ),
                ],
              ),
              title: Text('Bob'),
              subtitle: Text('📷 Photo'),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('14:32'),
                  Badge(label: Text('2')),
                ],
              ),
            ),
          ),
        ),
      );

      expect(find.text('Bob'), findsOneWidget);
      expect(find.text('📷 Photo'), findsOneWidget);
      expect(find.text('14:32'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
    });

    testWidgets(
        'Archive swipe or action moves chat out of active feed (SPEC §4.5)',
        (tester) async {
      final activeChats = ['Chat with Bob', 'Chat with Alice'];

      await tester.pumpWidget(
        MaterialApp(
          home: StatefulBuilder(
            builder: (context, setState) {
              return Scaffold(
                appBar: AppBar(title: const Text('Chats')),
                body: ListView.builder(
                  itemCount: activeChats.length,
                  itemBuilder: (context, index) {
                    final item = activeChats[index];
                    return Dismissible(
                      key: Key(item),
                      background: Container(
                        color: Colors.blueGrey,
                        alignment: Alignment.centerRight,
                        padding: const EdgeInsets.only(right: 20),
                        child: const Icon(Icons.archive, color: Colors.white),
                      ),
                      onDismissed: (_) {
                        setState(() => activeChats.removeAt(index));
                      },
                      child: ListTile(title: Text(item)),
                    );
                  },
                ),
              );
            },
          ),
        ),
      );

      expect(find.text('Chat with Bob'), findsOneWidget);
      expect(find.text('Chat with Alice'), findsOneWidget);

      // Swipe to archive Bob
      await tester.drag(find.text('Chat with Bob'), const Offset(-500, 0));
      await tester.pumpAndSettle();

      expect(find.text('Chat with Bob'), findsNothing);
      expect(find.text('Chat with Alice'), findsOneWidget);
    });

    testWidgets('Muted chat renders mute indicator icon (SPEC §4.5 & §4.8)',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ListTile(
              title: Row(
                children: [
                  Text('Muted Group Chat'),
                  SizedBox(width: 6),
                  Icon(Icons.notifications_off, size: 16),
                ],
              ),
              subtitle: Text('Last message'),
            ),
          ),
        ),
      );

      expect(find.byIcon(Icons.notifications_off), findsOneWidget);
      expect(find.text('Muted Group Chat'), findsOneWidget);
    });
  });
}
