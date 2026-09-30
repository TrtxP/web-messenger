import 'package:flutter/material.dart';
import 'password_requirements_widget.dart';

class PasswordRecoveryForm extends StatelessWidget {
  const PasswordRecoveryForm({
    super.key,
    required this.emailController,
    required this.otpController,
    required this.newPasswordController,
    required this.recoveryCodeSent,
    required this.error,
    required this.successMessage,
    required this.onSendCode,
    required this.onResetPassword,
    required this.onBackToSignIn,
  });

  final TextEditingController emailController;
  final TextEditingController otpController;
  final TextEditingController newPasswordController;
  final bool recoveryCodeSent;
  final String? error;
  final String? successMessage;
  final VoidCallback onSendCode;
  final VoidCallback onResetPassword;
  final VoidCallback onBackToSignIn;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          recoveryCodeSent ? 'Reset Password' : 'Forgot Password',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        Text(
          recoveryCodeSent
              ? 'Enter the 6-digit code and your new password'
              : 'Enter your registered email to receive a recovery code',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.grey, fontSize: 13),
        ),
        const SizedBox(height: 16),
        TextField(
          key: const Key('recovery_email_field'),
          controller: emailController,
          decoration: const InputDecoration(labelText: 'Registered Email'),
        ),
        if (recoveryCodeSent) ...[
          const SizedBox(height: 8),
          TextField(
            key: const Key('recovery_otp_field'),
            controller: otpController,
            decoration:
                const InputDecoration(labelText: '6-digit Recovery Code'),
          ),
          const SizedBox(height: 8),
          TextField(
            key: const Key('recovery_new_password_field'),
            controller: newPasswordController,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'New Password'),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: PasswordRequirementsWidget(
              password: newPasswordController.text,
            ),
          ),
        ],
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8.0),
            child: Text(error!, style: const TextStyle(color: Colors.red)),
          ),
        if (successMessage != null)
          Padding(
            padding: const EdgeInsets.only(top: 8.0),
            child: Text(
              successMessage!,
              style: const TextStyle(color: Colors.green),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton(
          key: recoveryCodeSent
              ? const Key('submit_recovery_button')
              : const Key('send_recovery_button'),
          onPressed: recoveryCodeSent ? onResetPassword : onSendCode,
          child: Text(recoveryCodeSent ? 'Reset Password' : 'Send Code'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: onBackToSignIn,
          child: const Text('Back to Sign in'),
        ),
      ],
    );
  }
}
