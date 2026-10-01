import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import '../../profile/services/profile_service.dart';

class ChatListItem extends StatelessWidget {
  final Map<String, dynamic> chat;
  final bool showingArchived;
  final ProfileService profileService;
  final VoidCallback onTap;
  final VoidCallback onLongPress;
  final Future<bool> Function() onConfirmDelete;
  final VoidCallback onDelete;
  final VoidCallback onToggleArchive;
  final void Function(String imageUrl)? onAvatarTap;

  const ChatListItem({
    super.key,
    required this.chat,
    required this.showingArchived,
    required this.profileService,
    required this.onTap,
    required this.onLongPress,
    required this.onConfirmDelete,
    required this.onDelete,
    required this.onToggleArchive,
    this.onAvatarTap,
  });

  @override
  Widget build(BuildContext context) {
    final chatId = chat['id']?.toString() ?? '';
    final isGroup = chat['type']?.toString() == 'group';
    final partner = chat['partner'];
    final avatarUrl = isGroup
        ? (chat['groupAvatarUrl']?.toString().isNotEmpty == true
            ? profileService.resolveAvatarUrl(chat['groupAvatarUrl']?.toString())
            : null)
        : (partner is Map
            ? profileService.resolveAvatarUrl(partner['avatarUrl']?.toString())
            : null);

    final title = isGroup
        ? (chat['groupName']?.toString().isNotEmpty == true
            ? chat['groupName'].toString()
            : (chat['title']?.toString().isNotEmpty == true
                ? chat['title'].toString()
                : 'Group'))
        : ((partner is Map
                ? (partner['username']?.toString() ?? partner['name']?.toString())
                : null) ??
            (chat['title']?.toString().isNotEmpty == true && chat['title'] != 'Chat'
                ? chat['title'].toString()
                : null) ??
            'Chat');

    final lastMessageObj = chat['lastMessage'];
    final lastMsg = lastMessageObj is Map
        ? (lastMessageObj['content']?.toString() ??
            lastMessageObj['text']?.toString() ??
            '')
        : '';
    final unreadCount = (chat['unreadCount'] as int?) ?? 0;

    return Dismissible(
      key: Key(chatId),
      direction: DismissDirection.horizontal,
      background: Container(
        color: Colors.red,
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 20),
        child: const Icon(
          Icons.delete,
          color: Colors.white,
        ),
      ),
      secondaryBackground: Container(
        color: Colors.blueGrey,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: Icon(
          showingArchived ? Icons.unarchive : Icons.archive,
          color: Colors.white,
        ),
      ),
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          return await onConfirmDelete();
        }
        return true;
      },
      onDismissed: (direction) {
        if (direction == DismissDirection.startToEnd) {
          onDelete();
        } else {
          onToggleArchive();
        }
      },
      child: RawGestureDetector(
        behavior: HitTestBehavior.opaque,
        gestures: <Type, GestureRecognizerFactory>{
          LongPressGestureRecognizer:
              GestureRecognizerFactoryWithHandlers<LongPressGestureRecognizer>(
            () => LongPressGestureRecognizer(
              duration: const Duration(milliseconds: 1500),
            ),
            (recognizer) => recognizer.onLongPress = onLongPress,
          ),
        },
        child: ListTile(
          leading: Stack(
            children: [
              GestureDetector(
                onTap: avatarUrl == null
                    ? null
                    : () {
                        if (onAvatarTap != null) {
                          onAvatarTap!(avatarUrl);
                        }
                      },
                child: CircleAvatar(
                  backgroundColor: isGroup ? Colors.indigo.shade100 : null,
                  backgroundImage:
                      avatarUrl == null ? null : NetworkImage(avatarUrl),
                  child: avatarUrl == null
                      ? (isGroup
                          ? const Icon(Icons.group, color: Colors.indigo)
                          : Text(title.isNotEmpty ? title[0].toUpperCase() : '?'))
                      : null,
                ),
              ),
              if (!isGroup && partner is Map && partner['isOnline'] == true)
                const Positioned(
                  right: 0,
                  bottom: 0,
                  child: CircleAvatar(
                    radius: 5,
                    backgroundColor: Colors.green,
                  ),
                ),
            ],
          ),
          title: Row(
            children: [
              Expanded(child: Text(title)),
              if (isGroup)
                Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: Text(
                    '${chat['memberCount'] ?? ''}',
                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ),
              if (chat['isMuted'] == true)
                const Padding(
                  padding: EdgeInsets.only(left: 4),
                  child: Icon(
                    Icons.notifications_off,
                    size: 16,
                    color: Colors.grey,
                  ),
                ),
            ],
          ),
          subtitle: Text(
            lastMsg.isEmpty ? 'No messages yet' : lastMsg,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text(
                'Now',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              if (unreadCount > 0)
                Badge(label: Text(unreadCount.toString()))
              else
                const SizedBox(height: 16),
            ],
          ),
          onTap: onTap,
        ),
      ),
    );
  }
}
