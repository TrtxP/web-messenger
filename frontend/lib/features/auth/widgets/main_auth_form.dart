import 'package:flutter/material.dart';
import 'password_requirements_widget.dart';

class MainAuthForm extends StatelessWidget {
  const MainAuthForm({
    super.key,
    required this.emailController,
    required this.passwordController,
    required this.usernameController,
    required this.isRegister,
    required this.error,
    required this.successMessage,
    required this.onSubmit,
    required this.onToggleRegister,
    required this.onForgotPassword,
    required this.onVerifyEmailNow,
  });

  final TextEditingController emailController;
  final TextEditingController passwordController;
  final TextEditingController usernameController;
  final bool isRegister;
  final String? error;
  final String? successMessage;
  final VoidCallback onSubmit;
  final VoidCallback onToggleRegister;
  final VoidCallback onForgotPassword;
  final VoidCallback onVerifyEmailNow;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          isRegister ? 'Create account' : 'Sign in',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        if (isRegister)
          TextField(
            controller: usernameController,
            decoration: const InputDecoration(labelText: 'Username'),
          ),
        TextField(
          controller: emailController,
          decoration: const InputDecoration(labelText: 'Email'),
        ),
        TextField(
          controller: passwordController,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Password'),
        ),
        if (isRegister) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: PasswordRequirementsWidget(
              password: passwordController.text,
              showFooter: true,
            ),
          ),
        ],
        if (error != null) ...[
          Padding(
            padding: const EdgeInsets.only(top: 8.0),
            child: Text(error!, style: const TextStyle(color: Colors.red)),
          ),
          if (error!.toLowerCase().contains('verification'))
            TextButton(
              onPressed: onVerifyEmailNow,
              child: const Text('Verify Email Now'),
            ),
        ],
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
          onPressed: onSubmit,
          child: Text(isRegister ? 'Register' : 'Login'),
        ),
        if (!isRegister)
          TextButton(
            onPressed: onForgotPassword,
            child: const Text('Forgot Password?'),
          ),
        TextButton(
          onPressed: onToggleRegister,
          child: Text(isRegister ? 'Sign in' : 'Create account'),
        ),
      ],
    );
  }
}
