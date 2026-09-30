import 'package:flutter/material.dart';

import '../../../core/auth_validator.dart';
import '../services/auth_service.dart';
import '../widgets/email_verification_form.dart';
import '../widgets/main_auth_form.dart';
import '../widgets/password_recovery_form.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.onAuthenticated});
  final ValueChanged<Map<String, dynamic>> onAuthenticated;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final AuthService _authService = AuthService();
  final email = TextEditingController();
  final password = TextEditingController();
  final username = TextEditingController();
  final verificationOtp = TextEditingController();
  final recoveryOtp = TextEditingController();
  final newPassword = TextEditingController();

  bool register = false;
  bool isVerifyingEmail = false;
  bool isRecoveringPassword = false;
  bool recoveryCodeSent = false;

  String? error;
  String? successMessage;

  @override
  void initState() {
    super.initState();
    password.addListener(_onPasswordChanged);
    newPassword.addListener(_onNewPasswordChanged);
  }

  void _onPasswordChanged() {
    if (register) {
      setState(() {});
    }
  }

  void _onNewPasswordChanged() {
    if (isRecoveringPassword && recoveryCodeSent) {
      setState(() {});
    }
  }

  @override
  void dispose() {
    password.removeListener(_onPasswordChanged);
    newPassword.removeListener(_onNewPasswordChanged);
    email.dispose();
    password.dispose();
    username.dispose();
    verificationOtp.dispose();
    recoveryOtp.dispose();
    newPassword.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      error = null;
      successMessage = null;
    });

    if (register && !isStrongPassword(password.text)) {
      setState(() => error = 'Password is not strong enough');
      return;
    }

    try {
      final res = register
          ? await _authService.register(
              email.text,
              password.text,
              username.text,
            )
          : await _authService.login(
              email.text,
              password.text,
            );

      if (register && res['requiresVerification'] == true) {
        setState(() {
          isVerifyingEmail = true;
          successMessage =
              'Verification code sent! Check backend terminal console.';
        });
        return;
      }

      await _authService.saveSession(res);
      widget.onAuthenticated(res);
    } catch (exception) {
      setState(
          () => error = exception.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> submitEmailVerification() async {
    setState(() {
      error = null;
      successMessage = null;
    });

    final code = verificationOtp.text.trim();
    if (code.isEmpty) {
      setState(() => error = 'Please enter 6-digit verification code');
      return;
    }

    try {
      final res = await _authService.verifyEmail(email.text, code);
      await _authService.saveSession(res);
      widget.onAuthenticated(res);
    } catch (exception) {
      setState(
          () => error = exception.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> sendRecoveryCode() async {
    setState(() {
      error = null;
      successMessage = null;
    });

    final emailStr = email.text.trim();
    if (emailStr.isEmpty) {
      setState(() => error = 'Please enter your registered email');
      return;
    }

    try {
      await _authService.forgotPassword(emailStr);
      setState(() {
        recoveryCodeSent = true;
        successMessage =
            '6-digit recovery code generated! Check backend console.';
      });
    } catch (exception) {
      setState(
          () => error = exception.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> resendVerificationCode() async {
    setState(() {
      error = null;
      successMessage = null;
    });

    final emailStr = email.text.trim();
    if (emailStr.isEmpty) {
      setState(() => error = 'Please enter your email or username');
      return;
    }

    try {
      await _authService.resendVerification(emailStr);
      setState(() {
        successMessage = 'New verification code sent! Check backend console.';
      });
    } catch (exception) {
      setState(
          () => error = exception.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> submitPasswordReset() async {
    setState(() {
      error = null;
      successMessage = null;
    });

    final code = recoveryOtp.text.trim();
    final newPass = newPassword.text;

    if (code.isEmpty) {
      setState(() => error = 'Please enter 6-digit recovery code');
      return;
    }

    if (!isStrongPassword(newPass)) {
      setState(() => error = 'New password is not strong enough');
      return;
    }

    try {
      await _authService.resetPassword(email.text, code, newPass);
      setState(() {
        isRecoveringPassword = false;
        recoveryCodeSent = false;
        password.clear();
        newPassword.clear();
        recoveryOtp.clear();
        successMessage = 'Password successfully reset! Please sign in.';
      });
    } catch (exception) {
      setState(
          () => error = exception.toString().replaceFirst('Exception: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: isRecoveringPassword
                  ? PasswordRecoveryForm(
                      emailController: email,
                      otpController: recoveryOtp,
                      newPasswordController: newPassword,
                      recoveryCodeSent: recoveryCodeSent,
                      error: error,
                      successMessage: successMessage,
                      onSendCode: sendRecoveryCode,
                      onResetPassword: submitPasswordReset,
                      onBackToSignIn: () => setState(() {
                        isRecoveringPassword = false;
                        recoveryCodeSent = false;
                        error = null;
                        successMessage = null;
                      }),
                    )
                  : isVerifyingEmail
                      ? EmailVerificationForm(
                          otpController: verificationOtp,
                          error: error,
                          successMessage: successMessage,
                          onVerify: submitEmailVerification,
                          onResendCode: resendVerificationCode,
                          onBackToSignIn: () => setState(() {
                            isVerifyingEmail = false;
                            error = null;
                            successMessage = null;
                          }),
                        )
                      : MainAuthForm(
                          emailController: email,
                          passwordController: password,
                          usernameController: username,
                          isRegister: register,
                          error: error,
                          successMessage: successMessage,
                          onSubmit: submit,
                          onToggleRegister: () => setState(() {
                            register = !register;
                            error = null;
                            successMessage = null;
                          }),
                          onForgotPassword: () => setState(() {
                            isRecoveringPassword = true;
                            error = null;
                            successMessage = null;
                          }),
                          onVerifyEmailNow: () => setState(() {
                            isVerifyingEmail = true;
                            error = null;
                            successMessage = null;
                          }),
                        ),
            ),
          ),
        ),
      ),
    );
  }
}
