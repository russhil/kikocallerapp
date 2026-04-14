package com.kikocall.native_modules

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.telephony.TelephonyManager
import android.util.Log

/**
 * Receives PHONE_STATE broadcasts to detect when a call ends.
 * When a call finishes (state transitions from OFFHOOK -> IDLE),
 * waits a short delay for the recording file to be finalized on disk,
 * then triggers RecordingScanService to process it via HeadlessJS.
 */
class CallStateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "CallStateReceiver"
        // Delay after call ends to allow the recording file to be fully written
        private const val POST_CALL_DELAY_MS = 12_000L
        // Track previous state to detect OFFHOOK -> IDLE transition
        @Volatile
        @JvmField
        var lastState: Int = TelephonyManager.CALL_STATE_IDLE
        @Volatile
        private var pendingScan = false
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return

        val stateStr = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        val newState = when (stateStr) {
            TelephonyManager.EXTRA_STATE_IDLE -> TelephonyManager.CALL_STATE_IDLE
            TelephonyManager.EXTRA_STATE_RINGING -> TelephonyManager.CALL_STATE_RINGING
            TelephonyManager.EXTRA_STATE_OFFHOOK -> TelephonyManager.CALL_STATE_OFFHOOK
            else -> return
        }

        Log.d(TAG, "Phone state changed: $stateStr (lastState=$lastState, newState=$newState)")

        // Detect call ending: was in a call (OFFHOOK) and now IDLE
        if (lastState == TelephonyManager.CALL_STATE_OFFHOOK && newState == TelephonyManager.CALL_STATE_IDLE) {
            if (!pendingScan) {
                pendingScan = true
                Log.d(TAG, "Call ended. Scheduling recording scan in ${POST_CALL_DELAY_MS}ms...")
                Handler(Looper.getMainLooper()).postDelayed({
                    try {
                        Log.d(TAG, "Triggering RecordingScanService after call ended")
                        RecordingScanService.enqueueWork(context.applicationContext)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to enqueue scan work after call ended", e)
                    } finally {
                        pendingScan = false
                    }
                }, POST_CALL_DELAY_MS)
            }
        }

        lastState = newState
    }
}
