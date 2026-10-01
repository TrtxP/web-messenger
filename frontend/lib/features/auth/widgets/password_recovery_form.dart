import 'package:flutter/material.dart';
import 'password_requirements_widget.dart';

class PasswordRecoveryForm extends StatefulWidget {
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
  State<PasswordRecoveryForm> createState() => _PasswordRecoveryFormState();
}

class _PasswordRecoveryFormState extends State<PasswordRecoveryForm> {
  bool _obscureNewPassword = true;
  late final FocusNode _newPasswordFocusNode = FocusNode();
  late final FocusNode _toggleButtonFocusNode = FocusNode(
    canRequestFocus: false,
    skipTraversal: true,
  );

  @override
  void dispose() {
    _newPasswordFocusNode.dispose();
    _toggleButtonFocusNode.dispose();
    super.dispose();
  }

  void _toggleNewPasswordVisibility() {
    final controller = widget.newPasswordController;
    final previousSelection = controller.selection;
    setState(() {
      _obscureNewPassword = !_obscureNewPassword;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_newPasswordFocusNode.hasFocus) {
        _newPasswordFocusNode.requestFocus();
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
    final recoveryCodeSent = widget.recoveryCodeSent;
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
          controller: widget.emailController,
          decoration: const InputDecoration(labelText: 'Registered Email'),
        ),
        if (recoveryCodeSent) ...[
          const SizedBox(height: 8),
          TextField(
            key: const Key('recovery_otp_field'),
            controller: widget.otpController,
            decoration:
                const InputDecoration(labelText: '6-digit Recovery Code'),
          ),
          const SizedBox(height: 8),
          TextField(
            key: const Key('recovery_new_password_field'),
            controller: widget.newPasswordController,
            focusNode: _newPasswordFocusNode,
            obscureText: _obscureNewPassword,
            decoration: InputDecoration(
              labelText: 'New Password',
              suffixIcon: IconButton(
                key: const Key('toggle_new_password_visibility'),
                icon: Icon(
                  _obscureNewPassword ? Icons.visibility_off : Icons.visibility,
                ),
                tooltip:
                    _obscureNewPassword ? 'Show password' : 'Hide password',
                focusNode: _toggleButtonFocusNode,
                onPressed: _toggleNewPasswordVisibility,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: PasswordRequirementsWidget(
              password: widget.newPasswordController.text,
            ),
          ),
        ],
        if (widget.error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8.0),
            child:
                Text(widget.error!, style: const TextStyle(color: Colors.red)),
          ),
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
          key: recoveryCodeSent
              ? const Key('submit_recovery_button')
              : const Key('send_recovery_button'),
          onPressed:
              recoveryCodeSent ? widget.onResetPassword : widget.onSendCode,
          child: Text(recoveryCodeSent ? 'Reset Password' : 'Send Code'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: widget.onBackToSignIn,
          child: const Text('Back to Sign in'),
        ),
      ],
    );
  }
}
