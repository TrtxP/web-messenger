import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile_messenger/main.dart';
import '../../../core/services/notification_service.dart';
import '../../../core/widgets/connectivity_banner.dart';
import '../../profile/services/profile_service.dart';
import '../../profile/screens/profile_screen.dart';
import '../../profile/widgets/user_profile_modal.dart';
import '../../invitations/screens/invitations_screen.dart';
import '../services/chat_service.dart';
import '../widgets/full_screen_image_viewer.dart';
import '../widgets/home_app_bar.dart';
import '../widgets/chat_list_item.dart';
import '../widgets/chat_actions_dialog.dart';
import '../controllers/home_socket_controller.dart';
import '../../groups/screens/create_group_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.user,
    required this.onLogout,
    this.api,
    this.chatService,
    this.promptNotificationPermission = false,
    this.onChatSelected,
    this.onOpenSecondPanel,
    this.onChatDeleted,
  });

  final Map<String, dynamic> user;
  final VoidCallback onLogout;
  final Api? api;
  final ChatService? chatService;
  final bool promptNotificationPermission;
  final void Function(Map<String, dynamic> chat)? onChatSelected;
  final void Function(Map<String, dynamic> chat)? onOpenSecondPanel;
  final void Function(String chatId)? onChatDeleted;

  @override
  State<HomeScreen> createState() => HomeScreenState();
}

class HomeScreenState extends State<HomeScreen> {
  Future<void> fetchChats({bool showLoading = true}) =>
      _fetchChats(showLoading: showLoading);

  late final Api api = widget.api ?? Api();
  late final ChatService chatService = widget.chatService ?? ChatService();
  final profileService = ProfileService();

  List<dynamic> activeChats = [];
  bool isLoading = true;
  bool showingArchived = false;
  bool isFetchingChats = false;

  Timer? chatRefreshTimer;
  Timer? presenceTimer;

  final Map<String, String> _lastKnownMessageIds = {};
  final Set<String> _knownInvitationIds = {};
  String? _currentOpenChatId;
  late final HomeSocketController _socketController;

  bool _isFirstChatLoad = true;
  bool _isFirstInviteLoad = true;
  bool _askedNotificationPermission = false;
  bool _isOffline = false;
  bool _isDisposed = false;

