import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_messenger/core/auth_validator.dart';

void main() {
  test('accepts a strong password', () {
    expect(isStrongPassword('Strong!123'), isTrue);
  });

  test('rejects a weak password', () {
    expect(isStrongPassword('weak'), isFalse);
  });
}
