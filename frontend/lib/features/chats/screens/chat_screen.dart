// ignore_for_file: library_prefixes

import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:record/record.dart';

import '../services/chat_service.dart';
import '../services/chat_media_handler.dart';
import '../../profile/services/profile_service.dart';
import '../../profile/widgets/user_profile_modal.dart';
import '../widgets/chat_app_bar_title.dart';
import '../widgets/chat_input_bar.dart';
import '../widgets/chat_message_list.dart';
import '../widgets/full_screen_image_viewer.dart';
import '../widgets/message_action_dialogs.dart';
import '../../../core/services/notification_service.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.chat, required this.user});
  final Map<String, dynamic> chat;
  final Map<String, dynamic> user;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ChatService _chatService = ChatService();
  final ProfileService _profileService = ProfileService();
  late final ChatMediaHandler _mediaHandler =
      ChatMediaHandler(chatService: _chatService);

  final TextEditingController textController = TextEditingController();
  final ScrollController scrollController = ScrollController();
  final AudioRecorder audioRecorder = AudioRecorder();
  String? recordingPath;

  List<dynamic> messages = [];
  bool isLoading = true;
  bool isContactOnline = false;
  String? contactActivity;
  DateTime? contactLastSeenAt;
  String? _myActivity;
  bool isRecording = false;
  int recordingSeconds = 0;
  Timer? recordingTimer;
  Timer? typingDebounceTimer;
  Timer? messageRefreshTimer;
  Timer? presenceRefreshTimer;
  Timer? activityHeartbeatTimer;
  bool isMuted = false;
  bool isRefreshingMessages = false;
  IO.Socket? _socket;

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
    _refreshContactPresence();
    _initSocket();
    presenceRefreshTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _refreshContactPresence(),
    );
    messageRefreshTimer = Timer.periodic(
      const Duration(seconds: 4),
      (_) => _fetchMessages(),
    );
  }

  @override
  void dispose() {
    _socket?.disconnect();
    _socket?.dispose();
    if (NotificationService.activeChatId == widget.chat['id']?.toString()) {
      NotificationService.activeChatId = null;
    }
    textController.dispose();
    scrollController.dispose();
    recordingTimer?.cancel();
    audioRecorder.dispose();
    typingDebounceTimer?.cancel();
    messageRefreshTimer?.cancel();
    presenceRefreshTimer?.cancel();
    activityHeartbeatTimer?.cancel();
    if (_myActivity != null) {
      unawaited(_chatService.updateChatActivity(chatId, null));
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

  bool get _isDesktop =>
      !kIsWeb && (Platform.isWindows || Platform.isLinux || Platform.isMacOS);

  String get chatTitle {
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
    final partner = widget.chat['partner'];
    if (partner is! Map) return null;
    return _profileService.resolveAvatarUrl(partner['avatarUrl']?.toString());
  }

  Future<void> _refreshContactPresence() async {
    if (chatId.isEmpty) return;
    try {
      final presence = await _chatService.fetchPartnerPresence(chatId);
      final isOnline = presence['isOnline'] == true;
      final activity = presence['activity']?.toString();
      final lastSeenAt = DateTime.tryParse(
        presence['lastSeenAt']?.toString() ?? '',
      );
      if (mounted &&
          (isContactOnline != isOnline ||
              contactActivity != activity ||
              contactLastSeenAt != lastSeenAt)) {
        setState(() {
          isContactOnline = isOnline;
          contactActivity = activity;
          contactLastSeenAt = lastSeenAt;
        });
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
          WidgetsBinding.instance.lifecycleState ==
              AppLifecycleState.resumed) {
        try {
          await _chatService.markChatRead(chatId);
        } catch (_) {}
        unawaited(NotificationService().cancelChatNotifications(chatId));
      }
      if (mounted) {
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
      if (mounted) setState(() => isLoading = false);
    } finally {
      isRefreshingMessages = false;
    }
  }

  void _initSocket() async {
    final token = await Api().getToken();
    if (token == null || !mounted) return;

    final socketUrl =
        apiUrl.endsWith('/messenger') ? apiUrl : '$apiUrl/messenger';
    _socket = IO.io(
      socketUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .build(),
    );

    _socket?.on('message:status_updated', (data) {
      if (!mounted) return;
      if (data is Map && data['messageId'] != null && data['status'] != null) {
        final targetChatId = data['chatId']?.toString();
        if (targetChatId != null && targetChatId != chatId) return;

        final msgId = data['messageId'].toString();
        final newStatus = data['status'].toString();

        setState(() {
          final index =
              messages.indexWhere((m) => m['id']?.toString() == msgId);
          if (index != -1) {
            messages[index]['status'] = newStatus;
          }
        });
      }
    });
  }

  void _onTextChanged(String value) {
    if (value.trim().isEmpty) {
      typingDebounceTimer?.cancel();
      if (_myActivity == 'typing') unawaited(_setMyActivity(null));
      return;
    }
    unawaited(_setMyActivity('typing'));
    typingDebounceTimer?.cancel();
    typingDebounceTimer = Timer(const Duration(milliseconds: 1800), () {
      if (_myActivity == 'typing') unawaited(_setMyActivity(null));
    });
  }

  Future<void> _setMyActivity(String? activity) async {
    _myActivity = activity;
    if (activity == null) {
      activityHeartbeatTimer?.cancel();
      activityHeartbeatTimer = null;
    } else {
      activityHeartbeatTimer ??= Timer.periodic(
        const Duration(seconds: 4),
        (_) {
          final current = _myActivity;
          if (current != null) {
            unawaited(_chatService.updateChatActivity(chatId, current));
          }
        },
      );
    }
    try {
      await _chatService.updateChatActivity(chatId, activity);
    } catch (_) {}
  }

  Future<void> _sendMessage({
    String type = 'TEXT',
    String? mediaId,
    String? defaultContent,
  }) async {
    if (type == 'TEXT') {
      typingDebounceTimer?.cancel();
      if (_myActivity == 'typing') await _setMyActivity(null);
    }
    var text = textController.text.trim();
    if (type == 'TEXT' && (text.isEmpty || text.length > 4000)) return;
    if (type != 'TEXT' && text.isEmpty) {
      text = defaultContent ??
          (type == 'AUDIO'
              ? 'Voice message'
              : (type == 'IMAGE' ? 'Image' : 'Video'));
    }

    final tempMsg = {
      'id': 'local_${DateTime.now().millisecondsSinceEpoch}',
      'sender_id': currentUserId,
      'content': text,
      'type': type,
      if (mediaId != null) 'mediaId': mediaId,
      'status': 'pending',
      'created_at': DateTime.now().toIso8601String(),
    };

    setState(() {
      messages.add(tempMsg);
      textController.clear();
    });

    try {
      final created = await _chatService.sendMessage(
        chatId,
        text,
        type,
        mediaId: mediaId,
      );

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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e.toString().replaceFirst('Exception: ', ''),
            ),
          ),
        );
      }
    }
  }

  Future<void> _startRecording() async {
    final shouldContinue =
        await MessageActionDialogs.showMicrophonePermissionDialog(context);
    if (shouldContinue != true || !mounted) return;

    try {
      if (!await audioRecorder.hasPermission()) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Microphone permission is required. Enable it in app settings to record voice messages.',
              ),
            ),
          );
        }
        return;
      }
      recordingPath =
          '${Directory.systemTemp.path}${Platform.pathSeparator}voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      await audioRecorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc),
        path: recordingPath!,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not start recording: $e')),
        );
      }
      return;
    }
    if (!mounted) return;
    setState(() {
      isRecording = true;
      recordingSeconds = 0;
    });
    recordingTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() => recordingSeconds++);
      }
    });
  }

  Future<void> _cancelRecording() async {
    recordingTimer?.cancel();
    try {
      await audioRecorder.stop();
    } catch (_) {}
    final path = recordingPath;
    recordingPath = null;
    if (path != null) {
      try {
        await File(path).delete();
      } catch (_) {}
    }
    if (!mounted) return;
    setState(() {
      isRecording = false;
      recordingSeconds = 0;
    });
  }

  Future<void> _sendAudioRecording() async {
    recordingTimer?.cancel();
    final path = recordingPath;
    String? recordedPath;
    try {
      recordedPath = await audioRecorder.stop();
    } catch (_) {}
    recordingPath = null;
    final duration = recordingSeconds;
    if (!mounted) return;
    setState(() {
      isRecording = false;
      recordingSeconds = 0;
    });

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
        type: type,
        mediaId: mediaId,
        defaultContent: defaultContent,
      ),
      onSetActivity: _setMyActivity,
    );
  }

  Future<void> _toggleMute() async {
    final newMute = !isMuted;
    try {
      await _chatService.toggleMute(chatId, newMute);
      if (mounted) {
        setState(() => isMuted = newMute);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              newMute ? 'Notifications muted' : 'Notifications unmuted',
            ),
          ),
        );
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
            SnackBar(content: Text('Failed to delete message: $e')),
          );
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: ChatAppBarTitle(
          chatTitle: chatTitle,
          chatAvatarUrl: chatAvatarUrl,
          isContactOnline: isContactOnline,
          contactActivity: contactActivity,
          contactLastSeenAt: contactLastSeenAt,
          onAvatarTap: () => _openImageViewer(chatAvatarUrl!),
        ),
        actions: [
          IconButton(
            icon: Icon(isMuted ? Icons.notifications_off : Icons.notifications),
            tooltip: isMuted ? 'Unmute' : 'Mute',
            onPressed: _toggleMute,
          ),
          if (partnerId != null)
            IconButton(
              icon: const Icon(Icons.person_outline),
              tooltip: 'User profile',
              onPressed: () {
                UserProfileModal.show(
                  context,
                  userId: partnerId!,
                  username: chatTitle,
                  avatarUrl: chatAvatarUrl,
                  profileService: _profileService,
                );
              },
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ChatMessageList(
              scrollController: scrollController,
              isLoading: isLoading,
              messages: messages,
              currentUserId: currentUserId,
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
            isRecording: isRecording,
            recordingSeconds: recordingSeconds,
            isDesktop: _isDesktop,
            onTextChanged: _onTextChanged,
            onStartRecording: _startRecording,
            onCancelRecording: _cancelRecording,
            onSendRecording: _sendAudioRecording,
            onSendMessage: () => _sendMessage(type: 'TEXT'),
            onSendImage: (ImageSource source) => _mediaHandler.sendImage(
              context: context,
              source: source,
              isDesktop: _isDesktop,
              onSendMessage: _sendMessage,
              onSetActivity: _setMyActivity,
            ),
            onSendVideo: (ImageSource source, {dynamic selectedFile}) =>
                _mediaHandler.sendVideo(
              context: context,
              source: source,
              isDesktop: _isDesktop,
              selectedFile: selectedFile,
              onSendMessage: _sendMessage,
              onSetActivity: _setMyActivity,
            ),
            onPickVideoFile: () => _mediaHandler.pickAndSendVideoFile(
              context: context,
              isDesktop: _isDesktop,
              onSendMessage: _sendMessage,
              onSetActivity: _setMyActivity,
            ),
            onPickAudio: () => _mediaHandler.pickAndSendAudio(
              context: context,
              onSendMessage: _sendMessage,
              onSetActivity: _setMyActivity,
            ),
          ),
        ],
      ),
    );
  }
}
