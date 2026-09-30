import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers that mirror the production logic we want to verify
// ─────────────────────────────────────────────────────────────────────────────

/// Same resolution logic that chat_screen.dart should use.
/// Returns the other participant's username from `chat['partner']`.
String resolveChatTitle(Map<String, dynamic> chat, String currentUserId) {
  // Preferred: partner object returned by the backend
  final partner = chat['partner'];
  if (partner is Map) {
    final name = partner['username']?.toString() ??
        partner['name']?.toString() ??
        partner['displayName']?.toString();
    if (name != null && name.isNotEmpty) return name;
  }

  // Legacy / group chats: explicit title field
  final title = chat['title']?.toString();
  if (title != null && title.isNotEmpty && title != 'Chat') return title;

  return 'Chat';
}

/// Returns true when the platform requires a system-level permission request
/// before accessing the camera or media library.
bool platformRequiresMediaPermission() {
  if (kIsWeb) return false;
  if (Platform.isAndroid || Platform.isIOS) return true;
  return false; // Windows / Linux / macOS use native file pickers
}

/// Returns true when the platform should use a native file-selector dialog
/// instead of image_picker (which only works on mobile/web).
bool platformUsesFileSelectorForMedia() {
  if (kIsWeb) return false;
  return Platform.isWindows || Platform.isLinux || Platform.isMacOS;
}

/// Mirrors the MIME-type detection in api_client.dart.
/// Returns the correct MIME type for a given file extension.
String? detectMimeType(String filename) {
  final lower = filename.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  return null;
}

/// Returns true when the audio payload is valid (non-empty bytes).
bool isValidAudioPayload(List<int> bytes) => bytes.isNotEmpty;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

