package com.kikocall.native_modules

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Restarts the BackgroundMonitorService after device boot or quick-boot.
 * This ensures the app continues monitoring for call recordings even after reboots.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON" ||
            intent.action == "com.htc.intent.action.QUICKBOOT_POWERON"
        ) {
            Log.d(TAG, "Boot completed - checking if monitor service should restart")
            try {
                // Only restart if user was previously logged in
                val prefs = context.getSharedPreferences("kikocall_prefs", Context.MODE_PRIVATE)
                val wasMonitoring = prefs.getBoolean("monitoring_enabled", false)
                if (wasMonitoring) {
                    Log.d(TAG, "Restarting BackgroundMonitorService after boot")
                    BackgroundMonitorService.start(context)
                } else {
                    Log.d(TAG, "Monitoring was not enabled, skipping restart")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restart monitor service after boot", e)
            }
        }
    }
}
