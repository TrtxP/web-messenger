import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_messenger/features/chats/widgets/chat_app_bar_title.dart';

void main() {
  Widget buildTitle({DateTime? lastSeenAt, bool isOnline = false}) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(
          title: ChatAppBarTitle(
            chatTitle: 'Alex',
            isContactOnline: isOnline,
            contactLastSeenAt: lastSeenAt,
          ),
        ),
      ),
    );
  }

  testWidgets('shows the last seen time for an offline contact', (tester) async {
    await tester.pumpWidget(buildTitle(
      lastSeenAt: DateTime(2026, 9, 25, 14, 7),
    ));

    expect(find.text('Last seen at 14:07'), findsOneWidget);
  });

  testWidgets('shows Offline when no last seen time is available',
      (tester) async {
    await tester.pumpWidget(buildTitle());

    expect(find.text('Offline'), findsOneWidget);
  });

  testWidgets('shows Online instead of the last seen time for an online contact',
      (tester) async {
    await tester.pumpWidget(buildTitle(
      isOnline: true,
      lastSeenAt: DateTime(2026, 9, 25, 14, 7),
    ));

    expect(find.text('Online'), findsOneWidget);
    expect(find.text('Last seen at 14:07'), findsNothing);
  });
}
