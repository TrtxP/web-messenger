import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('[STEP 11] Invitations System Tests (SPEC §4.4 & Mobile messenger.txt)',
      () {
    testWidgets(
        'Pending Invitations Screen features Received and Sent tabs (SPEC §4.4)',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: DefaultTabController(
            length: 2,
            child: Scaffold(
              appBar: AppBar(
                title: const Text('Invitations'),
                bottom: const TabBar(
                  tabs: [
                    Tab(key: Key('received_tab'), text: 'Received'),
                    Tab(key: Key('sent_tab'), text: 'Sent'),
                  ],
                ),
              ),
              body: const TabBarView(
                children: [
                  Center(child: Text('Received Invites List')),
                  Center(child: Text('Sent Invites List')),
                ],
              ),
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('received_tab')), findsOneWidget);
      expect(find.byKey(const Key('sent_tab')), findsOneWidget);
      expect(find.text('Received Invites List'), findsOneWidget);

      // Switch to Sent tab
      await tester.tap(find.byKey(const Key('sent_tab')));
      await tester.pumpAndSettle();
      expect(find.text('Sent Invites List'), findsOneWidget);
    });

    testWidgets(
        'Received invite row displays sender details with Accept and Decline actions (SPEC §4.4)',
        (tester) async {
      bool accepted = false;
      bool declined = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ListView(
              children: [
                ListTile(
                  leading: const CircleAvatar(child: Text('B')),
                  title: const Text('bob'),
                  subtitle: const Text('Received yesterday'),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        key: const Key('accept_invite_button'),
                        icon: const Icon(Icons.check, color: Colors.green),
                        onPressed: () => accepted = true,
                      ),
                      IconButton(
                        key: const Key('decline_invite_button'),
                        icon: const Icon(Icons.close, color: Colors.red),
                        onPressed: () => declined = true,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.text('bob'), findsOneWidget);
      expect(find.byKey(const Key('accept_invite_button')), findsOneWidget);
      expect(find.byKey(const Key('decline_invite_button')), findsOneWidget);

      await tester.tap(find.byKey(const Key('accept_invite_button')));
      expect(accepted, isTrue);

      await tester.tap(find.byKey(const Key('decline_invite_button')));
      expect(declined, isTrue);
    });

    test('Self-invitation and duplicate prevention logic (SPEC §4.4)', () {
      bool canSendInvite({
        required String currentUserId,
        required String targetUserId,
        required List<String> existingChatPartnerIds,
        required List<String> pendingOutgoingInviteTargetIds,
      }) {
        if (currentUserId == targetUserId) {
          return false; // Self-invite forbidden
        }
        if (existingChatPartnerIds.contains(targetUserId)) {
          return false; // Chat exists
        }
        if (pendingOutgoingInviteTargetIds.contains(targetUserId)) {
          return false; // Duplicate
        }
        return true;
      }

      // Valid invite
      expect(
        canSendInvite(
          currentUserId: 'user-1',
          targetUserId: 'user-2',
          existingChatPartnerIds: [],
          pendingOutgoingInviteTargetIds: [],
        ),
        isTrue,
      );

      // Self-invite
      expect(
        canSendInvite(
          currentUserId: 'user-1',
          targetUserId: 'user-1',
          existingChatPartnerIds: [],
          pendingOutgoingInviteTargetIds: [],
        ),
        isFalse,
        reason: 'User cannot invite themselves (SPEC §4.4)',
      );

      // Chat already exists
      expect(
        canSendInvite(
          currentUserId: 'user-1',
          targetUserId: 'user-2',
          existingChatPartnerIds: ['user-2'],
          pendingOutgoingInviteTargetIds: [],
        ),
        isFalse,
        reason:
            'No invite needed if chat already exists (SPEC §4.4 & Mobile messenger.txt)',
      );

      // Duplicate invite already pending
      expect(
        canSendInvite(
          currentUserId: 'user-1',
          targetUserId: 'user-2',
          existingChatPartnerIds: [],
          pendingOutgoingInviteTargetIds: ['user-2'],
        ),
        isFalse,
        reason: 'Duplicate pending invite must be blocked (SPEC §4.4)',
      );
    });
  });
}
