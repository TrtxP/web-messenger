import '../../../core/network/api_client.dart';

class GroupService {
  GroupService({Api? api}) : _api = api ?? Api();
  final Api _api;

  Future<Map<String, dynamic>> createGroup(
      String name, List<String> memberIds) async {
    return _api.post('/groups', {'name': name, 'memberIds': memberIds});
  }

  Future<Map<String, dynamic>> getGroupInfo(String groupId) async {
    final res = await _api.get('/groups/$groupId');
    return Map<String, dynamic>.from(res.first as Map);
  }

  Future<List<dynamic>> inviteToGroup(
      String groupId, List<String> userIds) async {
    final res =
        await _api.post('/groups/$groupId/invite', {'userIds': userIds});
    final dynamic list = res['invitations'] ?? res['data'] ?? [];
    if (list is List) return list;
    return [];
  }

  Future<List<dynamic>> getGroupPendingInvitations(String groupId) async {
    try {
      final res = await _api.get('/groups/$groupId/invitations');
      return res;
    } catch (_) {
      return [];
    }
  }

  Future<void> leaveGroup(String groupId) async {
    await _api.delete('/groups/$groupId/members/me');
  }

  Future<void> removeMember(String groupId, String userId) async {
    await _api.delete('/groups/$groupId/members/$userId');
  }

  Future<List<dynamic>> getPendingGroupInvitations() async {
    return _api.get('/groups/invitations/pending');
  }

  Future<void> acceptGroupInvitation(String invitationId) async {
    await _api.post('/groups/invitations/$invitationId/accept', {});
  }

  Future<void> declineGroupInvitation(String invitationId) async {
    await _api.post('/groups/invitations/$invitationId/decline', {});
  }
}
