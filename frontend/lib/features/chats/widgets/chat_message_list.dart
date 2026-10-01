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
    this.isGroupChat = false,
    this.highlightQuery,
    this.highlightMessageId,
    this.onRetryMessage,
    this.senderNames = const {},
  });

  final ScrollController scrollController;
  final bool isLoading;
  final List<dynamic> messages;
  final String currentUserId;
  final String? Function(String? mediaId) formatMediaStreamUrl;
  final void Function(String msgId, String content, String type) onMessageActionRequested;
  final ValueChanged<String> onImageTap;
  final bool isGroupChat;
  final String? highlightQuery;
  final String? highlightMessageId;
  final void Function(String msgId)? onRetryMessage;
  final Map<String, String> senderNames;

  @override
  Widget build(BuildContext context) {
    final visibleMessages = messages.where((message) {
      if (message is! Map) return false;
      final msg = message as Map<String, dynamic>;
      return msg['is_deleted'] != true && msg['isDeleted'] != true && msg['deleted'] != true;
    }).toList();

    if (isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (visibleMessages.isEmpty) {
      return const Center(child: Text('No messages yet. Say hello!'));
    }

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: visibleMessages.length,
      itemBuilder: (context, index) {
        final msg = visibleMessages[index] as Map<String, dynamic>;
        final isMe = (msg['sender_id']?.toString() == currentUserId) || (msg['senderId']?.toString() == currentUserId);
        final msgId = msg['id']?.toString() ?? '';
        final mediaId = msg['mediaId']?.toString() ?? msg['media_id']?.toString();
        final content = msg['content']?.toString() ?? msg['text']?.toString() ?? '';
        final type = msg['type']?.toString().toUpperCase() ?? 'TEXT';
        final streamUrl = formatMediaStreamUrl(mediaId);
        final senderId = msg['senderId']?.toString() ?? msg['sender_id']?.toString() ?? '';
        final senderName = senderNames[senderId];
        final isHighlighted = highlightMessageId != null && highlightMessageId == msgId;

        return Container(
          decoration: isHighlighted ? BoxDecoration(color: Colors.yellow.shade100, borderRadius: BorderRadius.circular(8)) : null,
          child: MessageBubble(
            message: msg,
            isMe: isMe,
            mediaStreamUrl: streamUrl,
            isGroupChat: isGroupChat,
            senderName: senderName,
            highlightQuery: highlightQuery,
            onRetry: () => onRetryMessage?.call(msgId),
            onActionRequested: () => onMessageActionRequested(msgId, content, type),
            onImageTap: onImageTap,
          ),
        );
      },
    );
  }
}
