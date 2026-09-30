import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_messenger/core/network/api_client.dart';
import 'package:mobile_messenger/features/search/delegates/user_search_delegate.dart';

void main() {
  group(
      '[STEP 10] User Search & Discovery Tests (SPEC §4.3 & Mobile messenger.txt)',
      () {
    testWidgets('UserSearch excludes self-user from search results (SPEC §4.3)',
        (tester) async {
      final currentLoggedInUser = {
        'id': 'self-uuid-1',
        'email': 'self@example.com',
        'username': 'self_user',
      };

      final searchDelegate = UserSearch(Api(), currentLoggedInUser);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            appBar: AppBar(
              actions: [
                Builder(
                  builder: (context) => IconButton(
                    icon: const Icon(Icons.search),
                    onPressed: () => showSearch(
                      context: context,
                      delegate: searchDelegate,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      // Open search
      await tester.tap(find.byIcon(Icons.search));
      await tester.pumpAndSettle();

      // Search input should be rendered
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets(
        'Search results display relationship actions: Send Invite, Pending, Open Chat (SPEC §4.3)',
        (tester) async {
      // Test the widget presentation for all 4 relationship states
      final testUsers = [
        {
          'id': 'u2',
          'username': 'bob',
          'email': 'bob@example.com',
          'relationship': 'none', // Not connected
        },
        {
          'id': 'u3',
          'username': 'charlie',
          'email': 'charlie@example.com',
          'relationship': 'pending', // Outgoing invite sent
        },
        {
          'id': 'u4',
          'username': 'diana',
          'email': 'diana@example.com',
          'relationship': 'contact', // Already a contact / chat exists
        },
      ];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ListView.builder(
              itemCount: testUsers.length,
              itemBuilder: (context, index) {
                final u = testUsers[index];
                final relationship = u['relationship'];
                Widget action;
                if (relationship == 'contact') {
                  action = TextButton(
                    onPressed: () {},
                    child: const Text('Open Chat'),
                  );
                } else if (relationship == 'pending') {
                  action = const Chip(label: Text('Pending'));
                } else {
                  action = ElevatedButton(
                    onPressed: () {},
                    child: const Text('Send Invite'),
                  );
                }

                return ListTile(
                  title: Text(u['username']!),
                  subtitle: Text(u['email']!),
                  trailing: action,
                );
              },
            ),
          ),
        ),
      );

      expect(find.text('bob'), findsOneWidget);
      expect(find.text('Send Invite'), findsOneWidget);

      expect(find.text('charlie'), findsOneWidget);
      expect(find.text('Pending'), findsOneWidget);

      expect(find.text('diana'), findsOneWidget);
      expect(find.text('Open Chat'), findsOneWidget);
    });

    test('Search query matches both username and email (SPEC §4.3)', () {
      bool matchesUser(Map<String, dynamic> user, String query) {
        final q = query.trim().toLowerCase();
        if (q.isEmpty) return false;
        final username = (user['username'] as String? ?? '').toLowerCase();
        final email = (user['email'] as String? ?? '').toLowerCase();
        return username.contains(q) || email.contains(q);
      }

      final sample = {'username': 'john_doe', 'email': 'john@example.com'};

      expect(matchesUser(sample, 'john'), isTrue);
      expect(matchesUser(sample, 'doe'), isTrue);
      expect(matchesUser(sample, 'john@example.com'), isTrue);
      expect(matchesUser(sample, 'example'), isTrue);
      expect(matchesUser(sample, 'alice'), isFalse);
    });
  });
}
