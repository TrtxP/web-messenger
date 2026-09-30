// ignore_for_file: library_prefixes

import 'dart:async';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:mobile_messenger/main.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../../../core/services/notification_service.dart';
import '../../profile/services/profile_service.dart';
import '../../profile/screens/profile_screen.dart';
import '../../profile/widgets/user_profile_modal.dart';
import '../../invitations/screens/invitations_screen.dart';
import '../services/chat_service.dart';
import '../widgets/full_screen_image_viewer.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.user,
    required this.onLogout,
    this.api,
    this.chatService,
    this.promptNotificationPermission = false,
  });
  final Map<String, dynamic> user;
  final VoidCallback onLogout;
  final Api? api;
  final ChatService? chatService;
  final bool promptNotificationPermission;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final Api api = widget.api ?? Api();
  late final ChatService chatService = widget.chatService ?? ChatService();
  final profileService = ProfileService();
  List<dynamic> activeChats = [];
  bool isLoading = true;
  bool showingArchived = false;
  Timer? chatRefreshTimer;
  Timer? presenceTimer;
  bool isFetchingChats = false;
  final Map<String, String> _lastKnownMessageIds = {};
  final Set<String> _knownInvitationIds = {};
  String? _currentOpenChatId;
  IO.Socket? _socket;
  bool _isFirstChatLoad = true;
  bool _isFirstInviteLoad = true;
  bool _askedNotificationPermission = false;

  @override
  void initState() {
    super.initState();
    _fetchChats();
    _markPresence();
    _checkInvitations();
    _initSocketListener();
    NotificationService.currentUserId =
        (widget.user['id'] ?? widget.user['user']?['id'])?.toString();
    NotificationService().initFirebaseMessaging(api);
    if (widget.promptNotificationPermission) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!_askedNotificationPermission && mounted) {
          _askedNotificationPermission = true;
          await NotificationService().requestPermission(context);
        }
      });
    }
    presenceTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _markPresence();
      _checkInvitations();
    });
    chatRefreshTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _fetchChats(showLoading: false),
    );
  }

  @override
  void dispose() {
    _socket?.disconnect();
    _socket?.dispose();
    chatRefreshTimer?.cancel();
    presenceTimer?.cancel();
    super.dispose();
  }

  Future<void> _markPresence() async {
    try {
      await api.post('/users/presence', {});
    } catch (_) {}
  }

  Future<void> _fetchChats({bool showLoading = true}) async {
    if (isFetchingChats) return;
    isFetchingChats = true;
    if (showLoading && mounted) setState(() => isLoading = true);
    try {
      final list =
          await api.get('/chats${showingArchived ? '?archived=true' : ''}');
      if (mounted) {
        final newChats = List.from(list);
        _checkAndNotifyNewMessages(newChats);
        _markDeliveredForIncomingChats(newChats);
        setState(() {
          activeChats = newChats;
          activeChats.sort((a, b) {
            final timeA = a['lastMessageTimestamp'] ??
                a['updatedAt'] ??
                a['created_at'] ??
                '';
            final timeB = b['lastMessageTimestamp'] ??
                b['updatedAt'] ??
                b['created_at'] ??
                '';
            return timeB.toString().compareTo(timeA.toString());
          });
          isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => isLoading = false);
        if (showLoading) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content:
                  const Text('Could not load chats - check your connection.'),
              action: SnackBarAction(label: 'Retry', onPressed: _fetchChats),
            ),
          );
        }
      }
    } finally {
      isFetchingChats = false;
    }
  }

  void _markDeliveredForIncomingChats(List<dynamic> chats) {
    final myId = (widget.user['id'] ?? widget.user['user']?['id'])?.toString();
    for (final chat in chats) {
      if (chat is Map) {
        final chatId = chat['id']?.toString();
        final lastMsg = chat['lastMessage'];
        final unreadCount = (chat['unreadCount'] as int?) ?? 0;

        final isIncomingSent = lastMsg is Map &&
            lastMsg['senderId']?.toString() != myId &&
            lastMsg['status'] == 'sent';

        if (chatId != null &&
            chatId.isNotEmpty &&
            (unreadCount > 0 || isIncomingSent)) {
          unawaited(chatService.markMessagesDelivered(chatId));
        }
      }
    }
  }

  void _checkAndNotifyNewMessages(List<dynamic> chats) {
    if (_isFirstChatLoad) {
      for (final chat in chats) {
        if (chat is Map) {
          final chatId = chat['id']?.toString();
          final lastMsg = chat['lastMessage'];
          if (chatId != null && lastMsg is Map && lastMsg['id'] != null) {
            _lastKnownMessageIds[chatId] = lastMsg['id'].toString();
          }
        }
      }
      _isFirstChatLoad = false;
      return;
    }

    for (final chat in chats) {
      if (chat is Map) {
        final chatId = chat['id']?.toString() ?? '';
        final lastMsg = chat['lastMessage'];
        final isMuted = chat['isMuted'] == true;
        final partner = chat['partner'];
        final partnerName = (partner is Map && partner['username'] != null)
            ? partner['username'].toString()
            : 'Chat';

        if (lastMsg is Map) {
          final msgId = lastMsg['id']?.toString();
          final senderId = lastMsg['senderId']?.toString();
          final myId =
              (widget.user['id'] ?? widget.user['user']?['id'])?.toString();

          if (msgId != null && senderId != null && senderId != myId) {
            final status = lastMsg['status']?.toString();
            if (status == 'read') {
              _lastKnownMessageIds[chatId] = msgId;
            } else {
              final previousId = _lastKnownMessageIds[chatId];
              if (previousId != msgId) {
                _lastKnownMessageIds[chatId] = msgId;
                debugPrint(
                    '[HomeScreen] New message in chat $chatId from $partnerName');
                NotificationService().showChatMessageNotification(
                  chatId: chatId,
                  senderName: partnerName,
                  content: lastMsg['content']?.toString() ?? '',
                  type: lastMsg['type']?.toString() ?? 'TEXT',
                  isMuted: isMuted,
                  isChatActive: _currentOpenChatId == chatId,
                );
              }
            }
          }
        }
      }
    }
  }

  Future<void> _checkInvitations() async {
    try {
      final res = await api.request('/invitations/pending');
      if (res is Map<String, dynamic> && res['received'] is List) {
        final received = res['received'] as List<dynamic>;
        if (_isFirstInviteLoad) {
          for (final inv in received) {
            if (inv is Map && inv['id'] != null) {
              _knownInvitationIds.add(inv['id'].toString());
            }
          }
          _isFirstInviteLoad = false;
          return;
        }

        for (final inv in received) {
          if (inv is Map && inv['id'] != null) {
            final invId = inv['id'].toString();
            if (!_knownInvitationIds.contains(invId)) {
              _knownInvitationIds.add(invId);
              final sender =
                  (inv['from'] ?? inv['sender']) as Map<String, dynamic>?;
              final senderName = (sender != null && sender['username'] != null)
                  ? sender['username'].toString()
                  : 'User';
              debugPrint(
                  '[HomeScreen] Found new invitation from $senderName (ID: $invId)');
              NotificationService().showInvitationNotification(
                invitationId: invId,
                senderName: senderName,
              );
            }
          }
        }
      }
    } catch (e) {
      debugPrint('[HomeScreen] _checkInvitations error: $e');
    }
  }

  void _initSocketListener() async {
    final token = await api.getToken();
    if (token == null) return;

    _socket = IO.io(
      apiUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .build(),
    );

    _socket?.on('invitation:resolved', (data) {
      final status = data['status'];
      final name = data['responderName'] ?? 'User';

      if (status == 'accepted') {
        NotificationService().showSimpleNotification(
            title: 'Invitation accepted',
            body:
                'User $name accepted your invitation. Now you can chat with each other.');
        _fetchChats(showLoading: false);
      } else {
        NotificationService().showSimpleNotification(
            title: 'Invitation rejected',
            body: 'User $name rejected your invitation.');
      }
    });
  }

  Future<void> _toggleMute(String chatId, bool muted) async {
    try {
      await chatService.toggleMute(chatId, muted);
      if (mounted) {
        setState(() {
          for (var i = 0; i < activeChats.length; i++) {
            if (activeChats[i] is Map &&
                activeChats[i]['id']?.toString() == chatId) {
              activeChats[i]['isMuted'] = muted;
            }
          }
        });
      }
    } catch (_) {
      await _fetchChats(showLoading: false);
    }
  }

  Future<void> _toggleArchive(String chatId, bool archive) async {
    try {
      await api.post('/chats/$chatId/archive', {'archived': archive});
      _fetchChats();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(archive ? 'Chat archived' : 'Chat unarchived')),
        );
      }
    } catch (_) {}
  }

  Future<bool> _confirmDeleteChat(String title) async {
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

  Future<void> _deleteChat(String chatId) async {
    if (!mounted) return;
    setState(() => activeChats.removeWhere(
          (chat) => chat is Map && chat['id']?.toString() == chatId,
        ));
    try {
      await chatService.deleteChat(chatId);
    } catch (_) {
      await _fetchChats();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not delete chat. Try again.')),
        );
      }
    }
  }

  Future<void> _showChatActions(String chatId, String title) async {
    final chat = activeChats.firstWhere(
      (c) => c is Map && c['id']?.toString() == chatId,
      orElse: () => null,
    );
    final isMuted = chat is Map && chat['isMuted'] == true;

    final action = await showDialog<String>(
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
          if (chat is Map &&
              chat['partner'] is Map &&
              chat['partner']['id'] != null)
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

    if (!mounted) return;
    if (action == 'profile' && chat is Map && chat['partner'] is Map) {
      final partner = chat['partner'];
      final pId = partner['id']?.toString() ?? '';
      final pName = partner['username']?.toString() ??
          partner['name']?.toString() ??
          title;
      final pAvatar =
          profileService.resolveAvatarUrl(partner['avatarUrl']?.toString());
      await UserProfileModal.show(
        context,
        userId: pId,
        username: pName,
        avatarUrl: pAvatar,
        profileService: profileService,
      );
    } else if (action == 'archive') {
      await _toggleArchive(chatId, true);
    } else if (action == 'unarchive') {
      await _toggleArchive(chatId, false);
    } else if (action == 'mute') {
      await _toggleMute(chatId, true);
    } else if (action == 'unmute') {
      await _toggleMute(chatId, false);
    } else if (action == 'delete' && await _confirmDeleteChat(title)) {
      await _deleteChat(chatId);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(showingArchived ? 'Archived Chats' : 'Chats'),
        actions: [
          IconButton(
            icon: Icon(showingArchived ? Icons.unarchive : Icons.archive),
            tooltip: showingArchived ? 'Active chats' : 'Archived chats',
            onPressed: () {
              setState(() => showingArchived = !showingArchived);
              _fetchChats();
            },
          ),
          IconButton(
            icon: const Icon(Icons.mail),
            tooltip: 'Invitations',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const InvitationsScreen()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.person),
            tooltip: 'Profile',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => ProfileScreen(
                  user: widget.user,
                  onUpdated: (_) => _fetchChats(),
                ),
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: widget.onLogout,
          ),
        ],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : activeChats.isEmpty
              ? Center(
                  child: Text(
                    showingArchived
                        ? 'No archived chats'
                        : 'No chats yet. Search for users to invite them!',
                    textAlign: TextAlign.center,
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _fetchChats,
                  child: ListView.builder(
                    itemCount: activeChats.length,
                    itemBuilder: (context, index) {
                      final chat = activeChats[index] as Map<String, dynamic>;
                      final chatId = chat['id']?.toString() ?? 'chat_$index';
                      final partner = chat['partner'];
                      final avatarUrl = partner is Map
                          ? profileService.resolveAvatarUrl(
                              partner['avatarUrl']?.toString())
                          : null;
                      final title = (partner is Map
                              ? (partner['username']?.toString() ??
                                  partner['name']?.toString())
                              : null) ??
                          (chat['title']?.toString().isNotEmpty == true &&
                                  chat['title'] != 'Chat'
                              ? chat['title'].toString()
                              : null) ??
                          'Chat';
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
                            return _confirmDeleteChat(title);
                          }
                          return true;
                        },
                        onDismissed: (direction) {
                          if (direction == DismissDirection.startToEnd) {
                            unawaited(_deleteChat(chatId));
                          } else {
                            unawaited(
                              _toggleArchive(chatId, !showingArchived),
                            );
                          }
                        },
                        child: RawGestureDetector(
                          behavior: HitTestBehavior.opaque,
                          gestures: <Type, GestureRecognizerFactory>{
                            LongPressGestureRecognizer:
                                GestureRecognizerFactoryWithHandlers<
                                    LongPressGestureRecognizer>(
                              () => LongPressGestureRecognizer(
                                duration: const Duration(milliseconds: 1500),
                              ),
                              (recognizer) => recognizer.onLongPress =
                                  () => _showChatActions(chatId, title),
                            ),
                          },
                          child: ListTile(
                            leading: Stack(
                              children: [
                                GestureDetector(
                                  onTap: avatarUrl == null
                                      ? null
                                      : () => Navigator.push(
                                            context,
                                            MaterialPageRoute(
                                              builder: (_) =>
                                                  FullScreenImageViewer(
                                                imageUrl: avatarUrl,
                                              ),
                                            ),
                                          ),
                                  child: CircleAvatar(
                                    backgroundImage: avatarUrl == null
                                        ? null
                                        : NetworkImage(avatarUrl),
                                    child: avatarUrl == null
                                        ? Text(title.isNotEmpty
                                            ? title[0].toUpperCase()
                                            : '?')
                                        : null,
                                  ),
                                ),
                                if (partner is Map &&
                                    partner['isOnline'] == true)
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
                                const Text('Now',
                                    style: TextStyle(
                                        fontSize: 12, color: Colors.grey)),
                                if (unreadCount > 0)
                                  Badge(label: Text(unreadCount.toString()))
                                else
                                  const SizedBox(height: 16),
                              ],
                            ),
                            onTap: () async {
                              _currentOpenChatId = chatId;
                              NotificationService.activeChatId = chatId;
                              unawaited(
                                NotificationService()
                                    .cancelChatNotifications(chatId),
                              );
                              await Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) =>
                                      ChatScreen(chat: chat, user: widget.user),
                                ),
                              );
                              NotificationService.activeChatId = null;
                              _currentOpenChatId = null;
                              _fetchChats();
                            },
                          ),
                        ),
                      );
                    },
                  ),
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => showSearch(
          context: context,
          delegate: UserSearch(api, widget.user),
        ),
        child: const Icon(Icons.person_add),
      ),
    );
  }
}
