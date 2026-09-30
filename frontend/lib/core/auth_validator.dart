bool isStrongPassword(String value) {
  return value.length >= 8 &&
      RegExp(r'[a-z]').hasMatch(value) &&
      RegExp(r'[A-Z]').hasMatch(value) &&
      RegExp(r'[0-9]').hasMatch(value) &&
      RegExp(r'[^A-Za-z0-9]').hasMatch(value);
}
