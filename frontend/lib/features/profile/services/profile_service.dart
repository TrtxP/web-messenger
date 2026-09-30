import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';

class ProfileService {
  ProfileService({Api? api}) : _api = api ?? Api();

  final Api _api;

  Future<Map<String, dynamic>?> fetchProfile() async {
    final res = await _api.request('/users/me');
    if (res is Map<String, dynamic>) {
      return res;
    }
    return null;
  }

  Future<Map<String, dynamic>> updateProfile(
    String username,
    String about,
  ) async {
    final updated = await _api.put('/users/me', {
      'username': username.trim(),
      'about': about.trim(),
    });

    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('user');
      if (raw != null) {
        final data = jsonDecode(raw) as Map<String, dynamic>;
        data['user'] = updated;
        await prefs.setString('user', jsonEncode(data));
      }
    } catch (_) {}

    return updated;
  }

  Future<Map<String, dynamic>> uploadAvatar(
    List<int> bytes,
    String filename,
  ) async {
    final res = await _api.uploadFile(
      '/users/me/avatar',
      'avatar',
      bytes,
      filename,
    );

    final avatarUrl = res['avatarUrl'] as String?;
    if (avatarUrl != null) {
      try {
        final prefs = await SharedPreferences.getInstance();
        final raw = prefs.getString('user');
        if (raw != null) {
          final data = jsonDecode(raw) as Map<String, dynamic>;
          if (data['user'] is Map<String, dynamic>) {
            (data['user'] as Map<String, dynamic>)['avatarUrl'] = avatarUrl;
            await prefs.setString('user', jsonEncode(data));
          }
        }
      } catch (_) {}
    }

    return res;
  }

  String? resolveAvatarUrl(String? url) {
    if (url == null || url.isEmpty) return null;
    String fullUrl = url.startsWith('http') ? url : _api.formatUrl(url);
    if (Api.token != null &&
        Api.token!.isNotEmpty &&
        !fullUrl.contains('token=')) {
      fullUrl +=
          fullUrl.contains('?') ? '&token=${Api.token}' : '?token=${Api.token}';
    }
    return fullUrl;
  }

  Future<bool> blockUser(String userId) async {
    try {
      await _api.post('/users/$userId/block', {});
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> unblockUser(String userId) async {
    try {
      await _api.delete('/users/$userId/block');
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<List<String>> getBlockedUserIds() async {
    try {
      final res = await _api.request('/users/blocked');
      if (res is List) {
        return res.map((e) => e.toString()).toList();
      }
    } catch (_) {}
    return [];
  }

  Future<List<Map<String, dynamic>>> getBlockedUsers() async {
    try {
      final res = await _api.request('/users/blocked-list');
      if (res is List) {
        return res
            .whereType<Map<dynamic, dynamic>>()
            .map((e) => e as Map<String, dynamic>)
            .toList();
      }
    } catch (_) {}
    return [];
  }
}
