package com.kikocall.native_modules

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.Build
import android.os.Environment
import android.provider.CallLog
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.content.Context
import android.app.NotificationManager
import android.app.NotificationChannel
import com.facebook.react.bridge.*
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.FileOutputStream
import android.app.PendingIntent

class RecordingMonitorModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "RecordingMonitor"
        private const val MAX_PCM_BYTES = 50 * 1024 * 1024
        private const val MAX_DURATION_US = 30L * 60 * 1_000_000
        const val FOLDER_PICKER_REQUEST_CODE = 9876

        // Held statically so MainActivity can resolve it in onActivityResult
        @JvmField
        var pendingFolderPickerPromise: Promise? = null

        val SUPPORTED_EXTENSIONS = setOf("mp3", "m4a", "m4b", "aac", "amr", "awb", "wav", "ogg", "opus", "flac", "3gp", "3gpp", "mp4", "webm", "qcp", "caf", "wma", "enc", "dat", "tmp", "spx", "au", "aiff")

        private val BRAND_DIRS: Map<String, List<String>> = mapOf(
            "samsung" to listOf("/storage/emulated/0/Call Recordings", "/storage/emulated/0/Recordings/Call Recordings"),
            "xiaomi" to listOf("/storage/emulated/0/MIUI/sound_recorder/call_rec", "/storage/emulated/0/CallRecordings"),
            "redmi" to listOf("/storage/emulated/0/MIUI/sound_recorder/call_rec", "/storage/emulated/0/CallRecordings"),
            "poco" to listOf("/storage/emulated/0/MIUI/sound_recorder/call_rec", "/storage/emulated/0/CallRecordings"),
            "google" to listOf("/storage/emulated/0/Android/data/com.google.android.dialer/files/callrecordings"),
            "oneplus" to listOf("/storage/emulated/0/Record/Call", "/storage/emulated/0/CallRecordings", "/storage/emulated/0/Recordings/Call", "/storage/emulated/0/Music/Recordings/Call Recordings", "/storage/emulated/0/Recordings"),
            "oppo" to listOf("/storage/emulated/0/Recordings/Call Recordings", "/storage/emulated/0/CallRecordings"),
            "vivo" to listOf("/storage/emulated/0/Record/Call", "/storage/emulated/0/Sounds/CallRecord"),
            "realme" to listOf("/storage/emulated/0/Recordings/Call Recordings", "/storage/emulated/0/CallRecordings"),
            "motorola" to listOf("/storage/emulated/0/CallRecordings", "/storage/emulated/0/Recordings/Call Recordings"),
            "nokia" to listOf("/storage/emulated/0/CallRecordings", "/storage/emulated/0/Recordings/Call Recordings"),
            "asus" to listOf("/storage/emulated/0/CallRecordings", "/storage/emulated/0/Recordings/Call Recordings"),
            "lava" to listOf("/storage/emulated/0/CallRecordings", "/storage/emulated/0/Recordings/Call Recordings"),
            "micromax" to listOf("/storage/emulated/0/CallRecordings", "/storage/emulated/0/Recordings/Call Recordings"),
            "itel" to listOf("/storage/emulated/0/CallRecordings", "/storage/emulated/0/Recordings/Call Recordings"),
            "tecno" to listOf("/storage/emulated/0/CallRecordings", "/storage/emulated/0/Recordings/Call Recordings"),
            "infinix" to listOf("/storage/emulated/0/CallRecordings", "/storage/emulated/0/Recordings/Call Recordings")
        )

        private val GENERIC_DIRS = listOf(
            "/storage/emulated/0/Recordings/Call Recordings",
            "/storage/emulated/0/CallRecordings",
            "/storage/emulated/0/Recordings",
            "/storage/emulated/0/Record/Call",
            "/storage/emulated/0/PhoneCallRecords",
            "/storage/emulated/0/Music/Recordings",
            "/sdcard/Recordings/Call Recordings",
            "/sdcard/CallRecordings",
            "/sdcard/Recordings",
            "/storage/emulated/0/Android/data/com.google.android.dialer/files/CallRecordings",
            "/storage/emulated/0/Android/data/com.google.android.dialer/files/callrecordings",
            "/data/data/com.google.android.dialer/files/CallRecordings",
            "/data/user/0/com.google.android.dialer/files/CallRecordings",
            "/storage/emulated/0/Sounds/CallRecordings",
            "/sdcard/Sounds/CallRecordings",
            "/storage/emulated/0/Call/CallRecordings",
            "/storage/emulated/0/Voice Recorder/Call",
            "/sdcard/Call/CallRecordings",
            "/storage/emulated/0/MIUI/sound_recorder/call_rec",
            "/storage/emulated/0/MIUI/CallRecord",
            "/sdcard/MIUI/sound_recorder/call_rec",
            "/storage/emulated/0/Music/Recordings/Call",
            "/storage/emulated/0/Recordings/CallRecord",
            "/sdcard/Recordings/CallRecord",
            "/storage/emulated/0/Recorder/CallRecord",
            "/storage/emulated/0/Sounds/CallRecord",
            "/sdcard/Sounds/CallRecord",
            "/storage/emulated/0/CubeCallRecorder/All",
            "/storage/emulated/0/Android/data/com.catalinagroup.callrecorder/files",
            "/storage/emulated/0/ACRCalls",
            "/storage/emulated/0/Android/data/com.nll.acr/files",
            "/storage/emulated/0/CallRecorder",
            "/storage/emulated/0/Voix",
            "/storage/emulated/0/CallRec",
            "/data/data/com.android.dialer",
            "/data/data/com.google.android.dialer",
            "/data/user/0/com.android.dialer/files",
            "/data/user/0/com.google.android.dialer/files",
            "/storage/emulated/0/Music/CallRecordings",
            "/storage/emulated/0/Documents/CallRecordings",
            "/storage/emulated/0/Download/CallRecordings",
            "/storage/emulated/0/Recorder/Recordings",
            "/storage/emulated/0/Sounds/Recordings",
            "/storage/emulated/0/Call",
            "/storage/emulated/0/VoiceRecorder/Call",
            "/sdcard/Download/CallRecordings"
        )
    }

    override fun getName() = "RecordingMonitorModule"

    override fun getConstants(): Map<String, Any> {
        val constants = mutableMapOf<String, Any>()
        try {
            val packageInfo = reactApplicationContext.packageManager.getPackageInfo(reactApplicationContext.packageName, 0)
            constants["AppInstallTime"] = packageInfo.firstInstallTime.toDouble()
        } catch (e: Exception) {
            constants["AppInstallTime"] = 0.0
        }
        return constants
    }

    private var userCustomPath: String? = null

    @ReactMethod
    fun setCustomScanPath(path: String, promise: Promise) {
        userCustomPath = path
        promise.resolve(true)
    }

    @ReactMethod
    fun openFolderPicker(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Activity is not available")
            return
        }
        pendingFolderPickerPromise = promise
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            putExtra("android.content.extra.SHOW_ADVANCED", true)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        activity.startActivityForResult(intent, FOLDER_PICKER_REQUEST_CODE)
    }

    private fun getAllDirectories(): List<String> {
        val dirs = mutableSetOf<String>()
        
        // v30 Optimization: If user has a custom path, ONLY scan that.
        // Don't waste time on 40+ generic/brand directories.
        if (!userCustomPath.isNullOrBlank()) {
            dirs.add(userCustomPath!!)
            return dirs.toList()
        }

        val brand = Build.MANUFACTURER.lowercase()
        BRAND_DIRS[brand]?.let { dirs.addAll(it) }
        dirs.addAll(GENERIC_DIRS)
        for ((key, paths) in BRAND_DIRS) {
            if (key != brand) dirs.addAll(paths)
        }
        return dirs.toList()
    }

    // ── SCAN RECORDINGS ──

    @ReactMethod
    fun scanRecordings(promise: Promise) {
        try {
            val installTime: Long = try {
                reactApplicationContext.packageManager.getPackageInfo(reactApplicationContext.packageName, 0).firstInstallTime
            } catch (e: Exception) {
                0L
            }

            // v30: Prioritize MediaStore, fallback to directory scan only if MediaStore is empty
            val recordings = scanViaMediaStore() ?: scanViaDirectories()
            val result = Arguments.createArray()
            
            for (r in recordings) {
                // Skip recordings that were created before the app was installed
                if (r.lastModified < installTime) continue

                val map = Arguments.createMap()
                map.putString("filename", r.name)
                map.putString("path", r.path)
                map.putDouble("size", r.size.toDouble())
                map.putDouble("lastModified", r.lastModified.toDouble())
                
                // v30 optimized: Avoid heavy duration check during bulk scan
                map.putDouble("durationMs", 0.0) 
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SCAN_ERROR", e.message)
        }
    }

    data class AudioFile(val name: String, val path: String, val lastModified: Long, val size: Long)

    private fun scanViaMediaStore(): List<AudioFile>? {
        try {
            val recordings = mutableListOf<AudioFile>()
            val seenPaths = mutableSetOf<String>()
            val projection = arrayOf(
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.DATA,
                MediaStore.Audio.Media.DATE_MODIFIED,
                MediaStore.Audio.Media.SIZE
            )
            val cursor = reactContext.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, projection, null, null,
                "${MediaStore.Audio.Media.DATE_MODIFIED} DESC"
            )
            cursor?.use {
                val nameCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
                val pathCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA)
                val dateCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
                val sizeCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
                while (it.moveToNext()) {
                    val name = it.getString(nameCol) ?: continue
                    val path = it.getString(pathCol) ?: continue
                    val ext = name.substringAfterLast('.', "").lowercase()
                    if (ext !in SUPPORTED_EXTENSIONS) continue
                    val file = File(path)
                    if (!file.exists() || file.length() == 0L) continue
                    val dateModified = it.getLong(dateCol) * 1000
                    val size = it.getLong(sizeCol)
                    if (seenPaths.add(path)) {
                        recordings.add(AudioFile(name, path, dateModified, size))
                    }
                }
            }
            if (recordings.isEmpty()) return null
            return recordings
        } catch (e: Exception) {
            Log.e(TAG, "MediaStore scan failed", e)
            return null
        }
    }

    private fun scanViaDirectories(): List<AudioFile> {
        val recordings = mutableListOf<AudioFile>()
        val scannedPaths = mutableSetOf<String>()
        for (dirPath in getAllDirectories()) {
            try {
                val dir = File(dirPath)
                if (dir.exists() && dir.isDirectory) {
                    dir.walkTopDown()
                        .onEnter { it.canRead() } // Only enter readable directories
                        .onFail { _, _ -> }       // Ignore sequence errors (e.g. permission denied)
                        .filter { it.isFile && it.extension.lowercase() in SUPPORTED_EXTENSIONS }
                        .forEach { file ->
                            if (scannedPaths.add(file.absolutePath)) {
                                recordings.add(AudioFile(file.name, file.absolutePath, file.lastModified(), file.length()))
                            }
                        }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed scanning directory $dirPath", e)
                // Continue to next directory
            }
        }
        return recordings.sortedByDescending { it.lastModified }
    }

    // ── AUDIO CONVERSION ──

    @ReactMethod
    fun decodeToBase64(filePath: String, promise: Promise) {
        Thread {
            try {
                val pcmBytes = decodeToPcmBytes(filePath)
                if (pcmBytes != null && pcmBytes.isNotEmpty()) {
                    val base64 = if (pcmBytes.size <= 768 * 1024) {
                        Base64.encodeToString(pcmBytes, Base64.NO_WRAP)
                    } else {
                        val chunkSize = 768 * 1024
                        val sb = StringBuilder((pcmBytes.size * 4 / 3) + 4)
                        var offset = 0
                        while (offset < pcmBytes.size) {
                            val end = minOf(offset + chunkSize, pcmBytes.size)
                            sb.append(Base64.encodeToString(pcmBytes.copyOfRange(offset, end), Base64.NO_WRAP))
                            offset = end
                        }
                        sb.toString()
                    }
                    promise.resolve(base64)
                    return@Thread
                }
                // Fallback: if PCM decode fails (e.g. unsupported codec on some devices),
                // send raw file bytes - the Gemini API can handle various audio formats
                Log.w(TAG, "PCM decode failed for $filePath, falling back to raw file base64")
                val file = File(filePath)
                if (!file.exists() || file.length() == 0L) {
                    promise.reject("DECODE_ERROR", "File does not exist or is empty")
                    return@Thread
                }
                if (file.length() > MAX_PCM_BYTES) {
                    promise.reject("DECODE_ERROR", "File too large")
                    return@Thread
                }
                val bytes = file.readBytes()
                val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                promise.resolve(base64)
            } catch (e: Exception) {
                // Final fallback: try raw file
                try {
                    Log.w(TAG, "Decode exception for $filePath, trying raw file fallback", e)
                    val file = File(filePath)
                    if (file.exists() && file.length() > 0L && file.length() <= MAX_PCM_BYTES) {
                        val bytes = file.readBytes()
                        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                        promise.resolve(base64)
                    } else {
                        promise.reject("DECODE_ERROR", "Failed to decode audio: ${e.message}", e)
                    }
                } catch (e2: Exception) {
                    promise.reject("DECODE_ERROR", "Failed to decode audio: ${e.message}", e)
                }
            }
        }.start()
    }

    @ReactMethod
    fun getFileBase64(filePath: String, promise: Promise) {
        Thread {
            try {
                val file = File(filePath)
                if (!file.exists() || file.length() == 0L) {
                    promise.reject("FILE_ERROR", "File does not exist")
                    return@Thread
                }
                if (file.length() > MAX_PCM_BYTES) {
                    promise.reject("FILE_ERROR", "File too large")
                    return@Thread
                }
                val bytes = file.readBytes()
                val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                promise.resolve(base64)
            } catch (e: Exception) {
                promise.reject("FILE_ERROR", e.message, e)
            }
        }.start()
    }

    private fun decodeToPcmBytes(filePath: String): ByteArray? {
        val file = File(filePath)
        if (!file.exists() || file.length() == 0L) return null
        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(filePath)
        } catch (e: Exception) {
            Log.w(TAG, "MediaExtractor failed to instantiate for $filePath: ${e.message}")
            extractor.release()
            return null
        }
        var audioTrackIndex = -1
        for (i in 0 until extractor.trackCount) {
            val format = extractor.getTrackFormat(i)
            if (format.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
                audioTrackIndex = i; break
            }
        }
        if (audioTrackIndex == -1) { extractor.release(); return null }
        val format = extractor.getTrackFormat(audioTrackIndex)
        val sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: run { extractor.release(); return null }
        if (format.containsKey(MediaFormat.KEY_DURATION)) {
            if (format.getLong(MediaFormat.KEY_DURATION) > MAX_DURATION_US) { extractor.release(); return null }
        }
        extractor.selectTrack(audioTrackIndex)
        val codec = MediaCodec.createDecoderByType(mime)
        codec.configure(format, null, null, 0)
        codec.start()
        val outputStream = ByteArrayOutputStream()
        val bufferInfo = MediaCodec.BufferInfo()
        var isEOS = false
        var totalBytes = 0
        while (!isEOS) {
            if (totalBytes > MAX_PCM_BYTES) break
            val inputIdx = codec.dequeueInputBuffer(10000)
            if (inputIdx >= 0) {
                val inputBuf = codec.getInputBuffer(inputIdx) ?: continue
                val sampleSize = extractor.readSampleData(inputBuf, 0)
                if (sampleSize < 0) {
                    codec.queueInputBuffer(inputIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                    isEOS = true
                } else {
                    codec.queueInputBuffer(inputIdx, 0, sampleSize, extractor.sampleTime, 0)
                    extractor.advance()
                }
            }
            var outIdx = codec.dequeueOutputBuffer(bufferInfo, 10000)
            while (outIdx >= 0) {
                val outBuf = codec.getOutputBuffer(outIdx) ?: break
                val data = ByteArray(bufferInfo.size)
                outBuf.get(data)
                outputStream.write(data)
                totalBytes += data.size
                codec.releaseOutputBuffer(outIdx, false)
                outIdx = codec.dequeueOutputBuffer(bufferInfo, 0)
            }
        }
        codec.stop(); codec.release(); extractor.release()
        val pcm = outputStream.toByteArray()
        val channels = if (format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) format.getInteger(MediaFormat.KEY_CHANNEL_COUNT) else 1
        val mono = if (channels > 1) convertToMono(pcm, channels) else pcm
        return if (sampleRate != 16000) resample(mono, sampleRate, 16000) else mono
    }

    private fun convertToMono(pcm: ByteArray, channels: Int): ByteArray {
        val frameSize = 2 * channels; val frameCount = pcm.size / frameSize
        val mono = ByteArray(frameCount * 2)
        val buf = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN)
        val out = ByteBuffer.wrap(mono).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until frameCount) {
            var sum = 0L
            for (c in 0 until channels) sum += buf.getShort(i * frameSize + c * 2)
            out.putShort((sum / channels).toShort())
        }
        return mono
    }

    private fun resample(input: ByteArray, fromRate: Int, toRate: Int): ByteArray {
        val inputSamples = input.size / 2
        val outputSamples = (inputSamples.toLong() * toRate / fromRate).toInt()
        val output = ByteArray(outputSamples * 2)
        val inBuf = ByteBuffer.wrap(input).order(ByteOrder.LITTLE_ENDIAN)
        val outBuf = ByteBuffer.wrap(output).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until outputSamples) {
            val srcIdx = (i.toLong() * fromRate / toRate).toInt().coerceIn(0, inputSamples - 1)
            outBuf.putShort(inBuf.getShort(srcIdx * 2))
        }
        return output
    }

    private fun getAudioDuration(filePath: String): Long {
        return try {
            val ext = MediaExtractor(); ext.setDataSource(filePath)
            for (i in 0 until ext.trackCount) {
                val fmt = ext.getTrackFormat(i)
                if (fmt.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
                    val dur = if (fmt.containsKey(MediaFormat.KEY_DURATION)) fmt.getLong(MediaFormat.KEY_DURATION) / 1000 else 0L
                    ext.release(); return dur
                }
            }
            ext.release(); 0L
        } catch (e: Exception) { 0L }
    }

    // ── CALL LOG ──

    @ReactMethod
    fun findCallInfoForTimestamp(timestampMs: Double, promise: Promise) {
        try {
            val ts = timestampMs.toLong()
            val tolerance = 180_000L
            val cursor = reactContext.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.TYPE),
                "${CallLog.Calls.DATE} BETWEEN ? AND ?",
                arrayOf((ts - tolerance).toString(), (ts + tolerance).toString()),
                "${CallLog.Calls.DATE} DESC"
            )
            if (cursor == null) { promise.resolve(null); return }
            cursor.use {
                if (it.moveToFirst()) {
                    val number = it.getString(it.getColumnIndexOrThrow(CallLog.Calls.NUMBER))
                    val type = it.getInt(it.getColumnIndexOrThrow(CallLog.Calls.TYPE))
                    
                    var contactName: String? = null
                    val nameIdx = it.getColumnIndex(CallLog.Calls.CACHED_NAME)
                    if (nameIdx >= 0) {
                        contactName = it.getString(nameIdx)
                    }
                    
                    val direction = when (type) {
                        CallLog.Calls.INCOMING_TYPE -> "INCOMING"
                        CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
                        CallLog.Calls.MISSED_TYPE -> "MISSED"
                        else -> "UNKNOWN"
                    }
                    val result = Arguments.createMap()
                    result.putString("phone", normalizePhone(number))
                    result.putString("direction", direction)
                    if (contactName != null) {
                        result.putString("contactName", contactName)
                    }
                    promise.resolve(result)
                } else {
                    promise.resolve(null)
                }
            }
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    private fun normalizePhone(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val digits = raw.replace(Regex("[^0-9]"), "")
        return when {
            digits.length == 10 -> digits
            digits.length == 12 && digits.startsWith("91") -> digits.substring(2)
            digits.length == 13 && digits.startsWith("091") -> digits.substring(3)
            else -> digits.takeIf { it.isNotEmpty() }
        }
    }

    // ── ORDERS (stub for backward compat) ──

    @ReactMethod
    fun getOrders(promise: Promise) {
        promise.resolve("[]")
    }

    @ReactMethod
    fun getRecordings(promise: Promise) {
        scanRecordings(promise)
    }

    @ReactMethod
    fun processRecording(recordingId: Double, promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun startMonitorService(promise: Promise) {
        try {
            val observer = CallLogObserver(reactApplicationContext)
            reactApplicationContext.contentResolver.registerContentObserver(
                android.provider.CallLog.Calls.CONTENT_URI,
                true,
                observer
            )
            Log.d(TAG, "CallLogObserver registered successfully")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register CallLogObserver", e)
            promise.reject("MONITOR_ERROR", e.message)
        }
    }

    @ReactMethod
    fun showNotification(title: String, message: String, id: Double, promise: Promise) {
        try {
            val channelId = "kikocall_processing"
            val notificationManager = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(channelId, "Order Processing", NotificationManager.IMPORTANCE_DEFAULT)
                notificationManager.createNotificationChannel(channel)
            }
            
            // Note: res/mipmap/ic_launcher must exist usually, using standard React Native icon name
            val iconResId = reactApplicationContext.resources.getIdentifier("ic_launcher", "mipmap", reactApplicationContext.packageName)
            
            val intent = reactApplicationContext.packageManager.getLaunchIntentForPackage(reactApplicationContext.packageName)?.apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            } ?: Intent(reactApplicationContext, Class.forName("com.kikocall.MainActivity")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                reactApplicationContext, 
                id.toInt(), 
                intent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val builder = androidx.core.app.NotificationCompat.Builder(reactApplicationContext, channelId)
                .setSmallIcon(if (iconResId != 0) iconResId else android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(message)
                .setContentIntent(pendingIntent)
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                
            notificationManager.notify(id.toInt(), builder.build())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIF_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun hasAllFilesAccess(promise: Promise) {
        // v30: Play Store Compliance - always return true to the UI since we use Scoped Storage
        promise.resolve(true)
    }

    @ReactMethod
    fun requestAllFilesAccess(promise: Promise) {
        // v30: No longer needed for Scoped Storage
        promise.resolve(true)
    }

    @ReactMethod
    fun exportAndShareLogs(promise: Promise) {
        Thread {
            try {
                // 1. Get Logcat
                val process = Runtime.getRuntime().exec("logcat -d")
                val bufferedReader = BufferedReader(InputStreamReader(process.inputStream))
                val logBuilder = StringBuilder()
                var line: String?
                while (bufferedReader.readLine().also { line = it } != null) {
                    logBuilder.append(line).append("\n")
                }
                
                // 2. Save to Cache Dir
                val cacheDir = File(reactApplicationContext.cacheDir, "logs")
                cacheDir.mkdirs()
                val logFile = File(cacheDir, "KikoCall_Logs.txt")
                FileOutputStream(logFile).use { fos ->
                    fos.write(logBuilder.toString().toByteArray())
                }
                
                // 3. Share via FileProvider
                val authority = "${reactApplicationContext.packageName}.provider"
                val uri = FileProvider.getUriForFile(reactApplicationContext, authority, logFile)
                
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_SUBJECT, "KikoCall App Logs")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                
                val chooser = Intent.createChooser(intent, "Share KikoCall Logs")
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(chooser)
                
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("LOG_EXPORT_ERROR", "Failed to export logs: " + e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun logToNative(tag: String, message: String, promise: Promise) {
        try {
            Log.e(tag, message)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("LOG_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun exportLogs(promise: Promise) {
        promise.resolve("")
    }
}
