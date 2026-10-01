// ignore_for_file: unused_local_variable

import 'package:flutter/material.dart';
import '../services/poll_service.dart';

class PollBubble extends StatefulWidget {
  const PollBubble({super.key, required this.pollId, required this.isMe});
  final String pollId;
  final bool isMe;
  @override
  State<PollBubble> createState() => _PollBubbleState();
}

class _PollBubbleState extends State<PollBubble> {
  late final PollService _service = PollService();
  Map<String, dynamic>? _poll;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await _service.getPoll(widget.pollId);
      if (mounted) {
        setState(() {
          _poll = p;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _vote(String optionId) async {
    try {
      final p = await _service.vote(widget.pollId, optionId);
      if (mounted) setState(() => _poll = p);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _close() async {
    try {
      final p = await _service.closePoll(widget.pollId);
      if (mounted) setState(() => _poll = p);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
          width: 200,
          height: 80,
          child: Center(child: CircularProgressIndicator()));
    }
    if (_poll == null) return const Text('Failed to load poll');
    final options = (_poll!['options'] as List?) ?? [];
    final isClosed = _poll!['isClosed'] == true || _poll!['is_closed'] == true;
    final isAnonymous =
        _poll!['isAnonymous'] == true || _poll!['is_anonymous'] == true;
    final myOptionId =
        _poll!['myOptionId']?.toString() ?? _poll!['my_option_id']?.toString();
    final creatorId = _poll!['creatorId']?.toString() ?? '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(_poll!['question']?.toString() ?? '',
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
        const SizedBox(height: 8),
        ...options.map((o) {
          final m = o as Map<String, dynamic>;
          final id = m['id'].toString();
          final text = m['text']?.toString() ?? '';
          final votes = (m['votes'] as int?) ?? 0;
          final percent = (m['percent'] as int?) ?? 0;
          final selected = myOptionId == id;
          return InkWell(
            onTap: isClosed ? null : () => _vote(id),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Icon(
                        selected
                            ? Icons.radio_button_checked
                            : Icons.radio_button_unchecked,
                        size: 18,
                        color: selected ? Colors.blue : Colors.grey),
                    const SizedBox(width: 6),
                    Expanded(child: Text(text)),
                    Text('$percent% ($votes)')
                  ]),
                  const SizedBox(height: 4),
                  LinearProgressIndicator(value: percent / 100, minHeight: 6),
                  if (!isAnonymous)
                    ...((m['voters'] as List? ?? []).map((v) => Padding(
                        padding: const EdgeInsets.only(left: 24, top: 2),
                        child: Text((v as Map)['username']?.toString() ?? '',
                            style: const TextStyle(
                                fontSize: 12, color: Colors.grey))))),
                ],
              ),
            ),
          );
        }),
        const SizedBox(height: 6),
        Row(children: [
          if (isClosed)
            const Text('Poll closed',
                style: TextStyle(color: Colors.red, fontSize: 12))
          else
            Text('${_poll!['totalVotes'] ?? 0} votes',
                style: const TextStyle(color: Colors.grey, fontSize: 12)),
          const Spacer(),
          if (widget.isMe && !isClosed)
            TextButton(onPressed: _close, child: const Text('Close'))
        ]),
      ],
    );
  }
}
