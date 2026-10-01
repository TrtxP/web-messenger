import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:record/record.dart';
import '../widgets/message_action_dialogs.dart';
import '../../../core/utils/platform_utils.dart';

class ChatAudioRecorder {
  final AudioRecorder _recorder = AudioRecorder();
  Timer? _timer;

  bool isRecording = false;
  int recordingSeconds = 0;
  String? recordingPath;

  Future<bool> startRecording(
    BuildContext context, {
    required VoidCallback onUpdate,
  }) async {
    if (kIsWeb || !isMobilePlatform) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Audio recording is not supported in web browser'),
          ),
        );
      }
      return false;
    }
    final shouldContinue =
        await MessageActionDialogs.showMicrophonePermissionDialog(context);
    if (shouldContinue != true || !context.mounted) return false;

    try {
      if (!await _recorder.hasPermission()) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Microphone permission is required. Enable it in app settings to record voice messages.',
              ),
            ),
          );
        }
        return false;
      }
      recordingPath =
          'voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc),
        path: recordingPath!,
      );
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not start recording: $e')),
        );
      }
      return false;
    }

    isRecording = true;
    recordingSeconds = 0;
    onUpdate();

    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      recordingSeconds++;
      onUpdate();
    });
    return true;
  }

  Future<void> cancelRecording({required VoidCallback onUpdate}) async {
    _timer?.cancel();
    try {
      await _recorder.stop();
    } catch (_) {}
    recordingPath = null;
    isRecording = false;
    recordingSeconds = 0;
    onUpdate();
  }

  Future<String?> stopRecording({required VoidCallback onUpdate}) async {
    _timer?.cancel();
    String? recordedPath;
    try {
      recordedPath = await _recorder.stop();
    } catch (_) {}
    recordingPath = null;
    isRecording = false;
    recordingSeconds = 0;
    onUpdate();
    return recordedPath;
  }

  void dispose() {
    _timer?.cancel();
    _recorder.dispose();
  }
}
