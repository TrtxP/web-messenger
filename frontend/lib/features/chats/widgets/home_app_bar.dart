import 'package:flutter/material.dart';

class HomeAppBar extends StatelessWidget implements PreferredSizeWidget {
  final bool showingArchived;
  final VoidCallback onToggleArchived;
  final VoidCallback onOpenInvitations;
  final VoidCallback onOpenProfile;
  final VoidCallback onLogout;

  const HomeAppBar({
    super.key,
    required this.showingArchived,
    required this.onToggleArchived,
    required this.onOpenInvitations,
    required this.onOpenProfile,
    required this.onLogout,
  });

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      title: Text(showingArchived ? 'Archived Chats' : 'Chats'),
      actions: [
        IconButton(
          icon: Icon(showingArchived ? Icons.unarchive : Icons.archive),
          tooltip: showingArchived ? 'Active chats' : 'Archived chats',
          onPressed: onToggleArchived,
        ),
        IconButton(
          icon: const Icon(Icons.mail),
          tooltip: 'Invitations',
          onPressed: onOpenInvitations,
        ),
        IconButton(
          icon: const Icon(Icons.person),
          tooltip: 'Profile',
          onPressed: onOpenProfile,
        ),
        IconButton(
          icon: const Icon(Icons.logout),
          tooltip: 'Logout',
          onPressed: onLogout,
        ),
      ],
    );
  }
}
