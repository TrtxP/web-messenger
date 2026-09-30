import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/api_constants.dart';

class Api {
  static String? token;

  static Future<void> setToken(String? newToken) async {
    token = newToken;
  }

  Future<String?> getToken() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('user');
      if (raw != null) {
        final data = jsonDecode(raw) as Map<String, dynamic>;
        final t = data['token'] as String?;
        if (t != null && t.isNotEmpty) {
          token = t;
          return t;
        }
      } else {
        token = null;
        return null;
      }
    } catch (_) {}
    return token;
  }

  Future<Map<String, String>> _headers() async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'bypass-tunnel-reminder': 'true',
      'ngrok-skip-browser-warning': 'true',
    };
    final currentToken = await getToken();
    if (currentToken != null && currentToken.isNotEmpty) {
      headers['Authorization'] = 'Bearer $currentToken';
    }
    return headers;
  }

  String _buildUrl(String path) {
    var base = apiUrl.trim();
    if (base.endsWith('/')) {
      base = base.substring(0, base.length - 1);
    }
    var cleanPath = path.trim();
    if (!cleanPath.startsWith('/')) {
      cleanPath = '/$cleanPath';
    }
    if (!base.endsWith('/api') && !cleanPath.startsWith('/api/')) {
      base = '$base/api';
    }
    return '$base$cleanPath';
  }

  String formatUrl(String path) => _buildUrl(path);

  Future<Map<String, dynamic>> post(
      String path, Map<String, dynamic> body) async {
    final headers = await _headers();
    final response = await http.post(
      Uri.parse(_buildUrl(path)),
      headers: headers,
      body: jsonEncode(body),
    );
    final result = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw Exception(result['message'] ?? 'Request failed');
    }
    return result;
  }

  Future<Map<String, dynamic>> put(
      String path, Map<String, dynamic> body) async {
    final headers = await _headers();
    final response = await http.put(
      Uri.parse(_buildUrl(path)),
      headers: headers,
      body: jsonEncode(body),
    );
    final result = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw Exception(result['message'] ?? 'Request failed');
    }
    return result;
  }

  Future<Map<String, dynamic>> delete(String path) async {
    final headers = await _headers();
    final response = await http.delete(
      Uri.parse(_buildUrl(path)),
      headers: headers,
    );
    final result = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw Exception(result['message'] ?? 'Request failed');
    }
    return result;
  }

  Future<List<dynamic>> get(String path) async {
    final headers = await _headers();
    final response =
        await http.get(Uri.parse(_buildUrl(path)), headers: headers);
    if (response.statusCode >= 400) {
      throw Exception('Request failed');
    }
    final decoded = jsonDecode(response.body);
    if (decoded is List) return decoded;
    return [decoded];
  }

  Future<dynamic> request(String path) async {
    final headers = await _headers();
    final response =
        await http.get(Uri.parse(_buildUrl(path)), headers: headers);
    if (response.statusCode >= 400) {
      throw Exception('Request failed');
    }
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> uploadFile(
    String path,
    String fieldName,
    List<int> bytes,
    String filename,
  ) async {
    final uri = Uri.parse(_buildUrl(path));
    final request = http.MultipartRequest('POST', uri);
    request.headers['bypass-tunnel-reminder'] = 'true';
    request.headers['ngrok-skip-browser-warning'] = 'true';

    final currentToken = await getToken();
    if (currentToken != null && currentToken.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $currentToken';
    }

    MediaType? mediaType;
    final lower = filename.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      mediaType = MediaType('image', 'jpeg');
    } else if (lower.endsWith('.png')) {
      mediaType = MediaType('image', 'png');
    } else if (lower.endsWith('.webp')) {
      mediaType = MediaType('image', 'webp');
    } else if (lower.endsWith('.gif')) {
      mediaType = MediaType('image', 'gif');
    } else if (lower.endsWith('.mp4')) {
      mediaType = MediaType('video', 'mp4');
    } else if (lower.endsWith('.mov')) {
      mediaType = MediaType('video', 'quicktime');
    } else if (lower.endsWith('.avi')) {
      mediaType = MediaType('video', 'x-msvideo');
    } else if (lower.endsWith('.m4a')) {
      mediaType = MediaType('audio', 'mp4');
    } else if (lower.endsWith('.aac')) {
      mediaType = MediaType('audio', 'aac');
    } else if (lower.endsWith('.mp3')) {
      mediaType = MediaType('audio', 'mpeg');
    } else if (lower.endsWith('.wav')) {
      mediaType = MediaType('audio', 'wav');
    } else if (lower.endsWith('.ogg')) {
      mediaType = MediaType('audio', 'ogg');
    }

    final multipartFile = http.MultipartFile.fromBytes(
      fieldName,
      bytes,
      filename: filename,
      contentType: mediaType,
    );
    request.files.add(multipartFile);

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);
    final result = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw Exception(result['message'] ?? 'Upload failed');
    }
    return result;
  }
}
