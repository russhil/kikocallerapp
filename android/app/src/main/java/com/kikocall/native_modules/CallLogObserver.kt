package com.kikocall.native_modules

import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext

class CallLogObserver(
    private val context: ReactApplicationContext,
    handler: Handler = Handler(Looper.getMainLooper())
) : ContentObserver(handler) {

    companion object {
        private const val TAG = "CallLogObserver"
        private var isProcessing = false // Re-entry guard
    }

    override fun onChange(selfChange: Boolean, uri: Uri?) {
        super.onChange(selfChange, uri)
        
        if (uri?.toString()?.contains("calls") == true && !isProcessing) {
            isProcessing = true
            Log.d(TAG, "Call log change detected, scheduling background sync...")
            
            // Delay slightly to ensure call log and file system are fully flushed
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    // Trigger the background service/HeadlessJS task
                    RecordingScanService.enqueueWork(context)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to trigger scan service", e)
                } finally {
                    // Reset flag after an additional delay to prevent thrashing
                    Handler(Looper.getMainLooper()).postDelayed({
                        isProcessing = false
                    }, 5000)
                }
            }, 3000)
        }
    }
}
