import 'package:flutter/material.dart';
import 'password_requirements_widget.dart';

class MainAuthForm extends StatefulWidget {
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
  State<MainAuthForm> createState() => _MainAuthFormState();
}

class _MainAuthFormState extends State<MainAuthForm> {
  bool _obscurePassword = true;
  late final FocusNode _passwordFocusNode = FocusNode();
  late final FocusNode _toggleButtonFocusNode = FocusNode(
    canRequestFocus: false,
    skipTraversal: true,
  );

  @override
  void dispose() {
    _passwordFocusNode.dispose();
    _toggleButtonFocusNode.dispose();
    super.dispose();
  }

  void _togglePasswordVisibility() {
    final controller = widget.passwordController;
    final previousSelection = controller.selection;
    setState(() {
      _obscurePassword = !_obscurePassword;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_passwordFocusNode.hasFocus) {
        _passwordFocusNode.requestFocus();
      }
      final textLength = controller.text.length;
      if (previousSelection.isValid) {
        final base = previousSelection.baseOffset.clamp(0, textLength);
        final extent = previousSelection.extentOffset.clamp(0, textLength);
        controller.selection = previousSelection.copyWith(
          baseOffset: base,
          extentOffset: extent,
        );
      } else {
        controller.selection = TextSelection.collapsed(offset: textLength);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isRegister = widget.isRegister;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          isRegister ? 'Create account' : 'Sign in',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        if (isRegister)
          TextField(
            controller: widget.usernameController,
            decoration: const InputDecoration(labelText: 'Username'),
          ),
        TextField(
          controller: widget.emailController,
          decoration: const InputDecoration(labelText: 'Email'),
        ),
        TextField(
          controller: widget.passwordController,
          focusNode: _passwordFocusNode,
          obscureText: _obscurePassword,
          decoration: InputDecoration(
            labelText: 'Password',
            suffixIcon: IconButton(
              key: const Key('toggle_password_visibility'),
              icon: Icon(
                _obscurePassword ? Icons.visibility_off : Icons.visibility,
              ),
              tooltip: _obscurePassword ? 'Show password' : 'Hide password',
              focusNode: _toggleButtonFocusNode,
              onPressed: _togglePasswordVisibility,
            ),
          ),
        ),
        if (isRegister) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: PasswordRequirementsWidget(
              password: widget.passwordController.text,
              showFooter: true,
            ),
          ),
        ],
        if (widget.error != null) ...[
          Padding(
            padding: const EdgeInsets.only(top: 8.0),
            child:
                Text(widget.error!, style: const TextStyle(color: Colors.red)),
          ),
          if (widget.error!.toLowerCase().contains('verification'))
            TextButton(
              onPressed: widget.onVerifyEmailNow,
              child: const Text('Verify Email Now'),
            ),
        ],
        if (widget.successMessage != null)
          Padding(
            padding: const EdgeInsets.only(top: 8.0),
            child: Text(
              widget.successMessage!,
              style: const TextStyle(color: Colors.green),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: widget.onSubmit,
          child: Text(isRegister ? 'Register' : 'Login'),
        ),
        if (!isRegister)
          TextButton(
            onPressed: widget.onForgotPassword,
            child: const Text('Forgot Password?'),
          ),
        TextButton(
          onPressed: widget.onToggleRegister,
          child: Text(isRegister ? 'Sign in' : 'Create account'),
        ),
      ],
    );
  }
}
