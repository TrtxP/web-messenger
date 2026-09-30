// ignore_for_file: duplicate_ignore, use_build_context_synchronously

import 'package:flutter/material.dart';
import '../../../core/network/api_client.dart';
import '../../profile/services/profile_service.dart';

class InvitationsScreen extends StatefulWidget {
  const InvitationsScreen({super.key});

  @override
  State<InvitationsScreen> createState() => _InvitationsScreenState();
}

class _InvitationsScreenState extends State<InvitationsScreen> {
  final api = Api();
  final _profileService = ProfileService();
  List<dynamic> received = [];
  List<dynamic> sent = [];
  bool isLoading = true;

  String? _avatarFor(Map<String, dynamic> user) {
    final raw = user['avatarUrl']?.toString();
    if (raw != null && raw.isNotEmpty) {
      if (raw.startsWith('/api/') || raw.startsWith('http')) {
        return _profileService.resolveAvatarUrl(raw);
      }
      final userId = user['id']?.toString();
      if (userId != null && userId.isNotEmpty) {
        return _profileService.resolveAvatarUrl(
          '/api/media/stream/$userId',
        );
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
      child: avatarUrl == null
          ? Text(username.isNotEmpty ? username[0].toUpperCase() : '?')
          : null,
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
          isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => isLoading = false);
    }
  }

  Future<void> _accept(String id) async {
    try {
      await api.post('/invitations/$id/accept', {});
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invitation accepted')),
      );
      _loadInvitations();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  Future<void> _decline(String id) async {
    try {
      await api.post('/invitations/$id/decline', {});
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invitation declined')),
      );
      _loadInvitations();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Invitations'),
          bottom: const TabBar(
            tabs: [
              Tab(key: Key('received_tab'), text: 'Received'),
              Tab(key: Key('sent_tab'), text: 'Sent'),
            ],
          ),
        ),
        body: isLoading
            ? const Center(child: CircularProgressIndicator())
            : TabBarView(
                children: [
                  _buildReceivedList(),
                  _buildSentList(),
                ],
              ),
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
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                key: const Key('accept_invite_button'),
                icon: const Icon(Icons.check, color: Colors.green),
                onPressed: () => _accept(id),
              ),
              IconButton(
                key: const Key('decline_invite_button'),
                icon: const Icon(Icons.close, color: Colors.red),
                onPressed: () => _decline(id),
              ),
            ],
          ),
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

        return ListTile(
          leading: _buildAvatar(recipient, username),
          title: Text(username),
          subtitle: const Text('Status: Pending'),
          trailing: const Chip(
            label: Text('Pending', style: TextStyle(fontSize: 12)),
          ),
        );
      },
    );
  }
}
