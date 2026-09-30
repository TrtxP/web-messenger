import 'package:flutter/material.dart';
import '../services/profile_service.dart';

class UserProfileModal extends StatefulWidget {
  const UserProfileModal({
    super.key,
    required this.userId,
    required this.username,
    this.avatarUrl,
    this.about,
    this.initialBlocked = false,
    this.profileService,
    this.onBlockedChanged,
  });

  final String userId;
  final String username;
  final String? avatarUrl;
  final String? about;
  final bool initialBlocked;
  final ProfileService? profileService;
  final ValueChanged<bool>? onBlockedChanged;

  static Future<void> show(
    BuildContext context, {
    required String userId,
    required String username,
    String? avatarUrl,
    String? about,
    bool initialBlocked = false,
    ProfileService? profileService,
    ValueChanged<bool>? onBlockedChanged,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => UserProfileModal(
        userId: userId,
        username: username,
        avatarUrl: avatarUrl,
        about: about,
        initialBlocked: initialBlocked,
        profileService: profileService,
        onBlockedChanged: onBlockedChanged,
      ),
    );
  }

  @override
  State<UserProfileModal> createState() => _UserProfileModalState();
}

class _UserProfileModalState extends State<UserProfileModal> {
  late bool _isBlocked;
  late final ProfileService _profileService;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _isBlocked = widget.initialBlocked;
    _profileService = widget.profileService ?? ProfileService();
    _checkInitialBlockStatus();
  }

  Future<void> _checkInitialBlockStatus() async {
    if (!widget.initialBlocked) {
      final blockedIds = await _profileService.getBlockedUserIds();
      if (mounted && blockedIds.contains(widget.userId)) {
        setState(() {
          _isBlocked = true;
        });
      }
    }
  }

  Future<void> _handleBlockToggle() async {
    if (_isBlocked) {
      setState(() => _loading = true);
      final success = await _profileService.unblockUser(widget.userId);
      if (mounted) {
        setState(() {
          _loading = false;
          if (success) {
            _isBlocked = false;
            widget.onBlockedChanged?.call(false);
          }
        });
      }
    } else {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Block user'),
          content: Text('Are you sure you want to block ${widget.username}?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Confirm'),
            ),
          ],
        ),
      );

      if (confirmed == true) {
        setState(() => _loading = true);
        final success = await _profileService.blockUser(widget.userId);
        if (mounted) {
          setState(() {
            _loading = false;
            if (success) {
              _isBlocked = true;
              widget.onBlockedChanged?.call(true);
            }
          });
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 36,
            backgroundColor: Theme.of(context).colorScheme.primaryContainer,
            backgroundImage:
                widget.avatarUrl != null && widget.avatarUrl!.isNotEmpty
                    ? NetworkImage(widget.avatarUrl!)
                    : null,
            child: widget.avatarUrl == null || widget.avatarUrl!.isEmpty
                ? Text(
                    widget.username.isNotEmpty
                        ? widget.username[0].toUpperCase()
                        : '?',
                    style: const TextStyle(
                        fontSize: 28, fontWeight: FontWeight.bold),
                  )
                : null,
          ),
          const SizedBox(height: 12),
          Text(
            widget.username,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          if (widget.about != null && widget.about!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              widget.about!,
              style: TextStyle(color: Colors.grey[600], fontSize: 14),
              textAlign: TextAlign.center,
            ),
          ],
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      foregroundColor:
                          _isBlocked ? Colors.grey[800] : Colors.red,
                      backgroundColor:
                          _isBlocked ? Colors.grey[200] : Colors.red[50],
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: _handleBlockToggle,
                    icon: Icon(_isBlocked ? Icons.lock_open : Icons.block),
                    label: Text(_isBlocked ? 'Unblock user' : 'Block user'),
                  ),
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}
