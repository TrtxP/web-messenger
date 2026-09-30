import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';

class AuthService {
  AuthService({Api? api}) : _api = api ?? Api();

  final Api _api;

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await _api.post('/auth/login', {
      'email': email.trim(),
      'password': password,
    });
    return res;
  }

  Future<Map<String, dynamic>> register(
    String email,
    String password,
    String username,
  ) async {
    final res = await _api.post('/auth/register', {
      'email': email.trim(),
      'password': password,
      'username': username.trim(),
    });
    return res;
  }

  Future<Map<String, dynamic>> verifyEmail(String email, String code) async {
    final res = await _api.post('/auth/verify-email', {
      'email': email.trim(),
      'code': code.trim(),
    });
    return res;
  }

  Future<void> forgotPassword(String email) async {
    await _api.post('/auth/forgot-password', {
      'email': email.trim(),
    });
  }

  Future<void> resetPassword(
    String email,
    String code,
    String newPassword,
  ) async {
    await _api.post('/auth/reset-password', {
      'email': email.trim(),
      'code': code.trim(),
      'newPassword': newPassword,
    });
  }

  Future<void> resendVerification(String email) async {
    await _api.post('/auth/resend-verification', {
      'email': email.trim(),
    });
  }

  Future<void> saveSession(Map<String, dynamic> userPayload) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user', jsonEncode(userPayload));
    Api.token = userPayload['token'] as String?;
  }
}
