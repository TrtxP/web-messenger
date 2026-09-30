import 'package:flutter/material.dart';

class EmailVerificationForm extends StatelessWidget {
  const EmailVerificationForm({
    super.key,
    required this.otpController,
    required this.error,
    required this.successMessage,
    required this.onVerify,
    required this.onResendCode,
    required this.onBackToSignIn,
  });

  final TextEditingController otpController;
  final String? error;
  final String? successMessage;
  final VoidCallback onVerify;
  final VoidCallback onResendCode;
  final VoidCallback onBackToSignIn;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Verify Email',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        const Text(
          'Verification code will be sent to your email after registration',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.grey, fontSize: 13),
        ),
        const SizedBox(height: 16),
        TextField(
          key: const Key('otp_code_field'),
          controller: otpController,
          decoration: const InputDecoration(labelText: '6-digit OTP Code'),
        ),
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
          onPressed: onVerify,
          child: const Text('Verify Email'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: onResendCode,
          child: const Text('Resend verification code'),
        ),
        TextButton(
          onPressed: onBackToSignIn,
          child: const Text('Back to Sign in'),
        ),
      ],
    );
  }
}
