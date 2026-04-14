# KikoCallRN Core Feature Restoration: Walkthrough

I have successfully completed the stabilization and restoration of the KikoCallRN logic to match the v30 functional requirements. Below is a detailed breakdown of the implemented changes:

## 1. Native Android Improvements
> [!NOTE]
> Addressed duplicate triggers and notification routing issues deeply embedded in the Android Native layer.
- **CallLog Debouncing (`CallLogObserver.kt`)**: Implemented a 5-second delayed debounce, preventing rapid back-to-back triggers when Android incrementally flushes its CallLog DB or when large audio files are still being saved to disk.
- **Notification Reliability (`RecordingMonitorModule.kt`)**: Upgraded the `PendingIntent` creation to cleanly use `getLaunchIntentForPackage`. Clicking the processing/success notification now reliably opens (or resumes) the `MainActivity` from the background.

## 2. Background Sync Engine Overhaul
> [!IMPORTANT]
> A major refactor of `BackgroundSync.js` has structurally changed how recordings are classified, queued, and uploaded.

- **Queue Lock System**: Implemented an async lock (`isBgSyncing` in AsyncStorage) that guarantees only one background process instance processes the recordings at a given time preventing race conditions.
- **Strict Deduplication**: Built a unique deduplication key constraint `(phone_number + audio_last_modified)` to prevent an audio file belonging to a specific call timestamp from being parsed multiple times resulting in duplicate orders.
- **Strict Incoming Calls Only**: Extracted the CallLog direction and enforce a strict ignore policy for Outgoing and Missed calls.
- **Multipart Chunk Upload (`multipart/form-data`)**: Migrated away from purely Base64 strings. `fetch` with `FormData` is now the primary mechanism for chunked streaming to the Gemini Transcription backend (`/api/transcribe-gemini`). Included a graceful backend support fallback method utilizing PCM decoding.
- **Retry Mechanism**: Introduced `fetchWithRetry()` wrapping the classification, transcription, and order generation API calls. It retries endpoints up to 3 times with exponential backoff on server errors/timeouts.

## 3. Order UI Formatting
- **Standardized Sequence ID**: The Order UI and logic now dynamically generate human-readable sequence IDs formatted as `YYYYMMDD-<seq>`. (e.g., `20260330-001`). This is synced incrementally per day using AsyncStorage.
- **WhatsApp Refinement**: The customer's mobile number was integrated inline into the WhatsApp generated text template across UI triggers.

## Next Steps for Verification
To compile and test these critical functionality improvements:
1. Re-build the Android layer to bake in the Kotlin adjustments:
   ```bash
   cd android && ./gradlew clean assembleRelease
   ```
2. Verify incoming calls correctly process sequentially, ignoring duplicate background events.
3. Verify that the order populates correctly after processing via `multipart/form-data`.
