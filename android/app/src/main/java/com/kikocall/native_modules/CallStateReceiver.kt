package com.kikocall.native_modules

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log

/**
 * Manifest-declared PHONE_STATE receiver. Acts as a safety net on aggressive OEMs
 * (Xiaomi, Oppo, Vivo, etc.) where the BackgroundMonitorService's KikoCallStateTracker
 * may be killed.
 *
 * Primary lifecycle tracking is owned by KikoCallStateTracker (inside BackgroundMonitorService).
 * This receiver only feeds CallEventStore as a backup when the foreground service is down.
 *
 * On Android ≤11 (API ≤30) the broadcast carries EXTRA_INCOMING_NUMBER; on Android 12+
 * the value is redacted and we rely on KikoCallScreeningService instead.
 */
class CallStateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "CallStateReceiver"
        @Volatile
        @JvmField
        var lastState: Int = TelephonyManager.CALL_STATE_IDLE
    }

    @Suppress("DEPRECATION")
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

        // Only feed the store if the foreground service isn't running (otherwise
        // KikoCallStateTracker is already handling this).
        if (!BackgroundMonitorService.isRunning) {
            val appCtx = context.applicationContext
            val now = System.currentTimeMillis()
            when (newState) {
                TelephonyManager.CALL_STATE_RINGING -> {
                    val legacyNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
                    if (!legacyNumber.isNullOrBlank()) {
                        CallEventStore.beginIncoming(appCtx, legacyNumber, now, "PHONE_STATE_RECEIVER")
                    } else {
                        CallEventStore.beginIncoming(appCtx, null, now, "PHONE_STATE_RECEIVER")
                    }
                }
                TelephonyManager.CALL_STATE_OFFHOOK -> {
                    CallEventStore.markAnswered(appCtx, now)
                }
                TelephonyManager.CALL_STATE_IDLE -> {
                    if (lastState == TelephonyManager.CALL_STATE_OFFHOOK ||
                        lastState == TelephonyManager.CALL_STATE_RINGING
                    ) {
                        CallEventStore.markEnded(appCtx, now)
                    }
                }
            }
        }

        lastState = newState
    }
}
