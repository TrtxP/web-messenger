import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

class ChatInputBar extends StatefulWidget {
  const ChatInputBar({
    super.key,
    required this.textController,
    required this.isRecording,
    required this.recordingSeconds,
    required this.isDesktop,
    required this.onTextChanged,
    required this.onStartRecording,
    required this.onCancelRecording,
    required this.onSendRecording,
    required this.onSendMessage,
    required this.onSendImage,
    required this.onSendVideo,
    required this.onPickVideoFile,
    required this.onPickAudio,
    this.onPollCreate,
    this.isGroupChat = false,
  });

  final TextEditingController textController;
  final bool isRecording;
  final int recordingSeconds;
  final bool isDesktop;
  final ValueChanged<String> onTextChanged;
  final VoidCallback onStartRecording;
  final VoidCallback onCancelRecording;
  final VoidCallback onSendRecording;
  final VoidCallback onSendMessage;
  final Future<void> Function(ImageSource source) onSendImage;
  final Future<void> Function(ImageSource source) onSendVideo;
  final VoidCallback onPickVideoFile;
  final VoidCallback onPickAudio;
  final VoidCallback? onPollCreate;
  final bool isGroupChat;

  @override
  State<ChatInputBar> createState() => _ChatInputBarState();
}

class _ChatInputBarState extends State<ChatInputBar> {
  late final FocusNode _inputFocusNode;

  @override
  void initState() {
    super.initState();
    _inputFocusNode = FocusNode(onKeyEvent: _handleKeyEvent);
  }

  @override
  void dispose() {
    _inputFocusNode.dispose();
    super.dispose();
  }

  KeyEventResult _handleKeyEvent(FocusNode node, KeyEvent event) {
    if (event.logicalKey == LogicalKeyboardKey.enter &&
        !HardwareKeyboard.instance.isShiftPressed) {
      if (event is KeyDownEvent) {
        widget.onSendMessage();
      }
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  void _showAttachmentSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => Wrap(
        children: [
          if (!widget.isDesktop)
            ListTile(
              leading: const Icon(Icons.photo_camera),
              title: const Text('Take photo'),
              onTap: () {
                Navigator.pop(ctx);
                widget.onSendImage(ImageSource.camera);
              },
            ),
          ListTile(
            leading: const Icon(Icons.photo_library),
            title: Text(widget.isDesktop ? 'Choose image file' : 'Photo'),
            onTap: () {
              Navigator.pop(ctx);
              widget.onSendImage(ImageSource.gallery);
            },
          ),
          if (!widget.isDesktop)
            ListTile(
              leading: const Icon(Icons.videocam),
              title: const Text('Record video'),
              onTap: () {
                Navigator.pop(ctx);
                widget.onSendVideo(ImageSource.camera);
              },
            ),
          ListTile(
            leading: const Icon(Icons.video_library),
            title: Text(widget.isDesktop ? 'Choose video file' : 'Video from gallery'),
            onTap: () {
              Navigator.pop(ctx);
              widget.onSendVideo(ImageSource.gallery);
            },
          ),
          if (!widget.isDesktop)
            ListTile(
              leading: const Icon(Icons.folder_open),
              title: const Text('Choose video file'),
              onTap: () {
                Navigator.pop(ctx);
                widget.onPickVideoFile();
              },
            ),
          ListTile(
            leading: const Icon(Icons.audiotrack),
            title: Text(widget.isDesktop ? 'Choose audio file' : 'Audio'),
            onTap: () {
              Navigator.pop(ctx);
              widget.onPickAudio();
            },
          ),
          if (widget.isGroupChat && widget.onPollCreate != null)
            ListTile(
              leading: const Icon(Icons.bar_chart),
              title: const Text('Create poll'),
              onTap: () {
                Navigator.pop(ctx);
                widget.onPollCreate!();
              },
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isRecording) {
      final minutes = (widget.recordingSeconds ~/ 60).toString();
      final seconds = (widget.recordingSeconds % 60).toString().padLeft(2, '0');

      return SafeArea(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: Theme.of(context).cardColor,
          child: Row(
            children: [
              const Icon(Icons.fiber_manual_record, color: Colors.red),
              const SizedBox(width: 8),
              Text('$minutes:$seconds', key: const Key('recording_timer')),
              const Spacer(),
              TextButton(
                key: const Key('cancel_record_button'),
                onPressed: widget.onCancelRecording,
                child: const Text('Cancel'),
              ),
              IconButton(
                icon: const Icon(Icons.send, color: Colors.blue),
                onPressed: widget.onSendRecording,
              ),
            ],
          ),
        ),
      );
    }

    return SafeArea(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          border: Border(top: BorderSide(color: Colors.grey[300]!)),
        ),
        child: Row(
          children: [
            IconButton(
              key: const Key('attach_media_button'),
              icon: const Icon(Icons.attach_file),
              onPressed: () => _showAttachmentSheet(context),
            ),
            if (widget.isGroupChat && widget.onPollCreate != null)
              IconButton(
                icon: const Icon(Icons.bar_chart),
                tooltip: 'Create poll',
                onPressed: widget.onPollCreate,
              ),
            IconButton(
              key: const Key('mic_button'),
              icon: const Icon(Icons.mic),
              onPressed: widget.isDesktop ? widget.onSendRecording : widget.onStartRecording,
            ),
            Expanded(
              child: TextField(
                controller: widget.textController,
                focusNode: _inputFocusNode,
                onChanged: widget.onTextChanged,
                onSubmitted: (_) => widget.onSendMessage(),
                maxLines: null,
                minLines: 1,
                keyboardType: TextInputType.multiline,
                textInputAction: TextInputAction.newline,
                decoration: const InputDecoration(
                  hintText: 'Type a message...',
                  border: InputBorder.none,
                ),
              ),
            ),
            IconButton(
              key: const Key('send_message_button'),
              icon: const Icon(Icons.send, color: Colors.blue),
              onPressed: widget.onSendMessage,
            ),
          ],
        ),
      ),
    );
  }
}
