import 'package:flutter/material.dart';

class ProfileInfoWidget extends StatelessWidget {
  const ProfileInfoWidget({
    super.key,
    required this.usernameController,
    required this.aboutController,
    required this.isEditing,
    required this.isSaving,
    required this.errorMessage,
    required this.onSave,
  });

  final TextEditingController usernameController;
  final TextEditingController aboutController;
  final bool isEditing;
  final bool isSaving;
  final String? errorMessage;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (errorMessage != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16.0),
            child: Text(
              errorMessage!,
              style: const TextStyle(color: Colors.red),
            ),
          ),
        if (!isEditing) ...[
          Text(
            usernameController.text,
            key: const Key('profile_username'),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            aboutController.text.isEmpty ? 'No bio yet' : aboutController.text,
            key: const Key('profile_about'),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: aboutController.text.isEmpty ? Colors.grey : null,
                ),
          ),
        ] else ...[
          TextField(
            controller: usernameController,
            decoration: const InputDecoration(
              labelText: 'Username',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: aboutController,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'About me',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: isSaving ? null : onSave,
            child: isSaving
                ? const CircularProgressIndicator.adaptive()
                : const Text('Save changes'),
          ),
        ],
      ],
    );
  }
}
