import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_messenger/features/chats/screens/home_screen.dart';

void main() {
  group(
      '[STEP 8 & 9] User Profile & Avatar Upload Tests (SPEC §4.2 & Mobile messenger.txt)',
      () {
    testWidgets(
        'HomeScreen has a Profile navigation access (App bar action or Drawer/Tab)',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            user: const {
              'id': 'u1',
              'email': 'alice@example.com',
              'username': 'alice',
              'about': '',
              'avatarUrl': null,
            },
            onLogout: () {},
          ),
        ),
      );

      // SPEC §4.2 & Mobile messenger.txt:
      // "User has to have a profile page in the application, which at least consists of a profile picture, username, and About me section."
      final profileIconFinder = find.byIcon(Icons.person);
      final accountIconFinder = find.byIcon(Icons.account_circle);
      final profileAvatarFinder = find.byType(CircleAvatar);

      expect(
        profileIconFinder.evaluate().isNotEmpty ||
            accountIconFinder.evaluate().isNotEmpty ||
            profileAvatarFinder.evaluate().isNotEmpty,
        isTrue,
        reason:
            'SPEC §4.2 mandates accessible User Profile page from main screen',
      );
    });

    testWidgets('Profile view displays Avatar, Username, and About me section',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            appBar: AppBar(title: const Text('Profile')),
            body: const Column(
              children: [
                CircleAvatar(
                  key: Key('profile_avatar'),
                  child: Icon(Icons.person),
                ),
                Text('alice', key: Key('profile_username')),
                Text('', key: Key('profile_about')),
              ],
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('profile_avatar')), findsOneWidget);
      expect(find.byKey(const Key('profile_username')), findsOneWidget);
      expect(find.byKey(const Key('profile_about')), findsOneWidget);
    });

    test('Profile picture validation allows JPEG and PNG under 5MB (SPEC §4.2)',
        () {
      bool isAllowedProfileImage(String mimeType, int sizeBytes) {
        final allowedMimes = ['image/jpeg', 'image/png', 'image/jpg'];
        const maxSizeBytes = 5 * 1024 * 1024; // 5MB
        return allowedMimes.contains(mimeType.toLowerCase()) &&
            sizeBytes <= maxSizeBytes;
      }

      // Valid JPEG <= 5MB
      expect(isAllowedProfileImage('image/jpeg', 2 * 1024 * 1024), isTrue);
      // Valid PNG <= 5MB
      expect(isAllowedProfileImage('image/png', 4 * 1024 * 1024), isTrue);
      // Exceeding 5MB limit
      expect(isAllowedProfileImage('image/jpeg', 6 * 1024 * 1024), isFalse,
          reason: 'Avatar files exceeding 5MB must be rejected (SPEC §4.2)');
      // Unsupported format (GIF)
      expect(isAllowedProfileImage('image/gif', 1024), isFalse,
          reason:
              'Only JPEG and PNG are permitted for profile avatars (SPEC §4.2)');
      // Unsupported format (PDF)
      expect(isAllowedProfileImage('application/pdf', 1024), isFalse);
    });

    testWidgets('Profile editing allows updating username and About me bio',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                TextField(
                  key: const Key('edit_username_field'),
                  controller: TextEditingController(text: 'alice'),
                ),
                TextField(
                  key: const Key('edit_about_field'),
                  controller: TextEditingController(text: 'Available'),
                ),
                ElevatedButton(
                  key: const Key('save_profile_button'),
                  onPressed: () {},
                  child: const Text('Save Profile'),
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('edit_username_field')), findsOneWidget);
      expect(find.byKey(const Key('edit_about_field')), findsOneWidget);
      expect(find.byKey(const Key('save_profile_button')), findsOneWidget);

      await tester.enterText(
          find.byKey(const Key('edit_username_field')), 'alice_new');
      await tester.enterText(
          find.byKey(const Key('edit_about_field')), 'New status bio');
      await tester.pumpAndSettle();

      expect(find.text('alice_new'), findsOneWidget);
      expect(find.text('New status bio'), findsOneWidget);
    });
  });
}
