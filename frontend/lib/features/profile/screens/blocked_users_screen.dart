import 'package:flutter/material.dart';
import '../services/profile_service.dart';

class BlockedUsersScreen extends StatefulWidget {
  const BlockedUsersScreen({super.key});

  @override
  State<BlockedUsersScreen> createState() => _BlockedUsersScreenState();
}

class _BlockedUsersScreenState extends State<BlockedUsersScreen> {
  final ProfileService _profileService = ProfileService();
  List<Map<String, dynamic>> _blockedUsers = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadBlockedUsers();
  }

  Future<void> _loadBlockedUsers() async {
    setState(() => _isLoading = true);
    try {
      final users = await _profileService.getBlockedUsers();
      if (mounted) {
        setState(() {
          _blockedUsers = users;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _unblockUser(String userId, String username) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Unblock user'),
        content: Text('Are you sure you want to unblock $username?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Unblock'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final success = await _profileService.unblockUser(userId);
      if (success && mounted) {
        setState(() {
          _blockedUsers.removeWhere((u) => u['id'] == userId);
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$username has been unblocked')),
        );
      }
    }
  }

  String? _resolveAvatarUrl(String? url) {
    return _profileService.resolveAvatarUrl(url);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Blocked Users'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _blockedUsers.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.block, size: 64, color: Colors.grey),
                      SizedBox(height: 16),
                      Text(
                        'No blocked users',
                        style: TextStyle(fontSize: 16, color: Colors.grey),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  itemCount: _blockedUsers.length,
                  itemBuilder: (context, index) {
                    final user = _blockedUsers[index];
                    final userId = user['id'] as String;
                    final username = user['username'] as String? ?? 'Unknown';
                    final avatarUrl =
                        _resolveAvatarUrl(user['avatarUrl'] as String?);

                    return ListTile(
                      leading: CircleAvatar(
                        backgroundImage:
                            avatarUrl != null ? NetworkImage(avatarUrl) : null,
                        child: avatarUrl == null
                            ? Text(
                                username.isNotEmpty
                                    ? username[0].toUpperCase()
                                    : '?',
                              )
                            : null,
                      ),
                      title: Text(username),
                      trailing: TextButton(
                        onPressed: () => _unblockUser(userId, username),
                        child: const Text(
                          'Unblock',
                          style: TextStyle(color: Colors.red),
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
