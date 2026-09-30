import 'package:flutter/material.dart';
import '../services/profile_service.dart';
import '../widgets/profile_avatar_widget.dart';
import '../widgets/profile_info_widget.dart';
import 'blocked_users_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.user, required this.onUpdated});
  final Map<String, dynamic> user;
  final ValueChanged<Map<String, dynamic>> onUpdated;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final ProfileService _profileService = ProfileService();
  late TextEditingController usernameController;
  late TextEditingController aboutController;
  bool isEditing = false;
  bool isSaving = false;
  bool isUploadingAvatar = false;
  String? errorMessage;
  String? avatarUrl;

  @override
  void initState() {
    super.initState();
    final u = widget.user['user'] is Map
        ? widget.user['user'] as Map<String, dynamic>
        : widget.user;
    usernameController =
        TextEditingController(text: u['username'] as String? ?? '');
    aboutController = TextEditingController(text: u['about'] as String? ?? '');
    avatarUrl = u['avatarUrl'] as String?;
    _fetchProfile();
  }

  Future<void> _fetchProfile() async {
    try {
      final res = await _profileService.fetchProfile();
      if (res != null && mounted) {
        setState(() {
          usernameController.text =
              res['username'] as String? ?? usernameController.text;
          aboutController.text =
              res['about'] as String? ?? aboutController.text;
          avatarUrl = res['avatarUrl'] as String?;
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    usernameController.dispose();
    aboutController.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    setState(() {
      isSaving = true;
      errorMessage = null;
    });

    try {
      final updated = await _profileService.updateProfile(
        usernameController.text,
        aboutController.text,
      );
      if (mounted) {
        setState(() {
          isSaving = false;
          isEditing = false;
        });

        widget.onUpdated(updated);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile updated successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          isSaving = false;
          errorMessage = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  Future<void> _handleAvatarUpload(List<int> bytes, String filename) async {
    setState(() => isUploadingAvatar = true);
    try {
      final res = await _profileService.uploadAvatar(bytes, filename);
      if (mounted) {
        setState(() {
          isUploadingAvatar = false;
          avatarUrl = res['avatarUrl'] as String?;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Avatar uploaded successfully!')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => isUploadingAvatar = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Failed to upload avatar: ${e.toString().replaceFirst("Exception: ", "")}',
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final resolvedUrl = _profileService.resolveAvatarUrl(avatarUrl);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          if (!isEditing)
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () => setState(() => isEditing = true),
            )
          else
            IconButton(
              icon: const Icon(Icons.check),
              onPressed: isSaving ? null : _saveProfile,
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          children: [
            ProfileAvatarWidget(
              resolvedUrl: resolvedUrl,
              isUploading: isUploadingAvatar,
              onAvatarPicked: _handleAvatarUpload,
            ),
            const SizedBox(height: 24),
            ProfileInfoWidget(
              usernameController: usernameController,
              aboutController: aboutController,
              isEditing: isEditing,
              isSaving: isSaving,
              errorMessage: errorMessage,
              onSave: _saveProfile,
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                key: const Key('blocked_users_button'),
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const BlockedUsersScreen(),
                    ),
                  );
                },
                icon: const Icon(Icons.block),
                label: const Text('Blocked Users'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
