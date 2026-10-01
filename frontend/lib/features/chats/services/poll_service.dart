import '../../../core/network/api_client.dart';

class PollService {
  PollService({Api? api}) : _api = api ?? Api();
  final Api _api;

  Future<Map<String, dynamic>> createPoll(String chatId, String question, List<String> options, {bool isAnonymous = false}) async {
    final res = await _api.post('/chats/$chatId/polls', {'question': question, 'options': options, 'isAnonymous': isAnonymous});
    return res;
  }

  Future<Map<String, dynamic>> getPoll(String pollId) async {
    final res = await _api.get('/polls/$pollId');
    return Map<String, dynamic>.from(res.first as Map);
  }

  Future<Map<String, dynamic>> vote(String pollId, String optionId) async {
    final res = await _api.post('/polls/$pollId/vote', {'optionId': optionId});
    return res;
  }

  Future<Map<String, dynamic>> retractVote(String pollId) async {
    final res = await _api.delete('/polls/$pollId/vote');
    return res;
  }

  Future<Map<String, dynamic>> closePoll(String pollId) async {
    final res = await _api.post('/polls/$pollId/close', {});
    return res;
  }
}
