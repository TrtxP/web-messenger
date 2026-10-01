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
  late final Api _api = Api();
  Map<String, dynamic>? _info;
  List<dynamic> _pending = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final info = await _service.getGroupInfo(widget.groupId);
      List<dynamic> pending = [];
      try {
        pending = await _service.getGroupPendingInvitations(widget.groupId);
      } catch (_) {
        pending = [];
      }
      if (mounted) {
        setState(() {
          _info = info;
          _pending = pending;
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

  bool get _canManage {
    final role = _info?['currentUserRole']?.toString() ?? 'member';
    return role == 'owner' || role == 'admin';
  }

  Set<String> get _memberIds {
    final members = (_info?['members'] as List?) ?? [];
    return members
        .whereType<Map>()
        .map((m) => (m['userId'] ?? m['id'])?.toString() ?? '')
        .where((id) => id.isNotEmpty)
        .toSet();
  }

  Future<void> _openInviteSheet() async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _InviteBottomSheet(
        api: _api,
        service: _service,
        groupId: widget.groupId,
        memberIds: _memberIds,
      ),
    );
    if (result == true) {
      await _load();
    }
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
      appBar: AppBar(
        title: Text(name),
        actions: [
          if (_canManage)
            IconButton(
              key: const Key('invite_member_button'),
              tooltip: 'Invite member',
              icon: const Icon(Icons.person_add),
              onPressed: _openInviteSheet,
            ),
        ],
      ),
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
          if (_canManage)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  key: const Key('invite_member_cta'),
                  onPressed: _openInviteSheet,
                  icon: const Icon(Icons.add),
                  label: const Text('Invite member'),
                ),
              ),
            ),
          const Divider(),
          if (_canManage && _pending.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Pending Invitations (${_pending.length}):',
                  style: const TextStyle(
                      fontWeight: FontWeight.bold, color: Colors.grey),
                ),
              ),
            ),
          if (_canManage && _pending.isNotEmpty)
            ..._pending.map((p) {
              final m = (p as Map).cast<String, dynamic>();
              final username = m['username']?.toString() ?? 'User';
              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: Colors.orange.withValues(alpha: 0.2),
                  child: Text(
                    username.isNotEmpty ? username[0].toUpperCase() : '?',
                    style: const TextStyle(color: Colors.orange),
                  ),
                ),
                title: Text(username),
                subtitle: const Text('pending'),
                trailing: const Chip(
                  label: Text('Pending', style: TextStyle(fontSize: 12)),
                ),
              );
            }),
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

class _InviteBottomSheet extends StatefulWidget {
  const _InviteBottomSheet({
    required this.api,
    required this.service,
    required this.groupId,
    required this.memberIds,
  });
  final Api api;
  final GroupService service;
  final String groupId;
  final Set<String> memberIds;

  @override
  State<_InviteBottomSheet> createState() => _InviteBottomSheetState();
}

class _InviteBottomSheetState extends State<_InviteBottomSheet> {
  final _searchController = TextEditingController();
  List<dynamic> _results = [];
  bool _isSearching = false;
  String? _error;
  final Set<String> _invitedIds = {};
  final Set<String> _sendingIds = {};

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final q = _searchController.text.trim();
    if (q.isEmpty) {
      setState(() {
        _results = [];
        _error = null;
      });
      return;
    }
    setState(() {
      _isSearching = true;
      _error = null;
    });
    try {
      final list = await widget.api.get(
        '/users/search?query=${Uri.encodeComponent(q)}',
      );
      final filtered = list.where((e) {
        if (e is! Map) return false;
        final id = (e['id'] ?? e['userId'])?.toString() ?? '';
        if (id.isEmpty) return false;
        return !widget.memberIds.contains(id);
      }).toList();
      if (mounted) {
        setState(() {
          _results = filtered;
          _isSearching = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isSearching = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  Future<void> _invite(String userId, String username) async {
    if (_sendingIds.contains(userId) || _invitedIds.contains(userId)) return;
    setState(() => _sendingIds.add(userId));
    try {
      final created =
          await widget.service.inviteToGroup(widget.groupId, [userId]);
      if (!mounted) return;
      setState(() {
        _sendingIds.remove(userId);
        _invitedIds.add(userId);
      });
      ScaffoldMessenger.of(context).clearSnackBars();
      if (created.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content:
                  Text('$username has already been invited or is a member')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Invitation sent to: $username')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _sendingIds.remove(userId));
      ScaffoldMessenger.of(context).clearSnackBars();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.7,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Invite Member',
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () =>
                        Navigator.pop(context, _invitedIds.isNotEmpty),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                key: const Key('invite_search_field'),
                controller: _searchController,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Search by username or email',
                  prefixIcon: const Icon(Icons.search),
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.arrow_forward),
                    onPressed: _search,
                  ),
                ),
                onSubmitted: (_) => _search(),
              ),
              const SizedBox(height: 12),
              if (_isSearching)
                const Expanded(
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null)
                Expanded(
                  child: Center(child: Text(_error!)),
                )
              else if (_searchController.text.trim().isEmpty &&
                  _results.isEmpty)
                const Expanded(
                  child: Center(
                    child: Text(
                      'Enter a username or email and press search.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                )
              else if (_results.isEmpty)
                const Expanded(
                  child: Center(
                    child: Text(
                      'No results found',
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                )
              else
                Expanded(
                  child: ListView.builder(
                    itemCount: _results.length,
                    itemBuilder: (context, i) {
                      final item = (_results[i] as Map).cast<String, dynamic>();
                      final userId =
                          (item['id'] ?? item['userId'])?.toString() ?? '';
                      final username = item['username']?.toString() ?? 'User';
                      final email = item['email']?.toString() ?? '';
                      final invited = _invitedIds.contains(userId);
                      final sending = _sendingIds.contains(userId);
                      return ListTile(
                        leading: CircleAvatar(
                          child: Text(username.isNotEmpty
                              ? username[0].toUpperCase()
                              : '?'),
                        ),
                        title: Text(username),
                        subtitle: Text(email),
                        trailing: invited
                            ? const Chip(
                                label: Text('Sent',
                                    style: TextStyle(fontSize: 12)),
                              )
                            : sending
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  )
                                : ElevatedButton(
                                    key: Key('invite_user_$userId'),
                                    onPressed: () => _invite(userId, username),
                                    child: const Text('Invite'),
                                  ),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