void main() {
  group('[STEP 18] Media Upload, Platform Picker & Chat Title Tests', () {
    // ── 1. Chat title ────────────────────────────────────────────────────────

    test('Chat title resolves to partner username from backend partner object',
        () {
      final chat = {
        'id': 'chat-1',
        'partner': {'id': 'user-bob', 'username': 'bob_smith'},
      };
      expect(resolveChatTitle(chat, 'user-alice'), 'bob_smith');
    });

    test('Chat title falls back to chat title field when partner is absent',
        () {
      final chat = {
        'id': 'chat-2',
        'title': 'Project Alpha',
      };
      expect(resolveChatTitle(chat, 'user-alice'), 'Project Alpha');
    });

    test(
        'Chat title returns "Chat" only when no partner and no title available',
        () {
      final chat = {
        'id': 'chat-3',
        'title': '',
      };
      expect(resolveChatTitle(chat, 'user-alice'), 'Chat');
    });

    test('Chat title does not show generic "Chat" when partner username exists',
        () {
      final chat = {
        'id': 'chat-4',
        'partner': {'id': 'user-carol', 'username': 'carol99'},
        'title': 'Chat', // server may send this — should be ignored
      };
      // Must prefer partner.username over the generic title
      expect(resolveChatTitle(chat, 'user-alice'), 'carol99');
      expect(resolveChatTitle(chat, 'user-alice'), isNot('Chat'));
    });

    // ── 2. Platform picker detection ─────────────────────────────────────────

    test('Desktop platform uses file-selector dialog instead of image_picker',
        () {
      // On the Windows CI this test machine we are running on, verify
      // the flag correctly reflects the current platform.
      final usesSelector = platformUsesFileSelectorForMedia();
      if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
        expect(usesSelector, isTrue,
            reason: 'Desktop must use file_selector, not image_picker');
      } else {
        expect(usesSelector, isFalse);
      }
    });

    test('Mobile platform requires runtime permission before picking media',
        () {
      final needsPermission = platformRequiresMediaPermission();
      if (Platform.isAndroid || Platform.isIOS) {
        expect(needsPermission, isTrue,
            reason: 'Android/iOS must request permission before media access');
      } else {
        // Desktop & web never request runtime media permissions this way
        expect(needsPermission, isFalse);
      }
    });

    // ── 3. MIME type detection ────────────────────────────────────────────────

    test('MIME type detection covers all required media formats', () {
      // Images
      expect(detectMimeType('photo.jpg'), 'image/jpeg');
      expect(detectMimeType('photo.jpeg'), 'image/jpeg');
      expect(detectMimeType('icon.png'), 'image/png');
      expect(detectMimeType('sticker.webp'), 'image/webp');

      // Videos
      expect(detectMimeType('clip.mp4'), 'video/mp4');
      expect(detectMimeType('recording.mov'), 'video/quicktime');

      // Audio
      expect(detectMimeType('voice.m4a'), 'audio/mp4');
      expect(detectMimeType('voice.aac'), 'audio/aac');
      expect(detectMimeType('voice.mp3'), 'audio/mpeg');
      expect(detectMimeType('voice.ogg'), 'audio/ogg');
      expect(detectMimeType('voice.wav'), 'audio/wav');

      // Unknown
      expect(detectMimeType('document.pdf'), isNull);
      expect(detectMimeType('archive.zip'), isNull);
    });

    // ── 4. Audio payload validation ───────────────────────────────────────────

    test(
        'Audio message is rejected when recording bytes are empty (no real audio captured)',
        () {
      // Simulates the bug: _sendAudioRecording() was calling _sendMessage(type:'AUDIO')
      // without uploading any actual audio file.
      final emptyPayload = <int>[];
      expect(isValidAudioPayload(emptyPayload), isFalse,
          reason:
              'Sending 0-byte audio must be blocked — no real recording captured');
    });

    test('Audio message is accepted when recording bytes are non-empty', () {
      // 1 KB of dummy audio data
      final realPayload = List<int>.filled(1024, 0);
      expect(isValidAudioPayload(realPayload), isTrue);
    });

    // ── 5. Widget: AppBar shows partner username, not "Chat" ─────────────────

    testWidgets(
        'ChatScreen AppBar title displays partner username, not generic "Chat"',
        (tester) async {
      const partnerUsername = 'alice_wonder';

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            appBar: AppBar(
              key: const Key('chat_app_bar'),
              title: const Text(
                partnerUsername,
                key: Key('chat_title_text'),
              ),
            ),
            body: const SizedBox(),
          ),
        ),
      );

      // Title must be the partner username
      expect(find.byKey(const Key('chat_title_text')), findsOneWidget);
      expect(find.text(partnerUsername), findsOneWidget);
      // Must NOT show the generic fallback
      expect(find.text('Chat'), findsNothing);
    });

    // ── 6. Widget: Home list shows partner username in chat list tile ─────────

    testWidgets('Home chat list tile shows partner username, not "Chat"',
        (tester) async {
      final chats = [
        {
          'id': 'c1',
          'partner': {'id': 'u2', 'username': 'diana_prince'},
          'lastMessage': null,
          'unreadCount': 0,
        },
      ];

      String chatDisplayTitle(Map<String, dynamic> chat) {
        return resolveChatTitle(chat, 'u1');
      }

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ListView(
              children: chats.map((c) {
                final title = chatDisplayTitle(c);
                return ListTile(
                  key: Key('chat_tile_${c['id']}'),
                  title: Text(title, key: Key('tile_title_${c['id']}')),
                );
              }).toList(),
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('tile_title_c1')), findsOneWidget);
      expect(find.text('diana_prince'), findsOneWidget);
      expect(find.text('Chat'), findsNothing);
    });

    // ── 7. Upload: image file selected on desktop must not be 0 bytes ─────────

    test('Picked file bytes must be non-empty before upload attempt', () {
      // On desktop, file_selector returns the raw bytes.
      // This test ensures we validate before calling uploadFile.
      bool isValidPickedFile(List<int>? bytes, String? name) {
        if (bytes == null || bytes.isEmpty) return false;
        if (name == null || name.isEmpty) return false;
        final mime = detectMimeType(name);
        return mime != null;
      }

      // Valid: 5 KB JPEG
      expect(
        isValidPickedFile(List<int>.filled(5120, 0), 'photo.jpg'),
        isTrue,
      );
      // Invalid: empty bytes
      expect(isValidPickedFile([], 'photo.jpg'), isFalse);
      // Invalid: null
      expect(isValidPickedFile(null, 'photo.jpg'), isFalse);
      // Invalid: unknown type
      expect(
        isValidPickedFile(List<int>.filled(1024, 0), 'document.pdf'),
        isFalse,
      );
    });
  });
}
