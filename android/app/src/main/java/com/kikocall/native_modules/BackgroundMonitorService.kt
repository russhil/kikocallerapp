package com.kikocall.native_modules

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.FileObserver
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.CallLog
import android.telephony.TelephonyManager
import android.util.Log
import android.content.pm.ServiceInfo
import java.io.File

/**
 * Persistent foreground service that keeps the app alive in the background
 * and monitors for new call recordings via multiple detection mechanisms:
 *
 * 1. CallLogObserver - watches call log database for new entries
 * 2. CallStateReceiver - detects phone state changes (call end)
 * 3. FileObserver - watches recording directories for new files
 *
 * This service is the core of the background monitoring system.
 * It runs as a foreground service with a persistent notification.
 */
class BackgroundMonitorService : Service() {

    companion object {
        private const val TAG = "BGMonitorService"
        private const val CHANNEL_ID = "kikocall_monitor"
        private const val NOTIFICATION_ID = 77001
        private const val FILE_SCAN_DELAY_MS = 10_000L

        @Volatile
        var isRunning = false
            private set

        fun start(context: Context) {
            val intent = Intent(context, BackgroundMonitorService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, BackgroundMonitorService::class.java)
            context.stopService(intent)
        }
    }

    private var callLogObserver: ContentObserver? = null
    private var callStateReceiver: CallStateReceiver? = null
    private var fileObservers: MutableList<FileObserver> = mutableListOf()
    private val handler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "BackgroundMonitorService created")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "BackgroundMonitorService onStartCommand")

        // Start foreground immediately to prevent ANR
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Register all monitoring mechanisms
        registerCallLogObserver()
        registerCallStateReceiver()
        registerFileObservers()

        // Save state for boot receiver
        getSharedPreferences("kikocall_prefs", Context.MODE_PRIVATE)
            .edit()
            .putBoolean("monitoring_enabled", true)
            .apply()

        isRunning = true
        Log.d(TAG, "BackgroundMonitorService fully started - monitoring active")

        // START_STICKY ensures the service restarts if the system kills it
        return START_STICKY
    }

    override fun onDestroy() {
        Log.d(TAG, "BackgroundMonitorService destroyed")
        isRunning = false

        // Unregister call log observer
        try {
            callLogObserver?.let {
                contentResolver.unregisterContentObserver(it)
            }
            callLogObserver = null
        } catch (e: Exception) {
            Log.w(TAG, "Error unregistering call log observer", e)
        }

        // Unregister call state receiver
        try {
            callStateReceiver?.let {
                unregisterReceiver(it)
            }
            callStateReceiver = null
        } catch (e: Exception) {
            Log.w(TAG, "Error unregistering call state receiver", e)
        }

        // Stop file observers
        try {
            fileObservers.forEach { it.stopWatching() }
            fileObservers.clear()
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping file observers", e)
        }

        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Call Monitoring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "KikoCall background call monitoring"
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val iconResId = resources.getIdentifier("ic_launcher", "mipmap", packageName)

        // Intent to open the app when notification is tapped
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        } ?: Intent(this, Class.forName("com.kikocall.MainActivity")).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return androidx.core.app.NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("KikoCall Active")
            .setContentText("Monitoring incoming calls for orders...")
            .setSmallIcon(if (iconResId != 0) iconResId else android.R.drawable.ic_menu_call)
            .setContentIntent(pendingIntent)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setShowWhen(false)
            .build()
    }

    // ── MONITOR 1: Call Log Observer ──

    private fun registerCallLogObserver() {
        try {
            callLogObserver?.let {
                contentResolver.unregisterContentObserver(it)
            }

            callLogObserver = object : ContentObserver(handler) {
                private var isProcessing = false

                override fun onChange(selfChange: Boolean, uri: Uri?) {
                    super.onChange(selfChange, uri)
                    if (uri?.toString()?.contains("calls") == true && !isProcessing) {
                        isProcessing = true
                        Log.d(TAG, "Call log change detected via ContentObserver")

                        handler.postDelayed({
                            try {
                                RecordingScanService.enqueueWork(applicationContext)
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to trigger scan from call log observer", e)
                            } finally {
                                handler.postDelayed({ isProcessing = false }, 5000)
                            }
                        }, 5000) // 5s delay for call log + file to be ready
                    }
                }
            }

            contentResolver.registerContentObserver(
                CallLog.Calls.CONTENT_URI,
                true,
                callLogObserver!!
            )
            Log.d(TAG, "CallLogObserver registered successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register CallLogObserver", e)
        }
    }

    // ── MONITOR 2: Phone State Receiver ──

    private fun registerCallStateReceiver() {
        try {
            callStateReceiver = CallStateReceiver()
            val filter = IntentFilter(TelephonyManager.ACTION_PHONE_STATE_CHANGED)
            registerReceiver(callStateReceiver, filter)
            Log.d(TAG, "CallStateReceiver registered successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register CallStateReceiver", e)
        }
    }

    // ── MONITOR 3: File Observer on Recording Directories ──

    private fun registerFileObservers() {
        try {
            // Stop any existing observers
            fileObservers.forEach { it.stopWatching() }
            fileObservers.clear()

            val dirsToWatch = getRecordingDirectories()
            for (dirPath in dirsToWatch) {
                val dir = File(dirPath)
                if (dir.exists() && dir.isDirectory && dir.canRead()) {
                    try {
                        val observer = object : FileObserver(dir, CREATE or MOVED_TO or CLOSE_WRITE) {
                            private var lastTriggerTime = 0L

                            override fun onEvent(event: Int, path: String?) {
                                if (path == null) return
                                val ext = path.substringAfterLast('.', "").lowercase()
                                if (ext !in RecordingMonitorModule.SUPPORTED_EXTENSIONS) return

                                val now = System.currentTimeMillis()
                                // Debounce: don't trigger more than once every 10 seconds
                                if (now - lastTriggerTime < 10_000) return
                                lastTriggerTime = now

                                Log.d(TAG, "New recording file detected: $path in $dirPath")
                                handler.postDelayed({
                                    try {
                                        RecordingScanService.enqueueWork(applicationContext)
                                    } catch (e: Exception) {
                                        Log.e(TAG, "Failed to trigger scan from file observer", e)
                                    }
                                }, FILE_SCAN_DELAY_MS)
                            }
                        }
                        observer.startWatching()
                        fileObservers.add(observer)
                        Log.d(TAG, "FileObserver registered for: $dirPath")
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to create FileObserver for $dirPath", e)
                    }
                }
            }
            Log.d(TAG, "FileObservers registered: ${fileObservers.size} directories")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register file observers", e)
        }
    }

    private fun getRecordingDirectories(): List<String> {
        val dirs = mutableSetOf<String>()
        val brand = Build.MANUFACTURER.lowercase()

        // Common recording directories based on device brand
        val brandDirs = mapOf(
            "samsung" to listOf("/storage/emulated/0/Call Recordings", "/storage/emulated/0/Recordings/Call Recordings"),
            "xiaomi" to listOf("/storage/emulated/0/MIUI/sound_recorder/call_rec", "/storage/emulated/0/CallRecordings"),
            "redmi" to listOf("/storage/emulated/0/MIUI/sound_recorder/call_rec", "/storage/emulated/0/CallRecordings"),
            "poco" to listOf("/storage/emulated/0/MIUI/sound_recorder/call_rec", "/storage/emulated/0/CallRecordings"),
            "oneplus" to listOf("/storage/emulated/0/Record/Call", "/storage/emulated/0/Recordings/Call", "/storage/emulated/0/Music/Recordings/Call Recordings"),
            "oppo" to listOf("/storage/emulated/0/Recordings/Call Recordings", "/storage/emulated/0/CallRecordings"),
            "vivo" to listOf("/storage/emulated/0/Record/Call", "/storage/emulated/0/Sounds/CallRecord"),
            "realme" to listOf("/storage/emulated/0/Recordings/Call Recordings", "/storage/emulated/0/CallRecordings"),
            "google" to listOf("/storage/emulated/0/Android/data/com.google.android.dialer/files/callrecordings")
        )

        // Add brand-specific dirs first
        brandDirs[brand]?.let { dirs.addAll(it) }

        // Add common generic dirs
        dirs.addAll(listOf(
            "/storage/emulated/0/Recordings/Call Recordings",
            "/storage/emulated/0/CallRecordings",
            "/storage/emulated/0/Recordings",
            "/storage/emulated/0/Record/Call",
            "/storage/emulated/0/Call",
            "/storage/emulated/0/MIUI/sound_recorder/call_rec",
            "/storage/emulated/0/Music/Recordings/Call Recordings"
        ))

        return dirs.toList()
    }
}
