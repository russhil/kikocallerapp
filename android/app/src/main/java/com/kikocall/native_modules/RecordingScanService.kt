package com.kikocall.native_modules

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.kikocall.MainActivity
import android.content.pm.ServiceInfo

class RecordingScanService : HeadlessJsTaskService() {

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras
        return if (extras != null) {
            Log.d("RecordingScanService", "Creating Headless Task for background sync")
            HeadlessJsTaskConfig(
                "RecordingScanTask", // Must match the name registered in JavaScript
                Arguments.fromBundle(extras),
                300000, // Timeout for the task in ms (300 seconds) - needed for AI transcription + network delays
                true // Allowed in foreground (required for our service)
            )
        } else {
            null
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Start foreground service for Android 14+ requirements
        val channelId = "kikocall_background_scan"
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "Kiko Background Sync", NotificationManager.IMPORTANCE_LOW)
            notificationManager.createNotificationChannel(channel)
        }

        // Use the app icon if possible
        val iconResId = resources.getIdentifier("ic_launcher", "mipmap", packageName)
        val notification = androidx.core.app.NotificationCompat.Builder(this, channelId)
            .setContentTitle("KikoCall Background Sync")
            .setContentText("Checking for new recordings...")
            .setSmallIcon(if (iconResId != 0) iconResId else android.R.drawable.ic_menu_call)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(1, notification)
        }
        
        return super.onStartCommand(intent, flags, startId)
    }

    companion object {
        fun enqueueWork(context: Context) {
            val intent = Intent(context, RecordingScanService::class.java)
            // Use a specific "bundle" for our task name so HeadlessJsTaskService can pick it up
            intent.putExtra("type", "sync")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
