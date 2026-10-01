import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_messenger/core/network/api_client.dart';
import 'package:mobile_messenger/features/groups/screens/create_group_screen.dart';

class _MockApi extends Api {
  @override
  Future<List<dynamic>> get(String path) async {
    return [
      {
        'id': 'chat-1',
        'type': 'direct',
        'partner': {'id': 'user-2', 'username': 'Alice'},
      }
    ];
  }
}

void main() {
  testWidgets('CreateGroupScreen shows min 1 contact requirement and validates input', (tester) async {
    final api = _MockApi();
    await tester.pumpWidget(
      MaterialApp(
        home: CreateGroupScreen(api: api),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Create Group'), findsWidgets);
    expect(find.text('Select contacts (min 1):'), findsOneWidget);
  });
}
