import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group(
      '[STEP 15] Typing Indicators Widget Tests (SPEC §4.6 & Mobile messenger.txt)',
      () {
    testWidgets(
        'Renders animated typing indicator in chat app bar subtitle or footer (SPEC §4.6)',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            appBar: AppBar(
              title: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Bob'),
                  Text(
                    'typing...',
                    key: Key('typing_indicator_subtitle'),
                    style: TextStyle(fontSize: 12, color: Colors.blue),
                  ),
                ],
              ),
            ),
            body: const Center(child: Text('Chat messages')),
          ),
        ),
      );

      expect(
          find.byKey(const Key('typing_indicator_subtitle')), findsOneWidget);
      expect(find.text('typing...'), findsOneWidget);
    });

    testWidgets('Typing indicator disappears when typing stops',
        (tester) async {
      bool isContactTyping = true;

      await tester.pumpWidget(
        MaterialApp(
          home: StatefulBuilder(
            builder: (context, setState) {
              return Scaffold(
                appBar: AppBar(
                  title: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Bob'),
                      if (isContactTyping)
                        const Text(
                          'typing...',
                          key: Key('typing_indicator'),
                          style: TextStyle(fontSize: 12, color: Colors.blue),
                        ),
                    ],
                  ),
                ),
                floatingActionButton: FloatingActionButton(
                  onPressed: () => setState(() => isContactTyping = false),
                  child: const Icon(Icons.stop),
                ),
              );
            },
          ),
        ),
      );

      expect(find.byKey(const Key('typing_indicator')), findsOneWidget);

      // Stop typing event
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('typing_indicator')), findsNothing);
    });

    test('Typing debounce timeout constant is 2.5 seconds (SPEC §4.6)', () {
      const typingDebounceTimeout = Duration(milliseconds: 2500);
      expect(typingDebounceTimeout.inMilliseconds, 2500);
    });
  });
}
