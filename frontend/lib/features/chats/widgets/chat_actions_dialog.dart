import 'package:flutter/material.dart';

class ChatActionsDialog {
  static Future<bool> showConfirmDelete(
    BuildContext context,
    String title,
  ) async {
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Delete chat?'),
            content: Text(
              'Deleting "$title" removes all messages for both participants. '
              'This action cannot be undone.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text(
                  'Delete',
                  style: TextStyle(color: Colors.red),
                ),
              ),
            ],
          ),
        ) ??
        false;
  }

  static Future<String?> showChatActions(
    BuildContext context, {
    required String title,
    required bool showingArchived,
    required bool isMuted,
    required bool hasPartner,
  }) async {
    return await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: const Text('Choose an action for this chat.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(
              dialogContext,
              showingArchived ? 'unarchive' : 'archive',
            ),
            child: Text(showingArchived ? 'Unarchive chat' : 'Archive chat'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(
              dialogContext,
              isMuted ? 'unmute' : 'mute',
            ),
            child:
                Text(isMuted ? 'Unmute notifications' : 'Mute notifications'),
          ),
          if (hasPartner)
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, 'profile'),
              child: const Text('View profile / Block'),
            ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, 'delete'),
            child: const Text(
              'Delete chat',
              style: TextStyle(color: Colors.red),
            ),
          ),
        ],
      ),
    );
  }
}
