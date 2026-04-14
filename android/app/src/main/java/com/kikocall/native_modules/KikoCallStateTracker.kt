package com.kikocall.native_modules

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Unified call state tracker: uses TelephonyCallback on Android 12+ and
 * PhoneStateListener on Android 7-11. Replaces the CallLogObserver + CallLog
 * query approach for detecting call lifecycle events.
 *
 * Captures state transitions to CallEventStore and triggers the post-call
 * recording scan 12 seconds after IDLE (to let the OS finalize the recording file).
 */
class KikoCallStateTracker(private val appContext: Context) {

    companion object {
        private const val TAG = "KikoCallStateTracker"
        private const val POST_CALL_SCAN_DELAY_MS = 12_000L
    }

    private val tm = appContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var lastState: Int = TelephonyManager.CALL_STATE_IDLE

    @Volatile
    private var pendingScan = false

    private var telephonyCallback31: TelephonyCallback? = null
    private var phoneStateListener: PhoneStateListener? = null
    private var registered = false

    fun register() {
        if (registered) return
        if (!hasReadPhoneStatePermission()) {
            Log.w(TAG, "READ_PHONE_STATE not granted; skipping register")
            return
        }
        CallEventStore.init(appContext)

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                    override fun onCallStateChanged(state: Int) {
                        handleStateChange(state, null)
                    }
                }
                telephonyCallback31 = cb
                tm.registerTelephonyCallback(executor, cb)
                Log.d(TAG, "Registered TelephonyCallback (API 31+)")
            } else {
                @Suppress("DEPRECATION")
                val listener = object : PhoneStateListener() {
                    @Suppress("DEPRECATION")
                    override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                        handleStateChange(state, phoneNumber)
                    }
                }
                phoneStateListener = listener
                @Suppress("DEPRECATION")
                tm.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
                Log.d(TAG, "Registered PhoneStateListener (API <31)")
            }
            registered = true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register call state listener", e)
        }
    }

    fun unregister() {
        if (!registered) return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                telephonyCallback31?.let { tm.unregisterTelephonyCallback(it) }
                telephonyCallback31 = null
            } else {
                @Suppress("DEPRECATION")
                phoneStateListener?.let { tm.listen(it, PhoneStateListener.LISTEN_NONE) }
                phoneStateListener = null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to unregister call state listener", e)
        }
        try {
            executor.shutdown()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to shutdown executor", e)
        }
        registered = false
    }

    @SuppressLint("MissingPermission")
    private fun handleStateChange(newState: Int, legacyIncomingNumber: String?) {
        val now = System.currentTimeMillis()
        Log.d(TAG, "handleStateChange: newState=$newState lastState=$lastState legacyNumber=$legacyIncomingNumber")

        when (newState) {
            TelephonyManager.CALL_STATE_RINGING -> {
                // Android ≤11 broadcasts the incoming number via PhoneStateListener.
                // On Android 12+ this is always null; we rely on CallScreeningService instead.
                if (!legacyIncomingNumber.isNullOrBlank()) {
                    if (!RoleUtil.hasScreeningRole(appContext)) {
                        CallEventStore.beginIncoming(
                            appContext,
                            legacyIncomingNumber,
                            now,
                            "PHONE_STATE_BROADCAST"
                        )
                    } else {
                        CallEventStore.updatePhoneIfMissing(appContext, legacyIncomingNumber)
                    }
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                    !RoleUtil.hasScreeningRole(appContext)
                ) {
                    // Android 12+ without screening role: we won't get the number.
                    // Create a stub event so the lifecycle has an entry to finalize.
                    CallEventStore.beginIncoming(appContext, null, now, "PHONE_STATE_NO_ROLE")
                }
            }

            TelephonyManager.CALL_STATE_OFFHOOK -> {
                CallEventStore.markAnswered(appContext, now)
            }

            TelephonyManager.CALL_STATE_IDLE -> {
                if (lastState == TelephonyManager.CALL_STATE_OFFHOOK ||
                    lastState == TelephonyManager.CALL_STATE_RINGING
                ) {
                    // IDLE after OFFHOOK = completed call. IDLE after RINGING = missed call.
                    val direction = if (lastState == TelephonyManager.CALL_STATE_OFFHOOK &&
                        CallEventStore.snapshot().lastOrNull()?.let {
                            !it.finalized && (it.source == "SCREENING" ||
                                it.source == "PHONE_STATE_BROADCAST" ||
                                it.source == "PHONE_STATE_NO_ROLE" ||
                                it.source == "PHONE_STATE_RECEIVER")
                        } == true
                    ) null else if (lastState == TelephonyManager.CALL_STATE_OFFHOOK) "OUTGOING" else null

                    CallEventStore.markEnded(appContext, now, direction)

                    // Trigger recording scan after a short delay so the OS finalizes the file.
                    if (!pendingScan) {
                        pendingScan = true
                        mainHandler.postDelayed({
                            try {
                                RecordingScanService.enqueueWork(appContext)
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to enqueue scan after IDLE", e)
                            } finally {
                                pendingScan = false
                            }
                        }, POST_CALL_SCAN_DELAY_MS)
                    }
                }
            }
        }
        lastState = newState
    }

    private fun hasReadPhoneStatePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            appContext,
            android.Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
    }
}
