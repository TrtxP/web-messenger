import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

class ProfileAvatarWidget extends StatelessWidget {
  const ProfileAvatarWidget({
    super.key,
    required this.resolvedUrl,
    required this.isUploading,
    required this.onAvatarPicked,
  });

  final String? resolvedUrl;
  final bool isUploading;
  final Future<void> Function(List<int> bytes, String filename) onAvatarPicked;

  Future<void> _pickImage(BuildContext context, ImageSource source) async {
    final picker = ImagePicker();
    try {
      XFile? pickedFile;
      pickedFile = await picker.pickImage(source: source);
      if (source == ImageSource.camera && pickedFile == null) {
        pickedFile = await picker.pickImage(source: ImageSource.gallery);
      }
      if (pickedFile == null) return;

      final length = await pickedFile.length();
      if (length > 5 * 1024 * 1024) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'File exceeds 5MB limit. Please choose a smaller image.',
              ),
            ),
          );
        }
        return;
      }

      final ext = pickedFile.name.toLowerCase();
      if (!ext.endsWith('.jpg') &&
          !ext.endsWith('.jpeg') &&
          !ext.endsWith('.png')) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content:
                  Text('Avatar upload supported: JPEG and PNG under 5MB only'),
            ),
          );
        }
        return;
      }

      final bytes = await pickedFile.readAsBytes();
      await onAvatarPicked(bytes, pickedFile.name);
    } catch (e) {
      if (context.mounted) {
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

  void _showAvatarOptions(BuildContext context) {
    final platform = Theme.of(context).platform;
    final isDesktop = platform == TargetPlatform.windows ||
        platform == TargetPlatform.linux ||
        platform == TargetPlatform.macOS;

    if (isDesktop) {
      _pickImage(context, ImageSource.gallery);
      return;
    }

    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choose from Gallery'),
              onTap: () {
                Navigator.of(ctx).pop();
                _pickImage(context, ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Take a Photo'),
              onTap: () {
                Navigator.of(ctx).pop();
                _pickImage(context, ImageSource.camera);
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Stack(
        children: [
          GestureDetector(
            onTap: isUploading ? null : () => _showAvatarOptions(context),
            child: CircleAvatar(
              key: const Key('profile_avatar'),
              radius: 50,
              backgroundImage:
                  resolvedUrl != null ? NetworkImage(resolvedUrl!) : null,
              child: resolvedUrl == null
                  ? const Icon(Icons.person, size: 50)
                  : null,
            ),
          ),
          Positioned(
            bottom: 0,
            right: 0,
            child: CircleAvatar(
              radius: 18,
              backgroundColor: Theme.of(context).colorScheme.primary,
              child: isUploading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : IconButton(
                      icon: const Icon(
                        Icons.camera_alt,
                        size: 18,
                        color: Colors.white,
                      ),
                      onPressed: () => _showAvatarOptions(context),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
