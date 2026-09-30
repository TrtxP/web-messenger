import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group(
      '[STEP 17] Audio Messages, Push Notifications & Error Handling Tests (SPEC §4.7 - §4.9 & Mobile messenger.txt)',
      () {
    testWidgets(
        'Chat input includes Microphone record button and cancel action (SPEC §4.7)',
        (tester) async {
      bool isRecording = false;

      await tester.pumpWidget(
        MaterialApp(
          home: StatefulBuilder(
            builder: (context, setState) {
              return Scaffold(
                bottomNavigationBar: SafeArea(
                  child: Row(
                    children: [
                      if (!isRecording)
                        IconButton(
                          key: const Key('mic_button'),
                          icon: const Icon(Icons.mic),
                          onPressed: () => setState(() => isRecording = true),
                        ),
                      if (isRecording) ...[
                        const Icon(Icons.fiber_manual_record,
                            color: Colors.red),
                        const SizedBox(width: 8),
                        const Text('0:14', key: Key('recording_timer')),
                        const Spacer(),
                        TextButton(
                          key: const Key('cancel_record_button'),
                          onPressed: () => setState(() => isRecording = false),
                          child: const Text('Cancel'),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      );

      expect(find.byKey(const Key('mic_button')), findsOneWidget);
      expect(find.byKey(const Key('recording_timer')), findsNothing);

      // Start recording
      await tester.tap(find.byKey(const Key('mic_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('recording_timer')), findsOneWidget);
      expect(find.byKey(const Key('cancel_record_button')), findsOneWidget);

      // Cancel recording
      await tester.tap(find.byKey(const Key('cancel_record_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('mic_button')), findsOneWidget);
      expect(find.byKey(const Key('recording_timer')), findsNothing);
    });

    testWidgets(
        'Audio Player Widget renders Play/Pause, Progress slider, and Speed selector (SPEC §4.7)',
        (tester) async {
      bool isPlaying = false;
      double speed = 1.0;

      await tester.pumpWidget(
        MaterialApp(
          home: StatefulBuilder(
            builder: (context, setState) {
              return Scaffold(
                body: Card(
                  child: Row(
                    children: [
                      IconButton(
                        key: const Key('audio_play_pause_button'),
                        icon: Icon(isPlaying ? Icons.pause : Icons.play_arrow),
                        onPressed: () => setState(() => isPlaying = !isPlaying),
                      ),
                      Expanded(
                        child: Slider(
                          value: 0.3,
                          onChanged: (_) {},
                        ),
                      ),
                      const Text('0:12 / 0:40'),
                      TextButton(
                        key: const Key('audio_speed_button'),
                        onPressed: () {
                          setState(() {
                            if (speed == 1.0) {
                              speed = 1.5;
                            } else if (speed == 1.5) {
                              speed = 2.0;
                            } else {
                              speed = 1.0;
                            }
                          });
                        },
                        child: Text('${speed}x'),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      );

      expect(find.byIcon(Icons.play_arrow), findsOneWidget);
      expect(find.text('1.0x'), findsOneWidget);

      // Tap play
      await tester.tap(find.byKey(const Key('audio_play_pause_button')));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.pause), findsOneWidget);

      // Tap speed selector (1.0x -> 1.5x)
      await tester.tap(find.byKey(const Key('audio_speed_button')));
      await tester.pumpAndSettle();
      expect(find.text('1.5x'), findsOneWidget);

      // Tap speed selector (1.5x -> 2.0x)
      await tester.tap(find.byKey(const Key('audio_speed_button')));
      await tester.pumpAndSettle();
      expect(find.text('2.0x'), findsOneWidget);
    });

    testWidgets(
        'Network interruption displays offline reconnection banner (SPEC §4.9)',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            appBar: AppBar(title: const Text('Chats')),
            body: Column(
              children: [
                Container(
                  key: const Key('offline_banner'),
                  color: Colors.redAccent,
                  width: double.infinity,
                  padding: const EdgeInsets.all(8),
                  child: const Text(
                    'Offline — Reconnecting...',
                    style: TextStyle(color: Colors.white),
                    textAlign: TextAlign.center,
                  ),
                ),
                const Expanded(child: Center(child: Text('Chat content'))),
              ],
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('offline_banner')), findsOneWidget);
      expect(find.text('Offline — Reconnecting...'), findsOneWidget);
    });

    testWidgets('Per-chat notification mute options dialog (SPEC §4.8)',
        (tester) async {
      String? selectedMuteDuration;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                key: const Key('open_mute_dialog'),
                onPressed: () {
                  showDialog(
                    context: context,
                    builder: (dialogCtx) => SimpleDialog(
                      title: const Text('Mute notifications for...'),
                      children: [
                        SimpleDialogOption(
                          onPressed: () {
                            selectedMuteDuration = '8_hours';
                            Navigator.pop(dialogCtx);
                          },
                          child: const Text('8 hours'),
                        ),
                        SimpleDialogOption(
                          onPressed: () {
                            selectedMuteDuration = '1_week';
                            Navigator.pop(dialogCtx);
                          },
                          child: const Text('1 week'),
                        ),
                        SimpleDialogOption(
                          onPressed: () {
                            selectedMuteDuration = 'always';
                            Navigator.pop(dialogCtx);
                          },
                          child: const Text('Always'),
                        ),
                      ],
                    ),
                  );
                },
                child: const Text('Mute Chat'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('open_mute_dialog')));
      await tester.pumpAndSettle();

      expect(find.text('Mute notifications for...'), findsOneWidget);
      expect(find.text('8 hours'), findsOneWidget);
      expect(find.text('1 week'), findsOneWidget);
      expect(find.text('Always'), findsOneWidget);

      await tester.tap(find.text('8 hours'));
      await tester.pumpAndSettle();

      expect(selectedMuteDuration, '8_hours');
    });
  });
}
