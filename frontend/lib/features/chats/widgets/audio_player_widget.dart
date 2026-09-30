import 'dart:async';
import 'package:flutter/material.dart';
import 'package:audioplayers/audioplayers.dart';

class AudioPlayerWidget extends StatefulWidget {
  const AudioPlayerWidget({
    super.key,
    required this.durationSeconds,
    this.audioUrl,
  });

  final int durationSeconds;
  final String? audioUrl;

  @override
  State<AudioPlayerWidget> createState() => _AudioPlayerWidgetState();
}

class _AudioPlayerWidgetState extends State<AudioPlayerWidget> {
  AudioPlayer? _player;
  bool isPlaying = false;
  double speed = 1.0;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  StreamSubscription? _stateSub;
  StreamSubscription? _posSub;
  StreamSubscription? _durSub;
  StreamSubscription? _completeSub;
  Timer? _simulatedTimer;

  @override
  void initState() {
    super.initState();
    _duration = Duration(
      seconds: widget.durationSeconds > 0 ? widget.durationSeconds : 1,
    );
    try {
      _player = AudioPlayer();
      unawaited(_configureAudio());
      _stateSub = _player!.onPlayerStateChanged.listen((state) {
        if (mounted) {
          setState(() {
            isPlaying = state == PlayerState.playing;
          });
        }
      });
      _posSub = _player!.onPositionChanged.listen((pos) {
        if (mounted) {
          setState(() {
            _position = pos;
          });
        }
      });
      _durSub = _player!.onDurationChanged.listen((dur) {
        if (mounted && dur > Duration.zero) {
          setState(() {
            _duration = dur;
          });
        }
      });
      _completeSub = _player!.onPlayerComplete.listen((_) {
        if (mounted) {
          setState(() {
            isPlaying = false;
            _position = Duration.zero;
          });
        }
      });
    } catch (_) {}
  }

  Future<void> _configureAudio() async {
    try {
      await _player?.setAudioContext(
        AudioContext(
          android: const AudioContextAndroid(
            isSpeakerphoneOn: true,
            contentType: AndroidContentType.speech,
            usageType: AndroidUsageType.media,
            audioFocus: AndroidAudioFocus.gain,
            stayAwake: true,
          ),
          iOS: AudioContextIOS(category: AVAudioSessionCategory.playback),
        ),
      );
      await _player?.setVolume(1.0);
    } catch (_) {}
  }

  @override
  void dispose() {
    _simulatedTimer?.cancel();
    _stateSub?.cancel();
    _posSub?.cancel();
    _durSub?.cancel();
    _completeSub?.cancel();
    _player?.dispose();
    super.dispose();
  }

  Future<void> _togglePlayPause() async {
    final hasUrl = widget.audioUrl != null && widget.audioUrl!.isNotEmpty;
    if (hasUrl && _player != null) {
      try {
        await _configureAudio();
        if (isPlaying) {
          await _player!.pause();
        } else {
          if (_player!.state == PlayerState.paused) {
            await _player!.resume();
          } else {
            await _player!.play(UrlSource(widget.audioUrl!));
          }
        }
        return;
      } catch (_) {}
    }

    if (isPlaying) {
      _simulatedTimer?.cancel();
      setState(() => isPlaying = false);
    } else {
      if (_position >= _duration) {
        _position = Duration.zero;
      }
      setState(() => isPlaying = true);
      _simulatedTimer?.cancel();
      _simulatedTimer =
          Timer.periodic(const Duration(milliseconds: 200), (timer) {
        if (!mounted) {
          timer.cancel();
          return;
        }
        final nextMs = _position.inMilliseconds + (200 * speed).toInt();
        if (nextMs >= _duration.inMilliseconds) {
          timer.cancel();
          setState(() {
            _position = _duration;
            isPlaying = false;
          });
        } else {
          setState(() {
            _position = Duration(milliseconds: nextMs);
          });
        }
      });
    }
  }

  Future<void> _changeSpeed() async {
    double newSpeed;
    if (speed == 1.0) {
      newSpeed = 1.5;
    } else if (speed == 1.5) {
      newSpeed = 2.0;
    } else {
      newSpeed = 1.0;
    }
    setState(() => speed = newSpeed);
    try {
      await _player?.setPlaybackRate(newSpeed);
    } catch (_) {}
  }

  Future<void> _seek(double ratio) async {
    final targetMs = (_duration.inMilliseconds * ratio).toInt();
    final target = Duration(milliseconds: targetMs);
    setState(() => _position = target);
    try {
      await _player?.seek(target);
    } catch (_) {}
  }

  String _formatDuration(Duration d) {
    final m = d.inMinutes.remainder(60).toString();
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final progress = _duration.inMilliseconds > 0
        ? (_position.inMilliseconds / _duration.inMilliseconds).clamp(0.0, 1.0)
        : 0.0;

    return Card(
      elevation: 0,
      color: Colors.transparent,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            key: const Key('audio_play_pause_button'),
            icon: Icon(isPlaying ? Icons.pause : Icons.play_arrow),
            onPressed: _togglePlayPause,
          ),
          SizedBox(
            width: 120,
            child: Slider(
              value: progress,
              onChanged: _seek,
            ),
          ),
          Text(
            '${_formatDuration(_position)} / ${_formatDuration(_duration)}',
            style: const TextStyle(fontSize: 12),
          ),
          TextButton(
            key: const Key('audio_speed_button'),
            onPressed: _changeSpeed,
            child: Text('${speed}x', style: const TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
