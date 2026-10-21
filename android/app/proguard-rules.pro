# ProGuard / R8 Rules for LifePlanner Android

# React Native & Hermes
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
-keep class com.facebook.react.bridge.** { *; }

# Custom Native Kotlin Modules
-keep class com.lifeplanner.** { *; }
-keepclassmembers class com.lifeplanner.** {
    public <methods>;
}

# @op-engineering/op-sqlite JNI bindings
-keep class com.op.sqlite.** { *; }
-keep class com.opengineering.sqlite.** { *; }
-keepclassmembers class * {
    native <methods>;
}

# Notifee Core & Background Receivers
-keep class app.notifee.** { *; }
-dontwarn app.notifee.**

# React Native & Common Third-Party Libraries
-dontwarn com.facebook.react.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
