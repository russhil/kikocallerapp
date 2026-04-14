# KikoCall v1.0.48 — Release Audit

**Generated:** 2026-04-14 17:10
**Build time:** 3m 52s (incremental, cached from 1.0.47 build)
**Supersedes:** v1.0.47 (demo account fix)

## What changed from v1.0.47

**Critical fix — Play Store reviewer demo account now works end-to-end.**

| Component | v1.0.47 behavior | v1.0.48 behavior |
|---|---|---|
| Client `LoginScreen.js` | Faked token `review_token_9619363677_x3a` locally for demo phone | Demo bypass removed — normal backend OTP flow runs |
| Backend `/api/auth/send-otp` | Attempted Gupshup SMS for any number | Short-circuits for `919619363677`, returns 200 without SMS |
| Backend `/api/auth/verify-otp` | Checked `users.otp_code` — rejected `123456` with 401 Invalid OTP | Short-circuits for phone `919619363677` + otp `123456`: upserts demo store/user, mints real `secrets.token_hex(32)`, returns it |
| Authenticated API calls from demo account | **All returned 401 Invalid or expired token** | Real backend-issued token validates normally |

Backend change already deployed on `azureuser@20.80.98.55` at `~/kikocallerapp/main.py`; backup kept at `main.py.bak-20260414-113331`.

Also in this release (carried from v1.0.47, shipped together):
- Customer-name prefix fix: "recording Kashish Patel" → "Kashish Patel"
- PermissionScreen cleanup: no phantom rows, no skip buttons, Caller ID mandatory
- `RECORD_AUDIO` removed from manifest

## Artifacts

| File | Size | SHA-256 |
|---|---|---|
| `KikoCall-v1.0.48-release.apk` | 50 MB | `1bb394a16040101026be267e980416bb6629568661beb19867ae14b8246c61d6` |
| `KikoCall-v1.0.48-release.aab` | 42 MB | `5f6e18963af96bbe4e94bdaa3835caf7069319f41ec42bb677b85aeaa32c3f39` |
| `mapping-v1.0.48.txt` | 19 MB | ProGuard mapping for crash deobfuscation |
| `whatsnew-en-IN.txt` | 355 B | Release notes — English |
| `whatsnew-hi-IN.txt` | 876 B | Release notes — Hindi |

## Package identity

| Field | Value |
|---|---|
| applicationId | `com.kikocall` |
| versionCode | `48` |
| versionName | `1.0.48` |
| minSdk | 24 (Android 7.0) |
| targetSdk | 36 (Android 16 — meets Play Store 2026 requirement ≥35) |
| compileSdk | 36 |
| NDK | 27.1.12297006 |

## Signing

- v2 (APK Signature Scheme v2): **✅ verified**
- Signer: `CN=KikoCall, OU=Dev, O=Kiko Live, C=IN`
- Cert SHA-256: `0dff674a4b8e52d3450a700a413bbad3002a366a7f9ba329f74b4c535aedcfb8`
- Cert SHA-1: `34531b2756248330f89528c526a7745d9d86899e`
- Key: RSA 2048
- Keystore: `android/app/kikocall-upload-2026.keystore`

Identical cert to v1.0.47 (same upload key) — Play Store will accept in-place update.

## Permissions (10 declared + 2 auto-injected)

Unchanged from v1.0.47. See `release-artifacts/v1.0.47/RELEASE-AUDIT.md` for full table.

## Application flags

| Flag | Value | Verdict |
|---|---|---|
| `allowBackup` | `false` | ✅ |
| `usesCleartextTraffic` | `true` | ⚠️ still open (not changed this release) — consider flipping to `false` in a future version |
| `minifyEnabled` (release) | `true` | ✅ |
| `shrinkResources` (release) | `true` | ✅ |

## Demo account regression test (run against live backend)

```
POST /api/auth/send-otp      {"phone":"9619363677"}                → 200 "OTP sent" (no SMS)
POST /api/auth/verify-otp    {"phone":"9619363677","otp":"123456"} → 200 + 64-hex token
GET  /api/auth/me            Bearer <that-token>                    → 200 {shop_name: "Kiko Demo Store", ...}
POST /api/auth/verify-otp    {"phone":"9619363677","otp":"000000"} → 401 "Invalid OTP"  (security preserved)
```

All four results confirmed live on 2026-04-14 after backend restart.

## Pre-upload checklist

- [ ] Sideload APK on a physical device, log in as `9619363677 / 123456`, confirm you reach Home screen
- [ ] Record a test call or process an existing recording, verify it transcribes (no more 401)
- [ ] Upload `KikoCall-v1.0.48-release.aab` to Play Console → Internal/Closed/Open track
- [ ] Upload `mapping-v1.0.48.txt` for ProGuard deobfuscation
- [ ] Paste `whatsnew-en-IN.txt` into "What's new" (English India)
- [ ] Paste `whatsnew-hi-IN.txt` into "What's new" (Hindi India)
- [ ] In Play Console → App access → "Login required" → provide demo credentials:
  - Username: `9619363677`
  - Password: `123456`
  - Note: "OTP-based login, 123456 is the hardcoded OTP for this demo account"
- [ ] Decide on `usesCleartextTraffic` for next release (optional hardening)
