// ignore_for_file: use_build_context_synchronously

import 'package:flutter/material.dart';
import '../../../core/network/api_client.dart';
import '../../profile/services/profile_service.dart';

class UserSearch extends SearchDelegate<void> {
  UserSearch(this.api, this.user);
  final Api api;
  final Map<String, dynamic> user;
  final ProfileService _profileService = ProfileService();

  @override
  List<Widget>? buildActions(BuildContext context) => [
        IconButton(
          onPressed: () => query = '',
          icon: const Icon(Icons.clear),
        ),
      ];

  @override
  Widget? buildLeading(BuildContext context) => IconButton(
        onPressed: () => close(context, null),
        icon: const Icon(Icons.arrow_back),
      );

  @override
  Widget buildResults(BuildContext context) {
    if (query.trim().isEmpty) {
      return const Center(child: Text('Enter a username or email'));
    }

    return FutureBuilder<List<dynamic>>(
      future:
          api.get('/users/search?query=${Uri.encodeComponent(query.trim())}'),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(child: Text('Search failed: ${snapshot.error}'));
        }
        final rawList = snapshot.data ?? [];
        final currentId =
            user['id'] ?? (user['user'] is Map ? user['user']['id'] : null);
        final users = rawList
            .whereType<Map<String, dynamic>>()
            .where((item) => item['id'] != currentId)
            .toList();

        if (users.isEmpty) {
          return const Center(child: Text('No users found'));
        }

        return ListView.builder(
          itemCount: users.length,
          itemBuilder: (context, index) {
            final item = users[index];
            final username = item['username'] as String? ?? '';
            final email = item['email'] as String? ?? '';
            final relationship = item['relationship'] as String? ?? 'none';
            final avatarUrl = _profileService.resolveAvatarUrl(
              item['avatarUrl']?.toString(),
            );

            Widget action;
            if (relationship == 'contact' || relationship == 'chat') {
              action = TextButton(
                onPressed: () {
                  close(context, null);
                },
                child: const Text('Open Chat'),
              );
            } else if (relationship == 'pending') {
              action = const Chip(label: Text('Pending'));
            } else {
              action = ElevatedButton(
                onPressed: () async {
                  try {
                    await api.post('/invitations', {'recipientId': item['id']});
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Invitation sent to $username')),
                    );
                    close(context, null);
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: Text(
                              e.toString().replaceFirst('Exception: ', ''))),
                    );
                  }
                },
                child: const Text('Send Invite'),
              );
            }

            return ListTile(
              leading: Stack(
                children: [
                  CircleAvatar(
                    backgroundImage:
                        avatarUrl == null ? null : NetworkImage(avatarUrl),
                    child: avatarUrl == null
                        ? Text(
                            username.isNotEmpty
                                ? username[0].toUpperCase()
                                : '?',
                          )
                        : null,
                  ),
                  if (item['isOnline'] == true)
                    const Positioned(
                      right: 0,
                      bottom: 0,
                      child: CircleAvatar(
                        radius: 5,
                        backgroundColor: Colors.green,
                      ),
                    ),
                ],
              ),
              title: Text(username),
              subtitle: Text(email),
              trailing: action,
            );
          },
        );
      },
    );
  }

  @override
  Widget buildSuggestions(BuildContext context) {
    if (query.trim().isEmpty) {
      return const Center(child: Text('Enter a username or email to search'));
    }
    return buildResults(context);
  }
}
