import 'package:flutter/material.dart';
import 'message_bubble.dart';

class ChatMessageList extends StatelessWidget {
  const ChatMessageList({
    super.key,
    required this.scrollController,
    required this.isLoading,
    required this.messages,
    required this.currentUserId,
    required this.formatMediaStreamUrl,
    required this.onMessageActionRequested,
    required this.onImageTap,
  });

  final ScrollController scrollController;
  final bool isLoading;
  final List<dynamic> messages;
  final String currentUserId;
  final String? Function(String? mediaId) formatMediaStreamUrl;
  final void Function(String msgId, String content, String type)
      onMessageActionRequested;
  final ValueChanged<String> onImageTap;

  @override
  Widget build(BuildContext context) {
    final visibleMessages = messages.where((message) {
      if (message is! Map) return false;
      final msg = message as Map<String, dynamic>;
      return msg['is_deleted'] != true &&
          msg['isDeleted'] != true &&
          msg['deleted'] != true;
    }).toList();

    if (isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (visibleMessages.isEmpty) {
      return const Center(child: Text('No messages yet. Say hello!'));
    }

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.symmetric(
        horizontal: 12,
        vertical: 8,
      ),
      itemCount: visibleMessages.length,
      itemBuilder: (context, index) {
        final msg = visibleMessages[index] as Map<String, dynamic>;
        final isMe = (msg['sender_id']?.toString() == currentUserId) ||
            (msg['senderId']?.toString() == currentUserId);
        final msgId = msg['id']?.toString() ?? '';
        final mediaId =
            msg['mediaId']?.toString() ?? msg['media_id']?.toString();
        final content =
            msg['content']?.toString() ?? msg['text']?.toString() ?? '';
        final type = msg['type']?.toString().toUpperCase() ?? 'TEXT';

        final streamUrl = formatMediaStreamUrl(mediaId);

        return MessageBubble(
          message: msg,
          isMe: isMe,
          mediaStreamUrl: streamUrl,
          onActionRequested: () => onMessageActionRequested(
            msgId,
            content,
            type,
          ),
          onImageTap: onImageTap,
        );
      },
    );
  }
}