  @override
  void initState() {
    super.initState();
    _fetchChats();
    _markPresence();
    _checkInvitations();

    _socketController = HomeSocketController(
      api: api,
      onChatsNeedsRefresh: () => _fetchChats(showLoading: false),
      onChatDeleted: (deletedChatId) {
        widget.onChatDeleted?.call(deletedChatId);
      },
      onConnectivityChanged: (isOffline) {
        if (mounted && !_isDisposed) {
          setState(() => _isOffline = isOffline);
        }
      },
    );
    _socketController.connect();

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
    });
    chatRefreshTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _fetchChats(showLoading: false),
    );
  }

  @override
  void dispose() {
    _isDisposed = true;
    _socketController.dispose();
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
    if (isFetchingChats || _isDisposed) return;
    isFetchingChats = true;
    if (showLoading && mounted && !_isDisposed) {
      setState(() => isLoading = true);
    }
    try {
      final list =
          await api.get('/chats${showingArchived ? '?archived=true' : ''}');
      if (mounted && !_isDisposed) {
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
      if (mounted && !_isDisposed) {
        setState(() => isLoading = false);
        if (showLoading && context.mounted) {
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
    } catch (_) {}
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

  Future<void> _deleteChat(String chatId) async {
    if (!mounted) return;
    setState(() => activeChats.removeWhere(
          (chat) => chat is Map && chat['id']?.toString() == chatId,
        ));
    try {
      await chatService.deleteChat(chatId);
      widget.onChatDeleted?.call(chatId);
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
    final hasPartner = chat is Map &&
        chat['partner'] is Map &&
        chat['partner']['id'] != null;

    final action = await ChatActionsDialog.showChatActions(
      context,
      title: title,
      showingArchived: showingArchived,
      isMuted: isMuted,
      hasPartner: hasPartner,
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
    } else if (action == 'delete' &&
        await ChatActionsDialog.showConfirmDelete(context, title)) {
      await _deleteChat(chatId);
    }
  }

  Future<void> _handleChatTap(Map<String, dynamic> chat) async {
    final chatId = chat['id']?.toString() ?? '';
    if (widget.onChatSelected != null) {
      widget.onChatSelected!(chat);
      _currentOpenChatId = chatId;
      NotificationService.activeChatId = chatId;
      unawaited(NotificationService().cancelChatNotifications(chatId));
      return;
    }
    _currentOpenChatId = chatId;
    NotificationService.activeChatId = chatId;
    unawaited(NotificationService().cancelChatNotifications(chatId));
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChatScreen(chat: chat, user: widget.user),
      ),
    );
    NotificationService.activeChatId = null;
    _currentOpenChatId = null;
    _fetchChats();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: HomeAppBar(
        showingArchived: showingArchived,
        onToggleArchived: () {
          setState(() => showingArchived = !showingArchived);
          _fetchChats();
        },
        onOpenInvitations: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const InvitationsScreen()),
        ),
        onOpenProfile: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ProfileScreen(
              user: widget.user,
              onUpdated: (_) => _fetchChats(),
            ),
          ),
        ),
        onLogout: widget.onLogout,
      ),
      body: Column(
        children: [
          ConnectivityBanner(isOffline: _isOffline),
          Expanded(
            child: isLoading
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
                            final chat =
                                activeChats[index] as Map<String, dynamic>;
                            final chatId =
                                chat['id']?.toString() ?? 'chat_$index';
                            final isGroup = chat['type']?.toString() == 'group';
                            final title = isGroup
                                ? (chat['groupName']?.toString().isNotEmpty ==
                                        true
                                    ? chat['groupName'].toString()
                                    : (chat['title']?.toString().isNotEmpty ==
                                            true
                                        ? chat['title'].toString()
                                        : 'Group'))
                                : (((chat['partner'] is Map
                                            ? (chat['partner']['username']
                                                    ?.toString() ??
                                                chat['partner']['name']
                                                    ?.toString())
                                            : null) ??
                                        (chat['title']?.toString().isNotEmpty ==
                                                    true &&
                                                chat['title'] != 'Chat'
                                            ? chat['title'].toString()
                                            : null) ??
                                        'Chat'));

                            return ChatListItem(
                              chat: chat,
                              showingArchived: showingArchived,
                              profileService: profileService,
                              onTap: () => _handleChatTap(chat),
                              onLongPress: () {
                                if (widget.onOpenSecondPanel != null) {
                                  widget.onOpenSecondPanel!(chat);
                                } else {
                                  _showChatActions(chatId, title);
                                }
                              },
                              onConfirmDelete: () =>
                                  ChatActionsDialog.showConfirmDelete(
                                      context, title),
                              onDelete: () => unawaited(_deleteChat(chatId)),
                              onToggleArchive: () => unawaited(
                                _toggleArchive(chatId, !showingArchived),
                              ),
                              onAvatarTap: (avatarUrl) => Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => FullScreenImageViewer(
                                    imageUrl: avatarUrl,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
      floatingActionButton: PopupMenuButton<String>(
        icon: const Icon(Icons.add),
        onSelected: (v) async {
          if (v == 'search') {
            showSearch(
              context: context,
              delegate: UserSearch(api, widget.user),
            );
          } else if (v == 'group') {
            final created = await Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const CreateGroupScreen()),
            );
            if (created == true && mounted && context.mounted) {
              _fetchChats();
              final messenger = ScaffoldMessenger.of(context);
              messenger.clearSnackBars();
              messenger.showSnackBar(
                const SnackBar(
                    content: Text(
                        'Group created, invitations sent (pending)')),
              );
            }
          }
        },
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'search', child: Text('Search users')),
          PopupMenuItem(value: 'group', child: Text('Create group')),
        ],
      ),
    );
  }
}
