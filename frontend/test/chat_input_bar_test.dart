import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_messenger/features/chats/widgets/chat_input_bar.dart';
import 'package:image_picker/image_picker.dart';

void main() {
  testWidgets('ChatInputBar renders without focus circular parent error and sends message on Enter', (tester) async {
    final textController = TextEditingController();
    bool sent = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChatInputBar(
            textController: textController,
            isRecording: false,
            recordingSeconds: 0,
            isDesktop: true,
            onTextChanged: (_) {},
            onStartRecording: () {},
            onCancelRecording: () {},
            onSendRecording: () {},
            onSendMessage: () {
              sent = true;
            },
            onSendImage: (ImageSource source) async {},
            onSendVideo: (ImageSource source) async {},
            onPickVideoFile: () {},
            onPickAudio: () {},
          ),
        ),
      ),
    );

    // Verify it builds with no assertions
    expect(find.byType(TextField), findsOneWidget);

    // Tap to focus
    await tester.tap(find.byType(TextField));
    await tester.pump();

    // Enter text
    await tester.enterText(find.byType(TextField), 'Hello');
    await tester.pump();

    // Send via Enter key
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();

    expect(sent, isTrue);
  });
}
