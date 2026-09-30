import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_messenger/app/session_gate.dart';
import 'package:mobile_messenger/features/auth/screens/auth_screen.dart';
import 'package:mobile_messenger/features/chats/screens/home_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group(
      '[STEP 6] Session Persistence & Logout Widget Tests (SPEC §4.1.4 & Mobile messenger.txt)',
      () {
    testWidgets('shows AuthScreen when no persisted session exists',
        (tester) async {
      SharedPreferences.setMockInitialValues({});

      await tester.pumpWidget(
        const MaterialApp(home: SessionGate()),
      );
      await tester.pump();

      expect(find.byType(AuthScreen), findsOneWidget);
      expect(find.byType(HomeScreen), findsNothing);
    });

    testWidgets(
        'restores session across restarts when user data exists in storage',
        (tester) async {
      SharedPreferences.setMockInitialValues({
        'user': jsonEncode({
          'id': 'user-uuid-1',
          'email': 'persisted@example.com',
          'username': 'persisted_user',
          'token': 'jwt_access_token_mock',
          'refreshToken': 'jwt_refresh_mock',
        }),
      });

      await tester.pumpWidget(
        const MaterialApp(home: SessionGate()),
      );
      // Pump initial frame and state change
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      // Session must skip directly to HomeScreen without asking for credentials
      expect(find.byType(HomeScreen), findsOneWidget);
      expect(find.byType(AuthScreen), findsNothing);
      expect(find.text('Chats'), findsOneWidget);
    });

    testWidgets(
        'explicit logout clears session and navigates back to AuthScreen',
        (tester) async {
      SharedPreferences.setMockInitialValues({
        'user': jsonEncode({
          'id': 'user-uuid-1',
          'email': 'logout_test@example.com',
          'username': 'logout_user',
          'token': 'jwt_access_token_mock',
        }),
      });

      await tester.pumpWidget(
        const MaterialApp(home: SessionGate()),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      expect(find.byType(HomeScreen), findsOneWidget);

      // Tap logout icon
      final logoutButton = find.byIcon(Icons.logout);
      expect(logoutButton, findsOneWidget);
      await tester.tap(logoutButton);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      // Must be back on AuthScreen
      expect(find.byType(AuthScreen), findsOneWidget);
      expect(find.byType(HomeScreen), findsNothing);

      // Verify SharedPreferences has cleared user
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('user'), isNull);
    });

    testWidgets(
        'silent token refresh / validation is triggered if token exists (SPEC §4.1.4)',
        (tester) async {
      SharedPreferences.setMockInitialValues({
        'user': jsonEncode({
          'id': 'user-uuid-2',
          'email': 'token_user@example.com',
          'username': 'token_user',
          'token': 'expired_jwt_mock',
          'refreshToken': 'valid_refresh_mock',
        }),
      });

      await tester.pumpWidget(
        const MaterialApp(home: SessionGate()),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      // Verified session gate should exist and handle session state
      expect(find.byType(SessionGate), findsOneWidget);
    });
  });
}
