import 'package:flutter/material.dart';
import 'chat_app_bar_title.dart';

class ChatAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String chatTitle;
  final String? chatAvatarUrl;
  final bool isGroupChat;
  final int groupMemberCount;
  final bool isContactOnline;
  final String? contactActivity;
  final DateTime? contactLastSeenAt;
  final bool isMuted;
  final String? partnerId;
  final VoidCallback? onAvatarTap;
  final VoidCallback onSearchTap;
  final VoidCallback? onGroupInfoTap;
  final VoidCallback onToggleMute;
  final VoidCallback? onUserProfileTap;

  const ChatAppBar({
    super.key,
    required this.chatTitle,
    this.chatAvatarUrl,
    required this.isGroupChat,
    this.groupMemberCount = 0,
    required this.isContactOnline,
    this.contactActivity,
    this.contactLastSeenAt,
    required this.isMuted,
    this.partnerId,
    this.onAvatarTap,
    required this.onSearchTap,
    this.onGroupInfoTap,
    required this.onToggleMute,
    this.onUserProfileTap,
  });

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      title: ChatAppBarTitle(
        chatTitle: chatTitle,
        chatAvatarUrl: chatAvatarUrl,
        isGroupChat: isGroupChat,
        groupSubtitle: isGroupChat && groupMemberCount > 0
            ? '$groupMemberCount members'
            : null,
        isContactOnline: isContactOnline,
        contactActivity: contactActivity,
        contactLastSeenAt: contactLastSeenAt,
        onAvatarTap: onAvatarTap,
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.search),
          tooltip: 'Search messages',
          onPressed: onSearchTap,
        ),
        if (isGroupChat)
          IconButton(
            icon: const Icon(Icons.info_outline),
            tooltip: 'Group info',
            onPressed: onGroupInfoTap,
          ),
        IconButton(
          icon: Icon(isMuted ? Icons.notifications_off : Icons.notifications),
          tooltip: isMuted ? 'Unmute' : 'Mute',
          onPressed: onToggleMute,
        ),
        if (!isGroupChat && partnerId != null)
          IconButton(
            icon: const Icon(Icons.person_outline),
            tooltip: 'User profile',
            onPressed: onUserProfileTap,
          ),
      ],
    );
  }
}
