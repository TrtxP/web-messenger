# Flutter Local Notifications
-keep class com.dexterous.flutterlocalnotifications.** { *; }
-dontwarn com.dexterous.flutterlocalnotifications.**

# Firebase Messaging & Core
-keep class io.flutter.plugins.firebase.messaging.** { *; }
-keep class io.flutter.plugins.firebase.core.** { *; }
-keep class com.google.firebase.** { *; }
-dontwarn io.flutter.plugins.firebase.**
-dontwarn com.google.firebase.**

# AndroidX and core
-keepattributes *Annotation*
