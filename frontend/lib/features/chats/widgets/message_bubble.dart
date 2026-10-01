import 'package:flutter/material.dart';
import 'audio_player_widget.dart';
import 'video_message_player.dart';
import 'poll_bubble.dart';

class MessageBubble extends StatelessWidget {
  const MessageBubble({
    super.key,
    required this.message,
    required this.isMe,
    required this.onActionRequested,
    required this.onImageTap,
    this.mediaStreamUrl,
    this.isGroupChat = false,
    this.senderName,
    this.highlightQuery,
    this.onRetry,
  });

  final Map<String, dynamic> message;
  final bool isMe;
  final VoidCallback onActionRequested;
  final ValueChanged<String> onImageTap;
  final String? mediaStreamUrl;
  final bool isGroupChat;
  final String? senderName;
  final String? highlightQuery;
  final VoidCallback? onRetry;

  int _parseAudioDuration(String content) {
    final match = RegExp(r'\((\d+)\s*s?\)').firstMatch(content);
    if (match != null) {
      return int.tryParse(match.group(1)!) ?? 10;
    }
    return 10;
  }

  String _formatTime(dynamic rawTime) {
    if (rawTime == null) return '12:00';
    try {
      final dt = DateTime.parse(rawTime.toString()).toLocal();
      final h = dt.hour.toString().padLeft(2, '0');
      final m = dt.minute.toString().padLeft(2, '0');
      return '$h:$m';
    } catch (_) {
      return '12:00';
    }
  }

  Color _colorForSender(String id) {
    final h = id.hashCode.abs();
    final colors = [Colors.blue, Colors.green, Colors.orange, Colors.purple, Colors.teal, Colors.brown];
    return colors[h % colors.length];
  }

  Widget _buildStatusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return const Icon(Icons.access_time, size: 14, color: Colors.grey, key: Key('icon_pending'));
      case 'sent':
        return const Icon(Icons.check, size: 14, color: Colors.grey, key: Key('icon_sent'));
      case 'delivered':
        return const Icon(Icons.done_all, size: 14, color: Colors.grey, key: Key('icon_delivered'));
      case 'read':
        return const Icon(Icons.done_all, size: 14, color: Colors.blue, key: Key('icon_read'));
      case 'failed':
        return const Icon(Icons.error_outline, size: 14, color: Colors.red, key: Key('icon_failed'));
      default:
        return const SizedBox();
    }
  }

  Widget _buildHighlightedText(String content) {
    if (highlightQuery == null || highlightQuery!.isEmpty) {
      return Text(content, style: const TextStyle(fontSize: 16));
    }
    final q = highlightQuery!.toLowerCase();
    final lower = content.toLowerCase();
    final spans = <TextSpan>[];
    var start = 0;
    while (true) {
      final idx = lower.indexOf(q, start);
      if (idx == -1) {
        spans.add(TextSpan(text: content.substring(start), style: const TextStyle(fontSize: 16, color: Colors.black)));
        break;
      }
      if (idx > start) spans.add(TextSpan(text: content.substring(start, idx), style: const TextStyle(fontSize: 16, color: Colors.black)));
      spans.add(TextSpan(text: content.substring(idx, idx + q.length), style: const TextStyle(fontSize: 16, color: Colors.black, backgroundColor: Colors.yellow)));
      start = idx + q.length;
      if (start >= content.length) break;
    }
    return RichText(text: TextSpan(children: spans));
  }

  @override
  Widget build(BuildContext context) {
    final content = message['content']?.toString() ?? message['text']?.toString() ?? '';
    final type = message['type']?.toString().toUpperCase() ?? 'TEXT';
    final status = message['status']?.toString() ?? 'sent';
    final isEdited = message['is_edited'] == true || message['isEdited'] == true;
    final isDeleted = message['is_deleted'] == true || message['deleted'] == true;
    final mediaId = message['mediaId']?.toString() ?? message['media_id']?.toString();
    final senderId = message['senderId']?.toString() ?? message['sender_id']?.toString() ?? '';

    if (isDeleted) {
      return Align(
        alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: Colors.grey[200], borderRadius: BorderRadius.circular(8)),
          child: const Text('This message was deleted', style: TextStyle(fontStyle: FontStyle.italic, color: Colors.grey)),
        ),
      );
    }

    if (type == 'TEXT' && content.trim().isEmpty) {
      return const SizedBox.shrink();
    }

    final imgUrl = (mediaId != null && mediaId.isNotEmpty && mediaStreamUrl != null) ? mediaStreamUrl! : (content.startsWith('http') ? content : '');

    return GestureDetector(
      onLongPress: isMe ? onActionRequested : null,
      onSecondaryTap: isMe ? onActionRequested : null,
      child: Align(
        alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
          decoration: BoxDecoration(
            color: isMe ? Theme.of(context).colorScheme.primaryContainer : Colors.grey[200],
            borderRadius: BorderRadius.only(topLeft: const Radius.circular(16), topRight: const Radius.circular(16), bottomLeft: Radius.circular(isMe ? 16 : 0), bottomRight: Radius.circular(isMe ? 0 : 16)),
          ),
          child: Column(
            crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              if (isGroupChat && !isMe && senderName != null && senderName!.isNotEmpty)
                Padding(padding: const EdgeInsets.only(bottom: 2), child: Text(senderName!, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: _colorForSender(senderId)))),
              if (type == 'POLL')
                PollBubble(pollId: content.trim(), isMe: isMe)
              else if (type == 'TEXT')
                _buildHighlightedText(content)
              else if (type == 'IMAGE')
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (imgUrl.isNotEmpty)
                      GestureDetector(
                        onTap: () => onImageTap(imgUrl),
                        child: ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(imgUrl, width: 200, height: 150, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(width: 200, height: 150, color: Colors.grey[300], child: const Icon(Icons.broken_image, size: 48, color: Colors.grey)))),
                      )
                    else
                      Container(width: 200, height: 150, color: Colors.grey[300], child: Icon(Icons.image, size: 48, color: Colors.grey[600])),
                    if (content.isNotEmpty && content != 'Image' && !content.startsWith('http')) Padding(padding: const EdgeInsets.only(top: 4.0), child: Text(content)),
                  ],
                )
              else if (type == 'VIDEO')
                VideoMessagePlayer(videoUrl: mediaStreamUrl)
              else if (type == 'AUDIO')
                AudioPlayerWidget(durationSeconds: _parseAudioDuration(content), audioUrl: mediaStreamUrl),
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (isEdited) ...[const Text('(edited) ', style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: Colors.grey))],
                  Text(_formatTime(message['created_at'] ?? message['createdAt']), style: const TextStyle(fontSize: 11, color: Colors.grey)),
                  if (isMe) ...[
                    const SizedBox(width: 4),
                    _buildStatusIcon(status),
                    if (status == 'failed') IconButton(icon: const Icon(Icons.refresh, color: Colors.red, size: 18), onPressed: () => onRetry?.call()),
                    const SizedBox(width: 4),
                    InkWell(onTap: onActionRequested, child: const Icon(Icons.more_vert, size: 14, color: Colors.grey)),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
