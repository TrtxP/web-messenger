import 'package:flutter/material.dart';
import '../../../core/network/api_client.dart';
import '../services/group_service.dart';

class GroupInfoScreen extends StatefulWidget {
  const GroupInfoScreen({super.key, required this.groupId});
  final String groupId;
  @override
  State<GroupInfoScreen> createState() => _GroupInfoScreenState();
}

class _GroupInfoScreenState extends State<GroupInfoScreen> {
  late final GroupService _service = GroupService(api: Api());
  Map<String, dynamic>? _info;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final info = await _service.getGroupInfo(widget.groupId);
      if (mounted) {
        setState(() {
          _info = info;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _leave() async {
    final currentRole = _info?['currentUserRole']?.toString() ?? 'member';
    final isOwner = currentRole == 'owner';

    final String message = isOwner
        ? 'Are you sure to leave the group and? If you do that the group will be removed automatically'
        : 'Are you sure you want to leave this group?';

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(isOwner ? 'Delete and leave group?' : 'Leave group?'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Leave'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await _service.leaveGroup(widget.groupId);
      if (mounted && Navigator.canPop(context)) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    }
  }

  Color _colorFor(String userId) {
    final h = userId.hashCode.abs();
    final colors = [
      Colors.blue,
      Colors.green,
      Colors.orange,
      Colors.purple,
      Colors.teal,
      Colors.red
    ];
    return colors[h % colors.length];
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Group info')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (_info == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Group info')),
        body: const Center(child: Text('Failed to load group')),
      );
    }
    final members = (_info!['members'] as List?) ?? [];
    final name = _info!['name']?.toString() ??
        _info!['groupName']?.toString() ??
        'Group';
    final currentRole = _info!['currentUserRole']?.toString() ?? 'member';
    final isOwner = currentRole == 'owner';
    return Scaffold(
      appBar: AppBar(title: Text(name)),
      body: Column(
        children: [
          const SizedBox(height: 16),
          CircleAvatar(
            radius: 36,
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : 'G',
              style: const TextStyle(fontSize: 28),
            ),
          ),
          const SizedBox(height: 8),
          Text(name,
              style:
                  const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          Text('${members.length} members',
              style: const TextStyle(color: Colors.grey)),
          const Divider(),
          Expanded(
            child: ListView.builder(
              itemCount: members.length,
              itemBuilder: (context, i) {
                final m = members[i] as Map<String, dynamic>;
                final username = m['username']?.toString() ?? 'User';
                final role = m['role']?.toString() ?? 'member';
                final uid = m['userId']?.toString() ?? '';
                final isOnline = m['isOnline'] == true;
                return ListTile(
                  leading: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      CircleAvatar(
                        backgroundColor: _colorFor(uid).withValues(alpha: 0.2),
                        child: Text(
                          username.isNotEmpty ? username[0].toUpperCase() : '?',
                          style: TextStyle(color: _colorFor(uid)),
                        ),
                      ),
                      if (isOnline)
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: Colors.green,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color:
                                    Theme.of(context).scaffoldBackgroundColor,
                                width: 1.5,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  title: Text(username),
                  subtitle: Text(isOnline ? '$role • Online' : role),
                  trailing: isOwner && role != 'owner'
                      ? IconButton(
                          icon: const Icon(Icons.remove_circle_outline,
                              color: Colors.red),
                          onPressed: () async {
                            try {
                              await _service.removeMember(widget.groupId, uid);
                              _load();
                            } catch (e) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text(e.toString())));
                              }
                            }
                          },
                        )
                      : null,
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: _leave,
                child: Text(
                  isOwner ? 'Delete & leave group' : 'Leave group',
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
