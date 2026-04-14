# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ── React Native ──
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.** { *; }

# ── KikoCall Native Modules ──
-keep class com.kikocall.native_modules.** { *; }
-keep class com.kikocall.MainActivity { *; }
-keep class com.kikocall.MainApplication { *; }

# ── Google Play Services (SMS Retriever / Auth) ──
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ── AndroidX ──
-keep class androidx.core.content.FileProvider { *; }
-keep class androidx.work.** { *; }
-dontwarn androidx.**

# ── OkHttp / Networking ──
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# ── Prevent stripping of MediaCodec / MediaExtractor usage ──
-keep class android.media.** { *; }
