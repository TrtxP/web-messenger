import 'package:flutter/material.dart';
import '../features/chats/screens/home_screen.dart';
import '../features/chats/screens/chat_screen.dart';

class ResponsiveShell extends StatefulWidget {
  const ResponsiveShell({super.key, required this.user, required this.onLogout});
  final Map<String, dynamic> user;
  final VoidCallback onLogout;

  @override
  State<ResponsiveShell> createState() => _ResponsiveShellState();
}

class _ResponsiveShellState extends State<ResponsiveShell> {
  final GlobalKey<HomeScreenState> _homeKey = GlobalKey<HomeScreenState>();
  Map<String, dynamic>? _selectedChat;
  Map<String, dynamic>? _secondaryChat;

  void _handleChatSelected(Map<String, dynamic> chat) {
    setState(() => _selectedChat = chat);
  }

  void _handleOpenSecondPanel(Map<String, dynamic> chat) {
    setState(() => _secondaryChat = chat);
  }

  void _handleCloseSecondPanel() {
    setState(() => _secondaryChat = null);
  }

  void _handleChatClosed(String chatId) {
    setState(() {
      if (_selectedChat?['id']?.toString() == chatId) {
        _selectedChat = _secondaryChat;
        _secondaryChat = null;
      } else if (_secondaryChat?['id']?.toString() == chatId) {
        _secondaryChat = null;
      }
    });
    _homeKey.currentState?.fetchChats(showLoading: false);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth >= 768;
        final isExtraWide = constraints.maxWidth >= 1200;

        if (!isWide) {
          return HomeScreen(
            key: _homeKey,
            user: widget.user,
            onLogout: widget.onLogout,
            onChatDeleted: _handleChatClosed,
          );
        }

        final home = SizedBox(
          width: isExtraWide ? 300 : 360,
          child: HomeScreen(
            key: _homeKey,
            user: widget.user,
            onLogout: widget.onLogout,
            onChatSelected: (chat) {
              _handleChatSelected(chat);
              if (!isExtraWide) {
                _handleCloseSecondPanel();
              }
            },
            onOpenSecondPanel: _handleOpenSecondPanel,
            onChatDeleted: _handleChatClosed,
          ),
        );

        if (isExtraWide && _selectedChat != null && _secondaryChat != null) {
          return Row(
            children: [
              home,
              const VerticalDivider(width: 1),
              Expanded(
                child: ChatScreen(
                  key: ValueKey(_selectedChat!['id']),
                  chat: _selectedChat!,
                  user: widget.user,
                  onClose: () => _handleChatClosed(_selectedChat!['id'].toString()),
                ),
              ),
              const VerticalDivider(width: 1),
              Expanded(
                child: Stack(
                  children: [
                    ChatScreen(
                      key: ValueKey(_secondaryChat!['id']),
                      chat: _secondaryChat!,
                      user: widget.user,
                      onClose: () => _handleChatClosed(_secondaryChat!['id'].toString()),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: _handleCloseSecondPanel,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        }

        return Row(
          children: [
            home,
            const VerticalDivider(width: 1),
            Expanded(
              child: _selectedChat != null
                  ? ChatScreen(
                      key: ValueKey(_selectedChat!['id']),
                      chat: _selectedChat!,
                      user: widget.user,
                      onClose: () => _handleChatClosed(_selectedChat!['id'].toString()),
                    )
                  : const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.chat_bubble_outline,
                              size: 64, color: Colors.grey),
                          SizedBox(height: 16),
                          Text('Select a chat to start messaging',
                              style:
                                  TextStyle(color: Colors.grey, fontSize: 16)),
                        ],
                      ),
                    ),
            ),
          ],
        );
      },
    );
  }
}
