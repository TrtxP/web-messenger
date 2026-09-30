import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/network/api_client.dart';

import '../features/auth/screens/auth_screen.dart';
import '../features/chats/screens/home_screen.dart';

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  Map<String, dynamic>? user;

  @override
  void initState() {
    super.initState();
    restore();
  }

  Future<void> restore() async {
    final raw = (await SharedPreferences.getInstance()).getString('user');
    if (raw != null && mounted) {
      final parsed = jsonDecode(raw) as Map<String, dynamic>;
      Api.token = parsed['token'] as String?;
      setState(() => user = parsed);
    }
  }

  Future<void> handleLogout() async {
    try {
      await Api().delete('/users/fcm-token');
    } catch (_) {}
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('user');
    Api.token = null;
    if (mounted) {
      setState(() => user = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (user == null) {
      return AuthScreen(
        onAuthenticated: (value) => setState(() => user = value),
      );
    }
    return HomeScreen(
      user: user!,
      onLogout: handleLogout,
      promptNotificationPermission: true,
    );
  }
}
