import 'dart:async';
import 'package:flutter/material.dart';
import '../services/chat_service.dart';

class ChatSearchBar extends StatefulWidget {
  final String chatId;
  final ChatService chatService;
  final void Function(String messageId) onNavigateToMessage;
  final VoidCallback onClose;
  final void Function(String query)? onQueryChanged;

  const ChatSearchBar({super.key, required this.chatId, required this.chatService, required this.onNavigateToMessage, required this.onClose, this.onQueryChanged});

  @override
  State<ChatSearchBar> createState() => _ChatSearchBarState();
}

class _ChatSearchBarState extends State<ChatSearchBar> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<dynamic> _results = [];
  int _currentIndex = 0;
  bool _isSearching = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(value));
  }

  Future<void> _search(String query) async {
    if (query.trim().isEmpty) {
      setState(() {_results = []; _currentIndex = 0;});
      widget.onQueryChanged?.call('');
      return;
    }
    setState(() => _isSearching = true);
    try {
      final res = await widget.chatService.searchMessages(widget.chatId, query.trim());
      if (mounted) {
        setState(() {_results = res; _currentIndex = res.isEmpty ? 0 : 1; _isSearching = false;});
        widget.onQueryChanged?.call(query.trim());
        if (res.isNotEmpty) widget.onNavigateToMessage((res.first['id'] ?? res.first['messageId']).toString());
      }
    } catch (_) {
      if (mounted) setState(() => _isSearching = false);
    }
  }

  void _go(int delta) {
    if (_results.isEmpty) return;
    var next = _currentIndex + delta;
    if (next < 1) next = _results.length;
    if (next > _results.length) next = 1;
    setState(() => _currentIndex = next);
    final m = _results[next - 1];
    widget.onNavigateToMessage((m['id'] ?? m['messageId']).toString());
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                onChanged: _onChanged,
                decoration: const InputDecoration(hintText: 'Search messages...', border: InputBorder.none, prefixIcon: Icon(Icons.search, size: 20)),
              ),
            ),
            if (_isSearching) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) else if (_results.isNotEmpty) Text('$_currentIndex of ${_results.length}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
            IconButton(icon: const Icon(Icons.keyboard_arrow_up), onPressed: _results.isEmpty ? null : () => _go(-1)),
            IconButton(icon: const Icon(Icons.keyboard_arrow_down), onPressed: _results.isEmpty ? null : () => _go(1)),
            IconButton(icon: const Icon(Icons.close), onPressed: widget.onClose),
          ],
        ),
      ),
    );
  }
}
