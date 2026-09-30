import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_messenger/core/network/api_client.dart';
import 'package:mobile_messenger/features/chats/screens/home_screen.dart';
import 'package:mobile_messenger/features/chats/services/chat_service.dart';

class _FakeApi extends Api {
  _FakeApi({this.isArchived = false});

  bool isArchived;
  final archiveUpdates = <bool>[];

  Map<String, dynamic> get _chat => {
        'id': 'chat-1',
        'isArchived': isArchived,
        'unreadCount': 0,
        'lastMessage': {'content': 'Hello'},
        'partner': {'id': 'user-2', 'username': 'Bob'},
      };

  @override
  Future<List<dynamic>> get(String path) async {
    if (path.startsWith('/chats')) {
      final requestedArchived = path.contains('archived=true');
      return requestedArchived == isArchived ? [_chat] : [];
    }
    return [];
  }

  @override
  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body,
  ) async {
    if (path.endsWith('/archive')) {
      isArchived = body['archived'] == true;
      archiveUpdates.add(isArchived);
    }
    return {'ok': true};
  }
}

class _FakeChatService extends ChatService {
  final deletedChatIds = <String>[];
  final mutedChatUpdates = <Map<String, dynamic>>[];

  @override
  Future<void> deleteChat(String chatId) async {
    deletedChatIds.add(chatId);
  }

  @override
  Future<void> toggleMute(String chatId, bool muted) async {
    mutedChatUpdates.add({'chatId': chatId, 'muted': muted});
  }
}

Future<void> _pumpChatList(
  WidgetTester tester, {
  required _FakeApi api,
  required _FakeChatService chatService,
}) async {
  await tester.pumpWidget(MaterialApp(
    home: HomeScreen(
      user: const {'id': 'user-1'},
      onLogout: () {},
      api: api,
      chatService: chatService,
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  group('Chat swipe delete and long-press actions', () {
    testWidgets('right swipe confirms and deletes the shared chat history',
        (tester) async {
      final api = _FakeApi();
      final chatService = _FakeChatService();
      await _pumpChatList(tester, api: api, chatService: chatService);

      await tester.drag(find.byKey(const Key('chat-1')), const Offset(500, 0));
      await tester.pumpAndSettle();

      expect(find.text('Delete chat?'), findsOneWidget);
      expect(find.textContaining('all messages for both participants'),
          findsOneWidget);
      await tester.tap(find.text('Delete').last);
      await tester.pumpAndSettle();

      expect(chatService.deletedChatIds, ['chat-1']);
      expect(find.text('Bob'), findsNothing);
    });

    testWidgets('canceling right-swipe confirmation keeps the chat',
        (tester) async {
      final api = _FakeApi();
      final chatService = _FakeChatService();
      await _pumpChatList(tester, api: api, chatService: chatService);

      await tester.drag(find.byKey(const Key('chat-1')), const Offset(500, 0));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      expect(find.text('Bob'), findsOneWidget);
      expect(chatService.deletedChatIds, isEmpty);
    });

    testWidgets('holding for 1.5 seconds opens archive and delete actions',
        (tester) async {
      final api = _FakeApi();
      final chatService = _FakeChatService();
      await _pumpChatList(tester, api: api, chatService: chatService);
      final gesture = await tester.startGesture(
        tester.getCenter(find.byKey(const Key('chat-1'))),
      );

      await tester.pump(const Duration(milliseconds: 1499));
      expect(find.text('Archive chat'), findsNothing);
      await tester.pump(const Duration(milliseconds: 1));
      await gesture.up();
      await tester.pumpAndSettle();

      expect(find.text('Archive chat'), findsOneWidget);
      expect(find.text('Delete chat'), findsOneWidget);
      await tester.tap(find.text('Archive chat'));
      await tester.pumpAndSettle();

      expect(api.archiveUpdates, [true]);
      expect(find.text('Bob'), findsNothing);
    });

    testWidgets('holding an archived chat offers and performs unarchive',
        (tester) async {
      final api = _FakeApi(isArchived: true);
      final chatService = _FakeChatService();
      await _pumpChatList(tester, api: api, chatService: chatService);
      await tester.tap(find.byTooltip('Archived chats'));
      await tester.pumpAndSettle();

      final gesture = await tester.startGesture(
        tester.getCenter(find.byKey(const Key('chat-1'))),
      );
      await tester.pump(const Duration(milliseconds: 1500));
      await gesture.up();
      await tester.pumpAndSettle();

      expect(find.text('Unarchive chat'), findsOneWidget);
      await tester.tap(find.text('Unarchive chat'));
      await tester.pumpAndSettle();

      expect(api.archiveUpdates, [false]);
      expect(find.text('Bob'), findsNothing);
    });

    testWidgets(
        'holding a chat offers Mute notifications action and updates mute status',
        (tester) async {
      final api = _FakeApi();
      final chatService = _FakeChatService();
      await _pumpChatList(tester, api: api, chatService: chatService);
      final gesture = await tester.startGesture(
        tester.getCenter(find.byKey(const Key('chat-1'))),
      );

      await tester.pump(const Duration(milliseconds: 1500));
      await gesture.up();
      await tester.pumpAndSettle();

      expect(find.text('Mute notifications'), findsOneWidget);
      await tester.tap(find.text('Mute notifications'));
      await tester.pumpAndSettle();

      expect(chatService.mutedChatUpdates, [
        {'chatId': 'chat-1', 'muted': true}
      ]);
    });
  });
}
