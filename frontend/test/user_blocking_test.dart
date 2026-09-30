import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_messenger/features/profile/widgets/user_profile_modal.dart';
import 'package:mobile_messenger/features/profile/services/profile_service.dart';

class MockProfileService extends ProfileService {
  final Set<String> blockedUsers = {};

  @override
  Future<bool> blockUser(String userId) async {
    blockedUsers.add(userId);
    return true;
  }

  @override
  Future<bool> unblockUser(String userId) async {
    blockedUsers.remove(userId);
    return true;
  }

  @override
  Future<List<String>> getBlockedUserIds() async {
    return blockedUsers.toList();
  }
}

void main() {
  testWidgets(
      'UserProfileModal shows Block user, confirms via dialog, and toggles to Unblock user',
      (tester) async {
    final mockService = MockProfileService();
    const targetUserId = 'target-user-123';
    const targetUsername = 'Alice';

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UserProfileModal(
            userId: targetUserId,
            username: targetUsername,
            profileService: mockService,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text(targetUsername), findsOneWidget);
    expect(find.text('Block user'), findsOneWidget);
    expect(find.text('Unblock user'), findsNothing);

    await tester.tap(find.text('Block user'));
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.text('Confirm'), findsOneWidget);

    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();

    expect(mockService.blockedUsers.contains(targetUserId), isTrue);
    expect(find.text('Unblock user'), findsOneWidget);
    expect(find.text('Block user'), findsNothing);

    await tester.tap(find.text('Unblock user'));
    await tester.pumpAndSettle();

    expect(mockService.blockedUsers.contains(targetUserId), isFalse);
    expect(find.text('Block user'), findsOneWidget);
    expect(find.text('Unblock user'), findsNothing);
  });
}
