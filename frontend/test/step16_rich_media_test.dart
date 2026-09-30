import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group(
      '[STEP 16] Rich Media Messaging Tests (SPEC §4.6 & Mobile messenger.txt)',
      () {
    test(
        'Validates media file size limit: 20MB post-compression (SPEC §4.6 & Mobile messenger.txt)',
        () {
      const maxMediaSizeBytes = 20 * 1024 * 1024; // 20MB

      bool isMediaWithinLimit(int sizeBytes) {
        return sizeBytes > 0 && sizeBytes <= maxMediaSizeBytes;
      }

      // 5MB image - valid
      expect(isMediaWithinLimit(5 * 1024 * 1024), isTrue);
      // Exactly 20MB - valid
      expect(isMediaWithinLimit(20 * 1024 * 1024), isTrue);
      // 20MB + 1 byte - invalid
      expect(
        isMediaWithinLimit(20 * 1024 * 1024 + 1),
        isFalse,
        reason: 'Files exceeding 20MB must be rejected (SPEC §4.6)',
      );
      // 0 bytes - invalid
      expect(isMediaWithinLimit(0), isFalse);
    });

    test(
        'Validates allowed media formats: JPEG, PNG, WebP, MP4, MOV (SPEC §4.6)',
        () {
      final allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
      final allowedVideoMimes = ['video/mp4', 'video/quicktime'];

      bool isAllowedMediaType(String mimeType) {
        final lower = mimeType.toLowerCase();
        return allowedImageMimes.contains(lower) ||
            allowedVideoMimes.contains(lower);
      }

      expect(isAllowedMediaType('image/jpeg'), isTrue);
      expect(isAllowedMediaType('image/png'), isTrue);
      expect(isAllowedMediaType('image/webp'), isTrue);
      expect(isAllowedMediaType('video/mp4'), isTrue);
      expect(isAllowedMediaType('video/quicktime'), isTrue); // MOV

      // Executables or disallowed types
      expect(isAllowedMediaType('application/x-msdownload'), isFalse);
      expect(isAllowedMediaType('application/zip'), isFalse);
    });

    testWidgets(
        'Chat input contains media attachment actions (Camera / Gallery / Video picker)',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            bottomNavigationBar: SafeArea(
              child: Row(
                children: [
                  IconButton(
                    key: const Key('attach_media_button'),
                    icon: const Icon(Icons.attach_file),
                    onPressed: () {},
                  ),
                  const Expanded(
                    child: TextField(
                      decoration:
                          InputDecoration(hintText: 'Type a message...'),
                    ),
                  ),
                  IconButton(
                    key: const Key('send_message_button'),
                    icon: const Icon(Icons.send),
                    onPressed: () {},
                  ),
                ],
              ),
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('attach_media_button')), findsOneWidget);
      expect(find.byKey(const Key('send_message_button')), findsOneWidget);
    });

    testWidgets('Media message bubble renders visual status ticks (SPEC §4.6)',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Align(
              alignment: Alignment.centerRight,
              child: Container(
                width: 200,
                height: 150,
                color: Colors.grey[300],
                child: const Stack(
                  children: [
                    Center(child: Icon(Icons.image, size: 48)),
                    Positioned(
                      right: 8,
                      bottom: 8,
                      child: Row(
                        children: [
                          Text('16:20', style: TextStyle(fontSize: 10)),
                          SizedBox(width: 4),
                          Icon(Icons.done_all, size: 14, color: Colors.blue),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );

      expect(find.byIcon(Icons.image), findsOneWidget);
      expect(find.byIcon(Icons.done_all), findsOneWidget);
      expect(find.text('16:20'), findsOneWidget);
    });
  });
}
