package com.kikocall.native_modules

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * Captures the incoming caller's phone number at the moment the call rings,
 * BEFORE the call is answered. Stores the number to CallEventStore so that
 * findCallInfoForTimestamp() can match it to the resulting recording later.
 *
 * This service NEVER blocks, silences, or filters calls. It only observes.
 *
 * Requires the user to grant ROLE_CALL_SCREENING via RoleManager.
 */
@RequiresApi(Build.VERSION_CODES.Q)
class KikoCallScreeningService : CallScreeningService() {

    companion object {
        private const val TAG = "KikoScreening"
    }

    override fun onScreenCall(callDetails: Call.Details) {
        try {
            val phone = runCatching {
                val handle = callDetails.handle
                when {
                    handle == null -> null
                    handle.scheme == "tel" -> handle.schemeSpecificPart
                    else -> handle.schemeSpecificPart ?: handle.toString()
                }
            }.getOrNull()

            val direction = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                callDetails.callDirection == Call.Details.DIRECTION_OUTGOING
            ) "OUTGOING" else "INCOMING"

            Log.d(TAG, "onScreenCall direction=$direction phone=$phone")

            if (direction == "INCOMING") {
                CallEventStore.beginIncoming(
                    applicationContext,
                    phone,
                    System.currentTimeMillis(),
                    "SCREENING"
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "onScreenCall handling failed", e)
        }

        val response = CallResponse.Builder()
            .setDisallowCall(false)
            .setRejectCall(false)
            .setSilenceCall(false)
            .setSkipCallLog(false)
            .setSkipNotification(false)
            .build()
        try {
            respondToCall(callDetails, response)
        } catch (e: Exception) {
            Log.e(TAG, "respondToCall failed", e)
        }
    }
}
