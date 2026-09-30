import 'package:flutter/material.dart';

class ChatAppBarTitle extends StatelessWidget {
  const ChatAppBarTitle({
    super.key,
    required this.chatTitle,
    this.chatAvatarUrl,
    this.isContactOnline = false,
    this.contactActivity,
    this.contactLastSeenAt,
    this.onAvatarTap,
  });

  final String chatTitle;
  final String? chatAvatarUrl;
  final bool isContactOnline;
  final String? contactActivity;
  final DateTime? contactLastSeenAt;
  final VoidCallback? onAvatarTap;

  String _formatLastSeen(DateTime value) {
    final local = value.toLocal();
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return 'Last seen at $hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    final hasAvatar = chatAvatarUrl != null && chatAvatarUrl!.isNotEmpty;
    return Row(
      children: [
        GestureDetector(
          onTap: hasAvatar ? onAvatarTap : null,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              CircleAvatar(
                radius: 18,
                backgroundImage:
                    hasAvatar ? NetworkImage(chatAvatarUrl!) : null,
                child: !hasAvatar
                    ? Text(
                        chatTitle.isNotEmpty ? chatTitle[0].toUpperCase() : '?',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      )
                    : null,
              ),
              if (isContactOnline)
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: Colors.green,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: Theme.of(context).scaffoldBackgroundColor,
                        width: 1.5,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                chatTitle,
                key: const Key('chat_title_text'),
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
              if (isContactOnline &&
                  contactActivity != null &&
                  contactActivity!.isNotEmpty)
                Text(
                  contactActivity!,
                  key: const Key('typing_indicator_subtitle'),
                  style: const TextStyle(
                    fontSize: 12,
                    fontStyle: FontStyle.italic,
                    color: Colors.green,
                  ),
                  overflow: TextOverflow.ellipsis,
                )
              else if (isContactOnline)
                const Text(
                  'Online',
                  key: Key('contact_presence_subtitle'),
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.green,
                  ),
                )
              else
                Text(
                  contactLastSeenAt == null
                      ? 'Offline'
                      : _formatLastSeen(contactLastSeenAt!),
                  key: const Key('contact_presence_subtitle'),
                  style: const TextStyle(
                    fontSize: 11,
                    color: Colors.grey,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
