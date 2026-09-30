import 'package:flutter/material.dart';
import 'app/app.dart';

import 'core/services/notification_service.dart';

export 'app/app.dart';
export 'app/session_gate.dart';
export 'core/constants/api_constants.dart';
export 'core/network/api_client.dart';
export 'features/auth/screens/auth_screen.dart';
export 'features/chats/screens/chat_screen.dart';
export 'features/chats/screens/home_screen.dart';
export 'features/search/delegates/user_search_delegate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await NotificationService().initialize();
  runApp(const MessengerApp());
}
