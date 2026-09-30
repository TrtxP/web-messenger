import 'package:flutter/material.dart';

class PasswordRequirementsWidget extends StatelessWidget {
  const PasswordRequirementsWidget({
    super.key,
    required this.password,
    this.showFooter = false,
  });

  final String password;
  final bool showFooter;

  Widget _buildRequirement(String text, bool met) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          met ? Icons.check_circle : Icons.circle_outlined,
          size: 14,
          color: met ? Colors.green : Colors.grey,
        ),
        const SizedBox(width: 6),
        Text(
          text,
          style: TextStyle(
            fontSize: 12,
            color: met ? Colors.green : Colors.grey,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildRequirement('At least 8 characters', password.length >= 8),
        _buildRequirement(
          'Uppercase letter',
          RegExp(r'[A-Z]').hasMatch(password),
        ),
        _buildRequirement(
          'Lowercase letter',
          RegExp(r'[a-z]').hasMatch(password),
        ),
        _buildRequirement(
          'Number',
          RegExp(r'\d').hasMatch(password),
        ),
        _buildRequirement(
          'Special character',
          RegExp(r'[!@#\$%^&*(),.?":{}|<>]').hasMatch(password),
        ),
        if (showFooter) ...[
          const SizedBox(height: 8),
          const Text(
            'Verification code will be sent to your email after registration',
            style: TextStyle(fontSize: 12, color: Colors.grey),
          ),
        ],
      ],
    );
  }
}
