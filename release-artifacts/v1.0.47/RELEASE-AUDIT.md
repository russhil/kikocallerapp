# KikoCall v1.0.47 — Release Audit

**Generated:** 2026-04-14 14:14
**Build time:** 2m 47s (incremental, cached from 1.0.46 build)

## Artifacts

| File | Size | SHA-256 |
|---|---|---|
| `KikoCall-v1.0.47-release.apk` | 50 MB | `e0b228aae84671ee8e2bcc7176db43b46205465e357cb28bdfd7142fe10a0f75` |
| `KikoCall-v1.0.47-release.aab` | 42 MB | `e81e8ce6a6ac20931ed94bbed25619e6dc53da1dfe09e48518b20e6ec6a66834` |
| `mapping-v1.0.47.txt` | 19 MB | (upload to Play Console for stack trace deobfuscation) |
| `whatsnew-en-IN.txt` | 328 B | Release notes — English |
| `whatsnew-hi-IN.txt` | 746 B | Release notes — Hindi |

## Package identity

| Field | Value |
|---|---|
| applicationId | `com.kikocall` |
| versionCode | `47` |
| versionName | `1.0.47` |
| minSdk | 24 (Android 7.0) |
| targetSdk | 36 (Android 16 — meets Play Store 2026 requirement ≥35) |
| compileSdk | 36 |
| NDK | 27.1.12297006 |

## Signing

- v1 (JAR): ❌ disabled
- **v2 (APK Signature Scheme v2): ✅ verified**
- v3: ❌ not enabled (nice-to-have, not blocking)
- Signer: `CN=KikoCall, OU=Dev, O=Kiko Live, C=IN`
- Cert SHA-256: `0dff674a4b8e52d3450a700a413bbad3002a366a7f9ba329f74b4c535aedcfb8`
- Cert SHA-1: `34531b2756248330f89528c526a7745d9d86899e`
- Key: RSA 2048
- Keystore: `android/app/kikocall-upload-2026.keystore`

**Action:** confirm this SHA-256 matches your Play Console upload key. If mismatch → Play Store rejects.

## Permissions (10 declared + 2 auto-injected by build)

| Permission | Scope | Purpose |
|---|---|---|
| `INTERNET` | normal | backend API |
| `READ_EXTERNAL_STORAGE` | maxSdk=32 | legacy pre-Android 13 file access |
| `READ_MEDIA_AUDIO` | runtime | scan `.m4a` recordings (Android 13+) |
| `POST_NOTIFICATIONS` | runtime | processing notifications (Android 13+) |
| `READ_PHONE_STATE` | runtime | detect call start/end |
| `READ_CONTACTS` | runtime | match caller names |
| `FOREGROUND_SERVICE` | normal | persistent monitor service |
| `FOREGROUND_SERVICE_SPECIAL_USE` | normal | specialUse FGS subtype (Android 14+) |
| `RECEIVE_BOOT_COMPLETED` | normal | restart monitoring after reboot |
| `WAKE_LOCK` | normal | keep service alive |
| `ACCESS_NETWORK_STATE` | auto | injected by play-services dependencies |
| `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | auto | signature, injected by Android 14 SDK |

**Removed this release:** `RECORD_AUDIO` (never used — app reads dialer-produced files, does not record).
**Never declared (Play Store hygiene):** `MANAGE_EXTERNAL_STORAGE`, `READ_CALL_LOG`, `CALL_PHONE`, `MANAGE_OWN_CALLS`, `ANSWER_PHONE_CALLS`.

## Application flags

| Flag | Value | Verdict |
|---|---|---|
| `allowBackup` | `false` | ✅ good (call data shouldn't auto-backup) |
| `usesCleartextTraffic` | `true` | ⚠️ unnecessary — BASE_URL is HTTPS; plaintext is a silent fallback nobody needs. Recommend setting to `false` and adding `networkSecurityConfig` if any local-dev host requires cleartext. |
| `minifyEnabled` (release) | `true` | ✅ good |
| `shrinkResources` (release) | `true` | ✅ good |
| Proguard rules | `proguard-android.txt` + `proguard-rules.pro` | ✅ |
| `debuggable` (release) | (default) `false` | ✅ |

## Services / receivers

| Component | Exported | Purpose |
|---|---|---|
| `MainActivity` | `true` | launcher (required) |
| `RecordingScanService` | `false` | foreground scanner |
| `BackgroundMonitorService` | `false` | persistent call monitor |
| `KikoCallScreeningService` | `true` (BIND_SCREENING_SERVICE) | required for `ROLE_CALL_SCREENING` binding |
| `SMSReceiver` | `true` (SEND permission-protected) | Google Play SMS Retriever API |
| `BootReceiver` | `true` | boot-completed autostart |
| `CallStateReceiver` | `true` | phone-state broadcasts |

All exports are justified (launcher + system-bound services/receivers). No unprotected exports.

## Changes in this release

1. **Customer name parsing fix** (`src/screens/RecordingsScreen.js:434`) — added `recording|record|rec|call` to the filename-token blacklist. Recordings named "Call recording <Name>..." previously displayed as "recording <Name>"; now display as "<Name>".
2. **PermissionScreen cleanup** (`src/screens/PermissionScreen.js`) — removed dead UI rows for permissions the app doesn't actually request (All Files Access, RECORD_AUDIO). Caller ID App row retained and mandatory (no skip). Philosophy: every row is required and every required permission has a row.
3. **Manifest** — removed unused `RECORD_AUDIO` declaration.
4. **Version bump** — `1.0.46 → 1.0.47` (codeCode `46 → 47`).

## Pre-upload checklist

- [ ] Confirm upload-key SHA-256 matches Play Console (see Signing section above)
- [ ] Upload `KikoCall-v1.0.47-release.aab` to Play Console → Internal/Closed/Open track
- [ ] Upload `mapping-v1.0.47.txt` for ProGuard deobfuscation of crash reports
- [ ] Paste contents of `whatsnew-en-IN.txt` into "What's new" → English (India)
- [ ] Paste contents of `whatsnew-hi-IN.txt` into "What's new" → Hindi (India)
- [ ] Decide on `usesCleartextTraffic` flag (see Application flags, audit warning)
- [ ] Smoke-test APK on a real device before promoting the AAB:
  ```
  adb install /Users/russhil/Desktop/appkiko/kikocallerapp/release-artifacts/v1.0.47/KikoCall-v1.0.47-release.apk
  ```
  Verify: permission screen shows only 5 rows (incl. Caller ID), no "recording" prefix on new recording names, transcription works after fresh login.

## Notes

- AAB is 42 MB vs 50 MB APK because Play Store splits it per-ABI at install time. Typical per-device download ≈ 15–20 MB.
- Build succeeded only with JDK 17 (`/opt/homebrew/opt/openjdk@17`); JDK 25 (system default) fails with cryptic "Error resolving plugin com.facebook.react.settings > 25.0.2".
- First clean build failed with CMake codegen missing `react_codegen_rnasyncstorage` target; this is a known `newArchEnabled=true` ordering issue — retry without `clean` succeeds.
