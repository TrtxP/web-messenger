import 'package:flutter/material.dart';

class ConnectivityBanner extends StatelessWidget {
  final bool isOffline;
  const ConnectivityBanner({super.key, required this.isOffline});

  @override
  Widget build(BuildContext context) {
    if (!isOffline) return const SizedBox.shrink();
    return MaterialBanner(
      content: const Text('Offline — Reconnecting...'),
      backgroundColor: Colors.orange.shade100,
      leading: const Icon(Icons.wifi_off, color: Colors.orange),
      actions: const [SizedBox.shrink()],
    );
  }
}
