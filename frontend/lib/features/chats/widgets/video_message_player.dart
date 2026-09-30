import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

class VideoMessagePlayer extends StatelessWidget {
  const VideoMessagePlayer({super.key, required this.videoUrl});

  final String? videoUrl;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const Key('video_message_preview'),
      onTap: videoUrl == null || videoUrl!.isEmpty
          ? null
          : () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => _FullscreenVideoPlayer(videoUrl: videoUrl!),
                ),
              ),
      child: Container(
        width: 220,
        height: 150,
        decoration: BoxDecoration(
          color: Colors.grey.shade900,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Center(
          child: Icon(
            videoUrl == null || videoUrl!.isEmpty
                ? Icons.videocam_off
                : Icons.play_circle_fill,
            size: 58,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}

class _FullscreenVideoPlayer extends StatefulWidget {
  const _FullscreenVideoPlayer({required this.videoUrl});

  final String videoUrl;

  @override
  State<_FullscreenVideoPlayer> createState() => _FullscreenVideoPlayerState();
}

class _FullscreenVideoPlayerState extends State<_FullscreenVideoPlayer> {
  late final VideoPlayerController _controller;
  bool _loading = true;
  String? _error;
  double? _scrubPositionMs;
  bool _resumeAfterScrub = false;

  bool get _supportsDeviceRotation =>
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;

  @override
  void initState() {
    super.initState();
    if (_supportsDeviceRotation) {
      unawaited(
        SystemChrome.setPreferredOrientations(const [
          DeviceOrientation.portraitUp,
          DeviceOrientation.landscapeLeft,
          DeviceOrientation.landscapeRight,
        ]),
      );
    }
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.videoUrl));
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      await _controller.initialize();
      try {
        await _controller.setVolume(1);
      } catch (_) {}
      await _controller.play();
      if (mounted) setState(() => _loading = false);
    } catch (error) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = error.toString();
        });
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    if (_supportsDeviceRotation) {
      unawaited(
        SystemChrome.setPreferredOrientations(const [
          DeviceOrientation.portraitUp,
          DeviceOrientation.landscapeLeft,
          DeviceOrientation.landscapeRight,
        ]),
      );
    }
    super.dispose();
  }

  Future<void> _togglePlayback(VideoPlayerValue value) async {
    if (value.isPlaying) {
      await _controller.pause();
    } else {
      if (value.isCompleted) await _controller.seekTo(Duration.zero);
      await _controller.play();
    }
  }

  Future<void> _skip(Duration offset) async {
    final value = _controller.value;
    var target = value.position + offset;
    if (target < Duration.zero) target = Duration.zero;
    if (target > value.duration) target = value.duration;
    await _controller.seekTo(target);
    if (value.isCompleted && offset.isNegative) {
      await _controller.play();
    }
  }

  String _formatTime(Duration duration) {
    final totalSeconds = duration.inSeconds;
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds ~/ 60) % 60;
    final seconds = totalSeconds % 60;
    final s = seconds.toString().padLeft(2, '0');
    if (hours > 0) {
      return '$hours:${minutes.toString().padLeft(2, '0')}:$s';
    }
    return '${totalSeconds ~/ 60}:$s';
  }

  Size _fittedVideoSize(double maxW, double maxH, double aspectRatio) {
    final raw = aspectRatio;
    final aspect = (raw.isFinite && raw > 0) ? raw : 16 / 9;
    if (maxW <= 0 || maxH <= 0) {
      return Size(maxW, maxW / aspect);
    }
    if (maxW / maxH > aspect) {
      final h = maxH;
      return Size(h * aspect, h);
    } else {
      final w = maxW;
      return Size(w, w / aspect);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Video'),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(color: Colors.white),
              )
            : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Could not play this video.\n$_error',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                  )
                : ValueListenableBuilder<VideoPlayerValue>(
                    valueListenable: _controller,
                    builder: (context, value, _) {
                      final durationMs = value.duration.inMilliseconds;
                      final positionMs = (_scrubPositionMs ??
                              value.position.inMilliseconds.toDouble())
                          .clamp(
                            0.0,
                            durationMs > 0 ? durationMs.toDouble() : 1.0,
                          )
                          .toDouble();
                      final displayedPosition = Duration(
                        milliseconds: positionMs.round(),
                      );
                      final videoAspect =
                          (value.aspectRatio.isFinite && value.aspectRatio > 0)
                              ? value.aspectRatio
                              : 16 / 9;

                      return Column(
                        children: [
                          Expanded(
                            child: LayoutBuilder(
                              builder: (context, constraints) {
                                final fitted = _fittedVideoSize(
                                  constraints.maxWidth,
                                  constraints.maxHeight,
                                  videoAspect,
                                );
                                return Center(
                                  child: SizedBox(
                                    width: fitted.width,
                                    height: fitted.height,
                                    child: GestureDetector(
                                      key: const Key('video_surface'),
                                      onTap: () => _togglePlayback(value),
                                      child: VideoPlayer(_controller),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                            child: Row(
                              children: [
                                IconButton(
                                  key: const Key('video_skip_back_5'),
                                  tooltip: 'Back 5 seconds',
                                  color: Colors.white,
                                  onPressed: () =>
                                      _skip(const Duration(seconds: -5)),
                                  icon: const Icon(Icons.replay_5),
                                ),
                                IconButton(
                                  key: const Key('video_play_pause'),
                                  tooltip: value.isPlaying ? 'Pause' : 'Play',
                                  color: Colors.white,
                                  iconSize: 32,
                                  onPressed: () => _togglePlayback(value),
                                  icon: Icon(value.isPlaying
                                      ? Icons.pause
                                      : Icons.play_arrow),
                                ),
                                IconButton(
                                  key: const Key('video_skip_forward_5'),
                                  tooltip: 'Forward 5 seconds',
                                  color: Colors.white,
                                  onPressed: () =>
                                      _skip(const Duration(seconds: 5)),
                                  icon: const Icon(Icons.forward_5),
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  '${_formatTime(displayedPosition)} / ${_formatTime(value.duration)}',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: Slider(
                              key: const Key('video_seek_slider'),
                              min: 0,
                              max: durationMs > 0 ? durationMs.toDouble() : 1,
                              value: positionMs,
                              onChangeStart: durationMs <= 0
                                  ? null
                                  : (_) async {
                                      _resumeAfterScrub = value.isPlaying;
                                      if (_resumeAfterScrub) {
                                        await _controller.pause();
                                      }
                                    },
                              onChanged: durationMs <= 0
                                  ? null
                                  : (next) => setState(
                                        () => _scrubPositionMs = next,
                                      ),
                              onChangeEnd: durationMs <= 0
                                  ? null
                                  : (next) async {
                                      await _controller.seekTo(Duration(
                                        milliseconds: next.round(),
                                      ));
                                      if (_resumeAfterScrub) {
                                        await _controller.play();
                                      }
                                      setState(() => _scrubPositionMs = null);
                                    },
                            ),
                          ),
                        ],
                      );
                    },
                  ),
      ),
    );
  }
}
