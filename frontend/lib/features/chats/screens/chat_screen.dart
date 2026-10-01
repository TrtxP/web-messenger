// ignore_for_file: unnecessary_cast

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/utils/platform_utils.dart';
import '../../../core/widgets/connectivity_banner.dart';
import '../../../core/services/notification_service.dart';
import '../../../core/network/api_client.dart';
import '../services/chat_service.dart';
import '../services/chat_media_handler.dart';
import '../services/chat_audio_recorder.dart';
import '../services/poll_service.dart';
import '../controllers/chat_socket_controller.dart';
import '../controllers/chat_presence_controller.dart';
import '../widgets/chat_app_bar.dart';
import '../widgets/chat_input_bar.dart';
import '../widgets/chat_message_list.dart';
import '../widgets/chat_search_bar.dart';
import '../widgets/create_poll_dialog.dart';
import '../widgets/full_screen_image_viewer.dart';
import '../widgets/message_action_dialogs.dart';
import '../../profile/services/profile_service.dart';
import '../../profile/widgets/user_profile_modal.dart';
import '../../groups/screens/group_info_screen.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.chat,
    required this.user,
    this.onClose,
  });

  final Map<String, dynamic> chat;
  final Map<String, dynamic> user;
  final VoidCallback? onClose;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ChatService _chatService = ChatService();
  final ProfileService _profileService = ProfileService();
  final PollService _pollService = PollService();
  late final ChatMediaHandler _mediaHandler =
      ChatMediaHandler(chatService: _chatService);
  final ChatAudioRecorder _audioRecorder = ChatAudioRecorder();

  final TextEditingController textController = TextEditingController();
  final ScrollController scrollController = ScrollController();

  late final ChatSocketController _socketController;
  late final ChatPresenceController _presenceController;

  List<dynamic> messages = [];
  bool isLoading = true;
  bool isRefreshingMessages = false;
  bool isMuted = false;

  bool isContactOnline = false;
  String? contactActivity;
  DateTime? contactLastSeenAt;

  bool _isSearchOpen = false;
  String? _highlightMessageId;
  String? _searchQuery;
  bool _isOffline = false;

  Map<String, String> _senderNames = {};
  int _groupMemberCount = 0;
  bool _isGroupInfoOpen = false;
  bool _isDisposed = false;
  Timer? _messageRefreshTimer;

  @override
  void initState() {
    super.initState();
    NotificationService.activeChatId = widget.chat['id']?.toString();
    if (chatId.isNotEmpty) {
      unawaited(NotificationService().cancelChatNotifications(chatId));
      unawaited(_chatService.markChatRead(chatId).catchError((_) {}));
    }
    isMuted = widget.chat['isMuted'] == true;
    final partner = widget.chat['partner'];
    isContactOnline = partner is Map && partner['isOnline'] == true;

    _fetchMessages();
    if (isGroupChat) {
      _loadGroupMembers();
    }

    _presenceController = ChatPresenceController(
      chatId: chatId,
      isGroupChat: isGroupChat,
      chatService: _chatService,
      onPartnerPresenceChanged: (isOnline, activity, lastSeenAt) {
        if (mounted && !_isDisposed) {
          if (isContactOnline != isOnline ||
              contactActivity != activity ||
              contactLastSeenAt != lastSeenAt) {
            setState(() {
              isContactOnline = isOnline;
              contactActivity = activity;
              contactLastSeenAt = lastSeenAt;
            });
          }
        }
      },
    );
    _presenceController.init();

    _socketController = ChatSocketController(
      chatId: chatId,
      onMessageStatusUpdated: (msgId, newStatus, targetChatId) {
        if (!mounted || _isDisposed) return;
        if (targetChatId != null && targetChatId != chatId) return;
        setState(() {
          final index =
              messages.indexWhere((m) => m['id']?.toString() == msgId);
          if (index != -1) {
            messages[index]['status'] = newStatus;
          }
        });
      },
      onChatDeleted: (deletedChatId) {
        if (!mounted || _isDisposed) return;
        if (deletedChatId == chatId) {
          _handleCloseChat();
        }
      },
      onConnectivityChanged: (isOffline) {
        if (mounted && !_isDisposed) {
          setState(() => _isOffline = isOffline);
        }
      },
    );
    _socketController.connect();

    _messageRefreshTimer =
        Timer.periodic(const Duration(seconds: 4), (_) => _fetchMessages());
  }

  @override
  void dispose() {
    _isDisposed = true;
    _socketController.dispose();
    _presenceController.dispose();
    _audioRecorder.dispose();
    _messageRefreshTimer?.cancel();

    textController.dispose();
    scrollController.dispose();

    if (NotificationService.activeChatId == widget.chat['id']?.toString()) {
      NotificationService.activeChatId = null;
    }
    super.dispose();
  }

  String get currentUserId {
    if (widget.user['id'] != null) return widget.user['id'].toString();
    if (widget.user['user'] is Map) return widget.user['user']['id'].toString();
    return '';
  }

  String get chatId => widget.chat['id']?.toString() ?? '';

  String? get partnerId {
    final partner = widget.chat['partner'];
    if (partner is Map && partner['id'] != null) {
      return partner['id'].toString();
    }
    return null;
  }

  bool get _isDesktop => isDesktopPlatform;
  bool get isGroupChat => widget.chat['type']?.toString() == 'group';

  String get chatTitle {
    if (isGroupChat) {
      final g = widget.chat['groupName']?.toString() ??
          widget.chat['title']?.toString();
      if (g != null && g.isNotEmpty) return g;
      return 'Group';
    }
    final partner = widget.chat['partner'];
    if (partner is Map) {
      final name = partner['username']?.toString() ??
          partner['name']?.toString() ??
          partner['displayName']?.toString();
      if (name != null && name.isNotEmpty) return name;
    }
    final title = widget.chat['title']?.toString();
    if (title != null && title.isNotEmpty && title != 'Chat') return title;
    return 'Chat';
  }

  String? get chatAvatarUrl {
    if (isGroupChat) {
      return _profileService
          .resolveAvatarUrl(widget.chat['groupAvatarUrl']?.toString());
    }
    final partner = widget.chat['partner'];
    if (partner is! Map) return null;
    return _profileService.resolveAvatarUrl(partner['avatarUrl']?.toString());
  }

  Future<void> _loadGroupMembers() async {
    try {
      final res = await Api().get('/groups/$chatId');
      if (res.isNotEmpty && res.first is Map) {
        final info = Map<String, dynamic>.from(res.first as Map);
        final members = (info['members'] as List?) ?? [];
        final map = <String, String>{};
        for (final m in members) {
          if (m is Map) {
            final uid =
                m['userId']?.toString() ?? m['user_id']?.toString() ?? '';
            final uname = m['username']?.toString() ?? 'User';
            if (uid.isNotEmpty) map[uid] = uname;
          }
        }
        if (mounted && !_isDisposed) {
          setState(() {
            _senderNames = map;
            _groupMemberCount = members.length;
          });
        }
      }
    } catch (_) {}
  }

  bool _hasUnreadIncoming(List<dynamic> list) {
    return list.any((m) {
      if (m is! Map) return false;
      final sender = (m['senderId'] ?? m['sender_id'])?.toString();
      final status = m['status']?.toString();
      final deleted = m['isDeleted'] == true || m['is_deleted'] == true;
      return !deleted &&
          sender != null &&
          sender.isNotEmpty &&
          sender != currentUserId &&
          status != 'read';
    });
  }

  Future<void> _fetchMessages() async {
    if (isRefreshingMessages) return;
    isRefreshingMessages = true;
    try {
      final list = await _chatService.fetchMessages(chatId);
      if (_hasUnreadIncoming(list) &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        try {
          await _chatService.markChatRead(chatId);
        } catch (_) {}
        unawaited(NotificationService().cancelChatNotifications(chatId));
      }
      if (mounted && !_isDisposed) {
        setState(() {
          final pending = messages.where((message) {
            return message is Map &&
                message['id']?.toString().startsWith('local_') == true;
          });
          messages = [...list, ...pending];
          isLoading = false;
        });
      }
    } catch (_) {
      if (mounted && !_isDisposed) setState(() => isLoading = false);
    } finally {
      isRefreshingMessages = false;
    }
  }

  void _scrollToMessage(String messageId) {
    final index =
        messages.indexWhere((m) => (m as Map)['id']?.toString() == messageId);
    if (index == -1) return;
    setState(() => _highlightMessageId = messageId);
    final visible = messages
        .where((m) =>
            (m as Map)['isDeleted'] != true && (m as Map)['is_deleted'] != true)
        .toList();
    final vIndex =
        visible.indexWhere((m) => (m as Map)['id']?.toString() == messageId);
    if (vIndex != -1 && scrollController.hasClients) {
      final offset =
          (vIndex * 80.0).clamp(0.0, scrollController.position.maxScrollExtent);
      scrollController.animateTo(offset,
          duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
    }
  }

  Future<void> _sendMessage({
    String type = 'TEXT',
    String? mediaId,
    String? defaultContent,
  }) async {
    if (type == 'TEXT') {
      await _presenceController.setMyActivity(null);
    }
    var text = textController.text.trim();
    if (type == 'TEXT' && (text.isEmpty || text.length > 4000)) return;
    if (type != 'TEXT' && text.isEmpty) {
      text = defaultContent ??
          (type == 'AUDIO'
              ? 'Voice message'
              : (type == 'IMAGE'
                  ? 'Image'
                  : (type == 'POLL' ? 'Poll' : 'Video')));
    }
    final tempMsg = {
      'id': 'local_${DateTime.now().millisecondsSinceEpoch}',
      'sender_id': currentUserId,
      'content': text,
      'type': type,
      if (mediaId != null) 'mediaId': mediaId,
      'status': 'pending',
      'created_at': DateTime.now().toIso8601String()
    };
    setState(() {
      messages.add(tempMsg);
      textController.clear();
    });
    try {
      final created =
          await _chatService.sendMessage(chatId, text, type, mediaId: mediaId);
      if (mounted) {
        setState(() {
          final index = messages.indexWhere((m) => m['id'] == tempMsg['id']);
          if (index != -1) {
            messages[index] = created;
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          final index = messages.indexWhere((m) => m['id'] == tempMsg['id']);
          if (index != -1) {
            messages[index]['status'] = 'failed';
          }
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.toString().replaceFirst('Exception: ', ''))));
      }
    }
  }

  void _retryMessage(String msgId) {
    final idx =
        messages.indexWhere((m) => (m as Map)['id']?.toString() == msgId);
    if (idx == -1) return;
    final old = Map<String, dynamic>.from(messages[idx] as Map);
    setState(() => messages.removeAt(idx));
    textController.text = old['content']?.toString() ?? '';
    _sendMessage(
        type: old['type']?.toString() ?? 'TEXT',
        mediaId: old['mediaId']?.toString() ?? old['media_id']?.toString());
  }

  Future<void> _openCreatePoll() async {
    final result = await CreatePollDialog.show(context);
    if (result == null) return;
    try {
      final poll = await _pollService.createPoll(
          chatId,
          result['question'] as String,
          List<String>.from(result['options'] as List),
          isAnonymous: result['isAnonymous'] as bool? ?? false);
      final pollId = poll['id']?.toString() ?? '';
      if (pollId.isNotEmpty) {
        textController.text = pollId;
        await _sendMessage(type: 'POLL');
      }
      _fetchMessages();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.toString().replaceFirst('Exception: ', ''))));
      }
    }
  }

  Future<void> _startRecording() async {
    await _audioRecorder.startRecording(
      context,
      onUpdate: () {
        if (mounted) setState(() {});
      },
    );
  }

  Future<void> _cancelRecording() async {
    await _audioRecorder.cancelRecording(
      onUpdate: () {
        if (mounted) setState(() {});
      },
    );
  }

  Future<void> _sendAudioRecording() async {
    final path = _audioRecorder.recordingPath;
    final duration = _audioRecorder.recordingSeconds;
    final recordedPath = await _audioRecorder.stopRecording(
      onUpdate: () {
        if (mounted) setState(() {});
      },
    );

    if (!mounted) return;
    await _mediaHandler.sendAudioRecording(
      context: context,
      isDesktop: _isDesktop,
      recordedPath: recordedPath,
      fallbackRecordingPath: path,
      durationSeconds: duration,
      onSendMessage: ({
        required String type,
        String? mediaId,
        String? defaultContent,
      }) =>
          _sendMessage(
              type: type, mediaId: mediaId, defaultContent: defaultContent),
      onSetActivity: _presenceController.setMyActivity,
    );
  }

  Future<void> _toggleMute() async {
    final newMute = !isMuted;
    try {
      await _chatService.toggleMute(chatId, newMute);
      if (mounted && !_isDisposed) {
        setState(() => isMuted = newMute);
        if (context.mounted) {
          ScaffoldMessenger.of(context).clearSnackBars();
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(
                  newMute ? 'Notifications muted' : 'Notifications unmuted')));
        }
      }
    } catch (_) {}
  }

  Future<void> _editMessage(String msgId, String oldText) async {
    final newText =
        await MessageActionDialogs.showEditMessageDialog(context, oldText);
    if (newText != null && newText.isNotEmpty && newText != oldText) {
      try {
        await _chatService.editMessage(chatId, msgId, newText);
        _fetchMessages();
      } catch (_) {}
    }
  }

  Future<void> _deleteMessage(String msgId) async {
    final confirm = await MessageActionDialogs.showDeleteMessageDialog(context);
    if (confirm == true) {
      try {
        await _chatService.deleteMessage(chatId, msgId);
        if (mounted) {
          setState(() {
            final idx =
                messages.indexWhere((m) => m['id']?.toString() == msgId);
            if (idx != -1) {
              messages.removeAt(idx);
            }
          });
        }
        await _fetchMessages();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Failed to delete message: $e')));
        }
      }
    }
  }

  void _showMessageActions(String msgId, String content, String type) {
    MessageActionDialogs.showMessageActionsModal(
      context,
      msgId: msgId,
      content: content,
      type: type,
      onEdit: () => _editMessage(msgId, content),
      onDelete: () => _deleteMessage(msgId),
    );
  }

  void _openImageViewer(String imageUrl) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => FullScreenImageViewer(imageUrl: imageUrl),
      ),
    );
  }

  void _handleCloseChat() {
    NotificationService.activeChatId = null;
    if (widget.onClose != null) {
      if (_isGroupInfoOpen && mounted && Navigator.canPop(context)) {
        Navigator.pop(context);
        _isGroupInfoOpen = false;
      }
      widget.onClose!();
    } else if (mounted && Navigator.canPop(context)) {
      Navigator.pop(context, true);
    }
  }

  void _openGroupInfo() async {
    _isGroupInfoOpen = true;
    final changed = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => GroupInfoScreen(groupId: chatId)),
    );
    _isGroupInfoOpen = false;
    if (changed == true && mounted) {
      _handleCloseChat();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: ChatAppBar(
        chatTitle: chatTitle,
        chatAvatarUrl: chatAvatarUrl,
        isGroupChat: isGroupChat,
        groupMemberCount: _groupMemberCount,
        isContactOnline: isContactOnline,
        contactActivity: contactActivity,
        contactLastSeenAt: contactLastSeenAt,
        isMuted: isMuted,
        partnerId: partnerId,
        onAvatarTap: chatAvatarUrl == null
            ? null
            : () => _openImageViewer(chatAvatarUrl!),
        onSearchTap: () => setState(() => _isSearchOpen = !_isSearchOpen),
        onGroupInfoTap: isGroupChat ? _openGroupInfo : null,
        onToggleMute: _toggleMute,
        onUserProfileTap: (!isGroupChat && partnerId != null)
            ? () {
                UserProfileModal.show(
                  context,
                  userId: partnerId!,
                  username: chatTitle,
                  avatarUrl: chatAvatarUrl,
                  profileService: _profileService,
                );
              }
            : null,
      ),
      body: Column(
        children: [
          ConnectivityBanner(isOffline: _isOffline),
          if (_isSearchOpen)
            ChatSearchBar(
              chatId: chatId,
              chatService: _chatService,
              onNavigateToMessage: _scrollToMessage,
              onClose: () => setState(() {
                _isSearchOpen = false;
                _highlightMessageId = null;
                _searchQuery = null;
              }),
              onQueryChanged: (q) =>
                  setState(() => _searchQuery = q.isEmpty ? null : q),
            ),
          Expanded(
            child: ChatMessageList(
              scrollController: scrollController,
              isLoading: isLoading,
              messages: messages,
              currentUserId: currentUserId,
              isGroupChat: isGroupChat,
              highlightQuery: _searchQuery,
              highlightMessageId: _highlightMessageId,
              senderNames: _senderNames,
              onRetryMessage: _retryMessage,
              formatMediaStreamUrl: (mediaId) =>
                  (mediaId != null && mediaId.isNotEmpty)
                      ? _chatService.formatMediaStreamUrl(mediaId)
                      : null,
              onMessageActionRequested: _showMessageActions,
              onImageTap: _openImageViewer,
            ),
          ),
          ChatInputBar(
            textController: textController,
            isRecording: _audioRecorder.isRecording,
            recordingSeconds: _audioRecorder.recordingSeconds,
            isDesktop: _isDesktop,
            isGroupChat: isGroupChat,
            onPollCreate: isGroupChat ? _openCreatePoll : null,
            onTextChanged: _presenceController.onTextChanged,
            onStartRecording: _startRecording,
            onCancelRecording: _cancelRecording,
            onSendRecording: _sendAudioRecording,
            onSendMessage: () => _sendMessage(type: 'TEXT'),
            onSendImage: (ImageSource source) => _mediaHandler.sendImage(
              context: context,
              source: source,
              isDesktop: _isDesktop,
              onSendMessage: _sendMessage,
              onSetActivity: _presenceController.setMyActivity,
            ),
            onSendVideo: (ImageSource source, {dynamic selectedFile}) =>
                _mediaHandler.sendVideo(
              context: context,
              source: source,
              isDesktop: _isDesktop,
              selectedFile: selectedFile,
              onSendMessage: _sendMessage,
              onSetActivity: _presenceController.setMyActivity,
            ),
            onPickVideoFile: () => _mediaHandler.pickAndSendVideoFile(
              context: context,
              isDesktop: _isDesktop,
              onSendMessage: _sendMessage,
              onSetActivity: _presenceController.setMyActivity,
            ),
            onPickAudio: () => _mediaHandler.pickAndSendAudio(
              context: context,
              onSendMessage: _sendMessage,
              onSetActivity: _presenceController.setMyActivity,
            ),
          ),
        ],
      ),
    );
  }
}
