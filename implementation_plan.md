# Reconstruct Fully Functional App (Equivalent to v30)

This plan outlines the specific code changes required to stabilize the KikoCallRN app (v14 codebase) and restore the critical functionality present in the v30 APK, matching the requested core requirements without breaking existing stable features.

## User Review Required

> [!IMPORTANT]
> - **API Multipart Upload**: The current implementation uses memory-intensive Base64 encoding for audio upload to `/api/transcribe-gemini`. The plan will transition this to a true `multipart/form-data` upload (to a presumed `/api/upload-audio` or equivalent endpoint) if the backend supports it, or adapt the existing transcription API to accept multipart data. Please confirm if the backend endpoint for transcription supports multipart form data, and what the key names should be (e.g., `audio_file`).
> - **Unique Order ID Sequence**: We will use `YYYYMMDD-<short-uuid>` or `YYYYMMDD-<timestamp-based-sequence>` to ensure cross-app consistency without needing a centralized backend sequence counter.

## Proposed Changes

---

### Call & Recording Processing Logic (Native Android)

#### [MODIFY] android/app/src/main/java/com/kikocall/native_modules/CallLogObserver.kt
- Delay the trigger slightly or check for ongoing call state to **detect call end reliably**.
- Ignore the trigger if it's explicitly an outgoing call (we can check the latest call log entry immediately before triggering the service).

#### [MODIFY] android/app/src/main/java/com/kikocall/native_modules/RecordingMonitorModule.kt
- Ensure we verify the file is fully written (e.g., check if `file.length()` remains constant over a short interval or ensure the file is not locked).
- Keep the scan functionality robust.

---

### Notification Handling (Native Android)

#### [MODIFY] android/app/src/main/java/com/kikocall/native_modules/RecordingMonitorModule.kt
- Fix the **Notification click issue** by ensuring the `PendingIntent` properly targets the `MainActivity` with the correct flags (e.g., `FLAG_ACTIVITY_SINGLE_TOP` or clear top), and passes extra data if necessary to route to the correct screen.

---

### Background Processing & API Reliability Layer (React Native)

#### [MODIFY] src/utils/BackgroundSync.js
- Implement a **queue-based processing system**. Ensure only one recording is processed at a time by using a robust lock in `AsyncStorage` or preventing overlapping executions of the Headless JS Task.
- **Audio Upload (Multipart)**: Refactor the transcription trigger to use `fetch` with `FormData` to upload the raw file (via `file://` URI) instead of decoding it all into Base64 in memory. This handles large file sizes safely.
- **API Reliability Layer (CRITICAL)**: Implement a wrapper for API calls with a retry mechanism (3 retries with exponential/fixed delay) that catches failures gracefully to prevent app crashes and logs them.
- **Order Creation Flow**: 
  - Ensure order is created ONLY after transcription is explicitly successful.
  - Implement a check to prevent duplicate order creation using a unique key derived from `phone_number + call_timestamp`.

#### [MODIFY] src/api/geminiApi.js
- Add retry logic for network requests (3 retries).
- Adapt the functions to support the new multipart upload requirement.

---

### App UI & Feature Specifics (React Native)

#### [MODIFY] src/screens/RecordingsScreen.js
- Sync the logic with `BackgroundSync.js` to use the same queued, reliable multi-part upload approach for manual triggers.

#### [MODIFY] src/utils/whatsappHelper.js
- Update the **WhatsApp Integration** to include the customer phone number in the sent message explicitly, ensuring the formatting exactly matches the desired business requirements.

#### [MODIFY] src/screens/HomeScreen.js & src/utils/BackgroundSync.js
- Implement the **Unique Order ID System** using the format `YYYYMMDD-<sequence>`, ensuring it is generated consistently when a new order is constructed.

## Open Questions

> [!WARNING]
> 1. **Multipart Upload Endpoint**: Does the backend endpoint `/api/transcribe-gemini` accept `multipart/form-data`, or is there a different URL for multipart uploads? What are the expected field names (e.g., `audio_file`, `language_code`)?
> 2. **Sequence Number**: Should the `<sequence>` in `YYYYMMDD-<sequence>` be a local incrementing counter stored in `AsyncStorage`, or a random 4-digit number like the current implementation (which is `YYYYMMDD-XXXX`)?

## Verification Plan

### Automated/Manual Verification
- Produce a mock incoming call and verify that a recording triggers the pipeline.
- Ensure the background sync attempts transcription via multipart upload.
- Verify the API retries by simulating poor network conditions.
- Tap the generated notification to verify it opens the app successfully.
- Review duplicate protection by executing the job twice for the same recording/call timestamp.
