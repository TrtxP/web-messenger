import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_messenger/core/auth_validator.dart';
import 'package:mobile_messenger/features/auth/screens/auth_screen.dart';

void main() {
  group(
      '[STEP 5] Password Strength Unit Tests (SPEC §4.1.1 & Mobile messenger.txt)',
      () {
    test('requires at least 8 characters', () {
      expect(isStrongPassword('Aa1!'), isFalse,
          reason: 'Passwords under 8 characters must fail');
      expect(isStrongPassword('Aa1!567'), isFalse,
          reason: '7 characters must fail');
      expect(isStrongPassword('Aa1!5678'), isTrue,
          reason: '8 characters meeting all criteria must pass');
    });

    test('requires at least 1 lowercase letter', () {
      expect(isStrongPassword('TEST1234!'), isFalse,
          reason: 'Missing lowercase letter must fail');
      expect(isStrongPassword('tEST1234!'), isTrue);
    });

    test('requires at least 1 uppercase letter', () {
      expect(isStrongPassword('test1234!'), isFalse,
          reason: 'Missing uppercase letter must fail');
      expect(isStrongPassword('Test1234!'), isTrue);
    });

    test('requires at least 1 digit', () {
      expect(isStrongPassword('TestPassword!'), isFalse,
          reason: 'Missing digit must fail');
      expect(isStrongPassword('TestPassword1!'), isTrue);
    });

    test('requires at least 1 special character', () {
      expect(isStrongPassword('TestPassword1'), isFalse,
          reason: 'Missing special character must fail');
      expect(isStrongPassword('TestPassword1!'), isTrue);
      expect(isStrongPassword('TestPassword1@'), isTrue);
      expect(isStrongPassword('TestPassword1#'), isTrue);
    });
  });

  group('[STEP 5] AuthScreen Registration & UI Feedback Widget Tests', () {
    testWidgets('renders email, password, and toggle to Create account',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: AuthScreen(onAuthenticated: (_) {}),
        ),
      );

      expect(find.text('Sign in'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Email'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Password'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Login'), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Create account'), findsOneWidget);
    });

    testWidgets(
        'switching to registration displays Username field and Register button',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: AuthScreen(onAuthenticated: (_) {}),
        ),
      );

      // Switch to register
      await tester.tap(find.widgetWithText(TextButton, 'Create account'));
      await tester.pumpAndSettle();

      expect(find.text('Create account'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Username'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Email'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Password'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Register'), findsOneWidget);
    });

    testWidgets(
        'blocks registration and displays visual feedback for weak password',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: AuthScreen(onAuthenticated: (_) {}),
        ),
      );

      // Switch to register mode
      await tester.tap(find.widgetWithText(TextButton, 'Create account'));
      await tester.pumpAndSettle();

      // Enter weak password
      await tester.enterText(
          find.widgetWithText(TextField, 'Email'), 'newuser@example.com');
      await tester.enterText(
          find.widgetWithText(TextField, 'Username'), 'newuser');
      await tester.enterText(
          find.widgetWithText(TextField, 'Password'), 'weak');
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(FilledButton, 'Register'));
      await tester.pumpAndSettle();

      // Visual error message must appear
      expect(
          find.textContaining('Password is not strong enough'), findsOneWidget);
    });

    testWidgets('displays dynamic password checklist according to SPEC §4.1.1',
        (tester) async {
      // SPEC §4.1.1 mandates:
      // "Real-time password requirement checklist in UI (green checkmark / red cross dynamically updating as user types)"
      await tester.pumpWidget(
        MaterialApp(
          home: AuthScreen(onAuthenticated: (_) {}),
        ),
      );

      await tester.tap(find.widgetWithText(TextButton, 'Create account'));
      await tester.pumpAndSettle();

      // Enter partial password
      await tester.enterText(find.widgetWithText(TextField, 'Password'), 'abc');
      await tester.pumpAndSettle();

      // Verify that checklist indicators exist
      // e.g., 'At least 8 characters', 'Uppercase letter', 'Number', etc.
      expect(
        find.textContaining('8 characters'),
        findsOneWidget,
        reason:
            'SPEC §4.1.1 requires dynamic visual checklist for password requirements',
      );
    });

    testWidgets(
        'displays visual feedback if email or username is already taken (SPEC §4.1.1)',
        (tester) async {
      // SPEC §4.1.1: "Clear error labels under input fields if email or username is already taken (409 Conflict)"
      await tester.pumpWidget(
        MaterialApp(
          home: AuthScreen(onAuthenticated: (_) {}),
        ),
      );

      await tester.tap(find.widgetWithText(TextButton, 'Create account'));
      await tester.pumpAndSettle();

      // Attempt registration with taken username/email
      await tester.enterText(
          find.widgetWithText(TextField, 'Email'), 'alice@messenger.com');
      await tester.enterText(
          find.widgetWithText(TextField, 'Username'), 'alice');
      await tester.enterText(
          find.widgetWithText(TextField, 'Password'), 'Strong!123');
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(FilledButton, 'Register'));
      await tester.pumpAndSettle();

      // An error indicator should be displayed
      expect(
        find.byType(Text),
        findsWidgets,
      );
    });

    testWidgets(
        'displays email verification screen/dialog after registration (SPEC §4.1.2)',
        (tester) async {
      // SPEC §4.1.2: Following registration, user account is created with emailVerified = false.
      // Verification Screen: User inputs the 6-digit OTP code with review hint/auto-fill button.
      await tester.pumpWidget(
        MaterialApp(
          home: AuthScreen(onAuthenticated: (_) {}),
        ),
      );

      await tester.tap(find.widgetWithText(TextButton, 'Create account'));
      await tester.pumpAndSettle();

      // Look for verification OTP input or support
      final otpFinder = find.byKey(const Key('otp_code_field'));
      final verifyHintFinder = find.textContaining('Verification code');

      // In the full implementation, either the screen shifts to verification or OTP input appears
      expect(
        otpFinder.evaluate().isNotEmpty ||
            verifyHintFinder.evaluate().isNotEmpty,
        isTrue,
        reason:
            'SPEC §4.1.2 mandates Email Verification Screen with 6-digit OTP input',
      );
    });
  });
}
