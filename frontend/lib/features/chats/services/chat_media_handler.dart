import 'dart:io';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_compress/video_compress.dart';

import 'chat_service.dart';

class ChatMediaHandler {
  ChatMediaHandler({ChatService? chatService})
      : _chatService = chatService ?? ChatService();

  final ChatService _chatService;

  static const int maxVideoSize = 20 * 1024 * 1024;

  static const XTypeGroup audioTypeGroup = XTypeGroup(
    label: 'audio',
    extensions: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'opus'],
    mimeTypes: [
      'audio/mpeg',
      'audio/mp4',
      'audio/aac',
      'audio/wav',
      'audio/ogg',
      'audio/flac',
      'audio/opus',
    ],
  );

  static const XTypeGroup imageTypeGroup = XTypeGroup(
    label: 'images',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ],
  );

  static const XTypeGroup videoTypeGroup = XTypeGroup(
    label: 'videos',
    extensions: ['mp4', 'mov', 'm4v', '3gp', 'avi', 'mkv', 'webm'],
    mimeTypes: [
      'video/mp4',
      'video/quicktime',
      'video/3gpp',
      'video/x-msvideo',
      'video/x-matroska',
      'video/webm',
    ],
  );

  Future<void> sendAudioRecording({
    required BuildContext context,
    required bool isDesktop,
    required String? recordedPath,
    required String? fallbackRecordingPath,
    required int durationSeconds,
    required Future<void> Function({
      required String type,
      String? mediaId,
      String? defaultContent,
    }) onSendMessage,
    required Future<void> Function(String?) onSetActivity,
  }) async {
    if (isDesktop) {
      final XFile? file = await openFile(acceptedTypeGroups: [audioTypeGroup]);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      if (bytes.isEmpty) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Selected audio file is empty.')),
          );
        }
        return;
      }
      await onSetActivity('sending_audio');
      try {
        final uploadResult = await _chatService.uploadMedia(bytes, file.name);
        final mediaId =
            (uploadResult['mediaId'] ?? uploadResult['id']) as String;
        await onSendMessage(
          type: 'AUDIO',
          mediaId: mediaId,
          defaultContent: 'Voice message ($durationSeconds s)',
        );
      } catch (_) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Audio upload failed.')),
          );
        }
      } finally {
        await onSetActivity(null);
      }
    } else if (recordedPath != null && await File(recordedPath).exists()) {
      final bytes = await File(recordedPath).readAsBytes();
      if (bytes.isEmpty) return;
      await onSetActivity('sending_audio');
      try {
        final uploadResult = await _chatService.uploadMedia(
          bytes,
          'voice_${DateTime.now().millisecondsSinceEpoch}.m4a',
        );
        final mediaId =
            (uploadResult['mediaId'] ?? uploadResult['id']) as String;
        await onSendMessage(
          type: 'AUDIO',
          mediaId: mediaId,
          defaultContent: 'Voice message ($durationSeconds s)',
        );
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Audio upload failed: $e')),
          );
        }
      } finally {
        await onSetActivity(null);
        try {
          await File(recordedPath).delete();
        } catch (_) {}
      }
    } else {
      if (fallbackRecordingPath != null) {
        try {
          await File(fallbackRecordingPath).delete();
        } catch (_) {}
      }
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No audio was recorded. Please try again.'),
          ),
        );
      }
    }
  }

  Future<void> pickAndSendAudio({
    required BuildContext context,
    required Future<void> Function({
      required String type,
      String? mediaId,
      String? defaultContent,
    }) onSendMessage,
    required Future<void> Function(String?) onSetActivity,
  }) async {
    final XFile? file = await openFile(acceptedTypeGroups: [audioTypeGroup]);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (bytes.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Selected audio file is empty.')),
        );
      }
      return;
    }
    await onSetActivity('sending_audio');
    try {
      final uploadResult = await _chatService.uploadMedia(bytes, file.name);
      final mediaId = (uploadResult['mediaId'] ?? uploadResult['id']) as String;
      await onSendMessage(
        type: 'AUDIO',
        mediaId: mediaId,
        defaultContent: 'Audio message (${file.name})',
      );
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Audio upload failed.')),
        );
      }
    } finally {
      await onSetActivity(null);
    }
  }

  Future<void> sendImage({
    required BuildContext context,
    required ImageSource source,
    required bool isDesktop,
    required Future<void> Function({
      required String type,
      String? mediaId,
      String? defaultContent,
    }) onSendMessage,
    required Future<void> Function(String?) onSetActivity,
  }) async {
    List<int> bytes;
    String filename;

    if (isDesktop) {
      final XFile? file = await openFile(acceptedTypeGroups: [imageTypeGroup]);
      if (file == null) return;
      bytes = await file.readAsBytes();
      filename = file.name;
    } else {
      final picked =
          await ImagePicker().pickImage(source: source, imageQuality: 85);
      if (picked == null) return;
      bytes = await picked.readAsBytes();
      filename = picked.name;
    }

    if (bytes.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Selected image file is empty.')),
        );
      }
      return;
    }

    await onSetActivity('sending_image');
    try {
      final uploadResult = await _chatService.uploadMedia(bytes, filename);
      final mediaId = (uploadResult['mediaId'] ?? uploadResult['id']) as String;
      await onSendMessage(type: 'IMAGE', mediaId: mediaId);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Image upload failed.')),
        );
      }
    } finally {
      await onSetActivity(null);
    }
  }

  Future<void> sendVideo({
    required BuildContext context,
    required ImageSource source,
    required bool isDesktop,
    XFile? selectedFile,
    required Future<void> Function({
      required String type,
      String? mediaId,
      String? defaultContent,
    }) onSendMessage,
    required Future<void> Function(String?) onSetActivity,
  }) async {
    List<int> bytes = <int>[];
    String filename;
    final generatedFiles = <String>[];
    var originalSize = 0;

    if (isDesktop) {
      final XFile? file =
          selectedFile ?? await openFile(acceptedTypeGroups: [videoTypeGroup]);
      if (file == null) return;
      originalSize = await File(file.path).length();
      if (originalSize <= maxVideoSize) {
        bytes = await file.readAsBytes();
      }
      filename = file.name;
    } else {
      final picked =
          selectedFile ?? await ImagePicker().pickVideo(source: source);
      if (picked == null) return;
      final originalFile = File(picked.path);
      originalSize = await originalFile.length();
      filename = picked.name;

      try {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Preparing video...')),
          );
        }
        final compressed = await VideoCompress.compressVideo(
          picked.path,
          quality: VideoQuality.MediumQuality,
          deleteOrigin: false,
          includeAudio: true,
        );
        final outputPath = compressed?.path;
        if (outputPath != null && await File(outputPath).exists()) {
          generatedFiles.add(outputPath);
          final compressedFile = File(outputPath);
          if (await compressedFile.length() <= maxVideoSize) {
            bytes = await compressedFile.readAsBytes();
            filename = 'video_${DateTime.now().millisecondsSinceEpoch}.mp4';
          }
        }
        if (bytes.isEmpty) {
          final smaller = await VideoCompress.compressVideo(
            picked.path,
            quality: VideoQuality.LowQuality,
            deleteOrigin: false,
            includeAudio: true,
          );
          final smallerPath = smaller?.path;
          if (smallerPath != null && await File(smallerPath).exists()) {
            generatedFiles.add(smallerPath);
            final smallerFile = File(smallerPath);
            if (await smallerFile.length() <= maxVideoSize) {
              bytes = await smallerFile.readAsBytes();
              filename = 'video_${DateTime.now().millisecondsSinceEpoch}.mp4';
            }
          }
        }
      } catch (_) {}
      if (bytes.isEmpty && originalSize <= maxVideoSize) {
        bytes = await originalFile.readAsBytes();
      }
      if (context.mounted) ScaffoldMessenger.of(context).hideCurrentSnackBar();
    }

    if (bytes.isEmpty) {
      for (final path in generatedFiles) {
        try {
          await File(path).delete();
        } catch (_) {}
      }
      if (context.mounted) {
        final message = originalSize > maxVideoSize
            ? isDesktop
                ? 'Video exceeds 20 MB. Choose a shorter video.'
                : 'Could not compress this video below 20 MB. Choose a shorter video.'
            : 'Selected video file is empty or could not be processed.';
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message)));
      }
      return;
    }

    if (bytes.length > maxVideoSize) {
      for (final path in generatedFiles) {
        try {
          await File(path).delete();
        } catch (_) {}
      }
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Video is still over 20 MB. Choose a shorter video.'),
          ),
        );
      }
      return;
    }

    await onSetActivity('sending_video');
    try {
      final uploadResult = await _chatService.uploadMedia(bytes, filename);
      final mediaId = (uploadResult['mediaId'] ?? uploadResult['id']) as String;
      await onSendMessage(type: 'VIDEO', mediaId: mediaId);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Video upload failed: $error')),
        );
      }
    } finally {
      await onSetActivity(null);
      for (final path in generatedFiles) {
        try {
          await File(path).delete();
        } catch (_) {}
      }
    }
  }

  Future<void> pickAndSendVideoFile({
    required BuildContext context,
    required bool isDesktop,
    required Future<void> Function({
      required String type,
      String? mediaId,
      String? defaultContent,
    }) onSendMessage,
    required Future<void> Function(String?) onSetActivity,
  }) async {
    final file = await openFile(acceptedTypeGroups: [videoTypeGroup]);
    if (file == null || !context.mounted) return;
    await sendVideo(
      context: context,
      source: ImageSource.gallery,
      isDesktop: isDesktop,
      selectedFile: file,
      onSendMessage: onSendMessage,
      onSetActivity: onSetActivity,
    );
  }
}
