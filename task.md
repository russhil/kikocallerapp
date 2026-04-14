# KikoCallRN Restoration Tasks

- [x] **1. Native Android Stability**
  - [x] Update `CallLogObserver.kt` for reliable call end and trigger debouncing.
  - [x] Update `RecordingMonitorModule.kt` for correct notification clicks (`MainActivity` intent flags).

- [x] **2. Background Sync Engine (`BackgroundSync.js`)**
  - [x] Implement file size stability check (wait before processing).
  - [x] Implement queue/processing lock via `AsyncStorage` to ensure 1 item processes at a time.
  - [x] Discard Outgoing calls strictly.
  - [x] Implement `fetchWithRetry` wrapper (3 attempts with delay).
  - [x] Transition Transcription API to `multipart/form-data` upload instead of Base64 strings.
  - [x] Prevent duplicate orders (`phone_number + timestamp` duplicate key check).

- [x] **3. Order Sequence (`YYYYMMDD-<seq>`)**
  - [x] Implement daily incrementing sequence counter in `AsyncStorage`.
  - [x] Use format globally (`HomeScreen.js`, `RecordingsScreen.js`, `BackgroundSync.js`).

- [x] **4. WhatsApp Formatting Updates**
  - [x] Include customer phone number securely in the structured template (`whatsappHelper.js`).

- [x] **5. `RecordingsScreen.js` Alignment**
  - [x] Replicate the new upload logic for manual transcription triggers.
