import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

class ChatInputBar extends StatelessWidget {
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

  void _showAttachmentSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => Wrap(
        children: [
          if (!isDesktop)
            ListTile(
              leading: const Icon(Icons.photo_camera),
              title: const Text('Take photo'),
              onTap: () {
                Navigator.pop(ctx);
                onSendImage(ImageSource.camera);
              },
            ),
          ListTile(
            leading: const Icon(Icons.photo_library),
            title: Text(isDesktop ? 'Choose image file' : 'Photo'),
            onTap: () {
              Navigator.pop(ctx);
              onSendImage(ImageSource.gallery);
            },
          ),
          if (!isDesktop)
            ListTile(
              leading: const Icon(Icons.videocam),
              title: const Text('Record video'),
              onTap: () {
                Navigator.pop(ctx);
                onSendVideo(ImageSource.camera);
              },
            ),
          ListTile(
            leading: const Icon(Icons.video_library),
            title: Text(isDesktop ? 'Choose video file' : 'Video from gallery'),
            onTap: () {
              Navigator.pop(ctx);
              onSendVideo(ImageSource.gallery);
            },
          ),
          if (!isDesktop)
            ListTile(
              leading: const Icon(Icons.folder_open),
              title: const Text('Choose video file'),
              onTap: () {
                Navigator.pop(ctx);
                onPickVideoFile();
              },
            ),
          ListTile(
            leading: const Icon(Icons.audiotrack),
            title: Text(isDesktop ? 'Choose audio file' : 'Audio'),
            onTap: () {
              Navigator.pop(ctx);
              onPickAudio();
            },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (isRecording) {
      final minutes = (recordingSeconds ~/ 60).toString();
      final seconds = (recordingSeconds % 60).toString().padLeft(2, '0');

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
                onPressed: onCancelRecording,
                child: const Text('Cancel'),
              ),
              IconButton(
                icon: const Icon(Icons.send, color: Colors.blue),
                onPressed: onSendRecording,
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
            IconButton(
              key: const Key('mic_button'),
              icon: const Icon(Icons.mic),
              onPressed: isDesktop ? onSendRecording : onStartRecording,
            ),
            Expanded(
              child: TextField(
                controller: textController,
                onChanged: onTextChanged,
                maxLines: 4,
                minLines: 1,
                decoration: const InputDecoration(
                  hintText: 'Type a message...',
                  border: InputBorder.none,
                ),
              ),
            ),
            IconButton(
              key: const Key('send_message_button'),
              icon: const Icon(Icons.send, color: Colors.blue),
              onPressed: onSendMessage,
            ),
          ],
        ),
      ),
    );
  }
}
