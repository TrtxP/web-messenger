import 'package:flutter/material.dart';
import '../../../core/network/api_client.dart';
import '../../profile/services/profile_service.dart';
import '../../groups/services/group_service.dart';

class InvitationsScreen extends StatefulWidget {
  const InvitationsScreen({super.key});

  @override
  State<InvitationsScreen> createState() => _InvitationsScreenState();
}

class _InvitationsScreenState extends State<InvitationsScreen> {
  final api = Api();
  late final GroupService _groupService = GroupService(api: api);
  final _profileService = ProfileService();
  List<dynamic> received = [];
  List<dynamic> sent = [];
  List<dynamic> groupInvites = [];
  bool isLoading = true;

  String? _avatarFor(Map<String, dynamic> user) {
    final raw = user['avatarUrl']?.toString();
    if (raw != null && raw.isNotEmpty) {
      if (raw.startsWith('/api/') || raw.startsWith('http')) {
        return _profileService.resolveAvatarUrl(raw);
      }
      final userId = user['id']?.toString();
      if (userId != null && userId.isNotEmpty) {
        return _profileService.resolveAvatarUrl('/api/media/stream/$userId');
      }
      return null;
    }
    return null;
  }

  Widget _buildAvatar(Map<String, dynamic> user, String username) {
    final avatarUrl = _avatarFor(user);
    return CircleAvatar(
      backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl) : null,
      onBackgroundImageError: (_, __) {},
      child: avatarUrl == null ? Text(username.isNotEmpty ? username[0].toUpperCase() : '?') : null,
    );
  }

  @override
  void initState() {
    super.initState();
    _loadInvitations();
  }

  Future<void> _loadInvitations() async {
    setState(() => isLoading = true);
    try {
      final res = await api.request('/invitations/pending');
      if (res is Map<String, dynamic> && mounted) {
        setState(() {
          received = (res['received'] as List<dynamic>?) ?? [];
          sent = (res['sent'] as List<dynamic>?) ?? [];
        });
      }
    } catch (_) {}
    try {
      final groups = await _groupService.getPendingGroupInvitations();
      if (mounted) setState(() => groupInvites = groups);
    } catch (_) {}
    if (mounted) setState(() => isLoading = false);
  }

  Future<void> _accept(String id) async {
    try {
      await api.post('/invitations/$id/accept', {});
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Invitation accepted')));
      _loadInvitations();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    }
  }

  Future<void> _decline(String id) async {
    try {
      await api.post('/invitations/$id/decline', {});
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Invitation declined')));
      _loadInvitations();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    }
  }

  Future<void> _acceptGroup(String id) async {
    try {
      await _groupService.acceptGroupInvitation(id);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Group invitation accepted')));
      _loadInvitations();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    }
  }

  Future<void> _declineGroup(String id) async {
    try {
      await _groupService.declineGroupInvitation(id);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Group invitation declined')));
      _loadInvitations();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Invitations'),
          bottom: const TabBar(tabs: [Tab(key: Key('received_tab'), text: 'Received'), Tab(key: Key('sent_tab'), text: 'Sent'), Tab(key: Key('groups_tab'), text: 'Groups')]),
        ),
        body: isLoading
            ? const Center(child: CircularProgressIndicator())
            : TabBarView(children: [_buildReceivedList(), _buildSentList(), _buildGroupList()]),
      ),
    );
  }

  Widget _buildReceivedList() {
    if (received.isEmpty) {
      return const Center(child: Text('No received invitations'));
    }
    return ListView.builder(
      itemCount: received.length,
      itemBuilder: (context, index) {
        final item = received[index] as Map<String, dynamic>;
        final id = item['id'] as String;
        final sender = (item['from'] as Map<String, dynamic>?) ?? {};
        final username = sender['username'] as String? ?? 'User';
        return ListTile(
          leading: _buildAvatar(sender, username),
          title: Text(username),
          subtitle: Text('Invite ID: $id'),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [IconButton(key: const Key('accept_invite_button'), icon: const Icon(Icons.check, color: Colors.green), onPressed: () => _accept(id)), IconButton(key: const Key('decline_invite_button'), icon: const Icon(Icons.close, color: Colors.red), onPressed: () => _decline(id))]),
        );
      },
    );
  }

  Widget _buildSentList() {
    if (sent.isEmpty) {
      return const Center(child: Text('No sent invitations'));
    }
    return ListView.builder(
      itemCount: sent.length,
      itemBuilder: (context, index) {
        final item = sent[index] as Map<String, dynamic>;
        final recipient = (item['to'] as Map<String, dynamic>?) ?? {};
        final username = recipient['username'] as String? ?? 'User';
        return ListTile(leading: _buildAvatar(recipient, username), title: Text(username), subtitle: const Text('Status: Pending'), trailing: const Chip(label: Text('Pending', style: TextStyle(fontSize: 12))));
      },
    );
  }

  Widget _buildGroupList() {
    if (groupInvites.isEmpty) {
      return const Center(child: Text('No group invitations'));
    }
    return ListView.builder(
      itemCount: groupInvites.length,
      itemBuilder: (context, index) {
        final item = groupInvites[index] as Map<String, dynamic>;
        final id = (item['id'] ?? item['invitationId'])?.toString() ?? '';
        final groupName = (item['groupName'] ?? item['group_name'] ?? 'Group').toString();
        final fromName = (item['fromUsername'] ?? item['from_username'] ?? 'User').toString();
        return ListTile(
          leading: const CircleAvatar(child: Icon(Icons.group)),
          title: Text(groupName),
          subtitle: Text('From $fromName'),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [IconButton(icon: const Icon(Icons.check, color: Colors.green), onPressed: () => _acceptGroup(id)), IconButton(icon: const Icon(Icons.close, color: Colors.red), onPressed: () => _declineGroup(id))]),
        );
      },
    );
  }
}
