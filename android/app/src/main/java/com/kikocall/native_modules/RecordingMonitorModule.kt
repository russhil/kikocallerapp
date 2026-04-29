package com.kikocall.native_modules

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.Build
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
import android.net.Uri
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import com.google.android.gms.auth.api.phone.SmsRetriever
import android.content.pm.PackageManager
import java.security.MessageDigest
import java.util.Arrays

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

        // MIME types for MediaStore.Files scanning (catches files MediaStore.Audio misses)
        val AUDIO_MIME_TYPES = arrayOf(
            "audio/amr-wb", "audio/amr", "audio/mp4", "audio/mpeg",
            "audio/aac", "audio/ogg", "audio/wav", "audio/flac",
            "audio/3gpp", "audio/x-wav", "audio/webm", "audio/opus",
            "application/octet-stream" // Some recorders save AWB with generic type
        )

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
        reactApplicationContext.getSharedPreferences("kikocall_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("customScanPath", path)
            .apply()
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
        
        val prefs = reactApplicationContext.getSharedPreferences("kikocall_prefs", Context.MODE_PRIVATE)
        val savedCustomPath = userCustomPath ?: prefs.getString("customScanPath", null)

        // v42 Optimization: If user has a custom path, ONLY scan that.
        if (!savedCustomPath.isNullOrBlank()) {
            dirs.add(savedCustomPath!!)
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

    // ── Get persisted SAF URIs for folder picker ──

    private fun getPersistedSafUris(): List<Uri> {
        return try {
            reactContext.contentResolver.persistedUriPermissions
                .filter { it.isReadPermission }
                .map { it.uri }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get persisted URI permissions", e)
            emptyList()
        }
    }

    // ── SAF-based scanning using DocumentFile ──

    private fun scanViaSAF(): List<AudioFile> {
        val recordings = mutableListOf<AudioFile>()
        val safUris = getPersistedSafUris()
        
        if (safUris.isEmpty()) {
            Log.d(TAG, "No persisted SAF URIs found")
            return recordings
        }

        for (treeUri in safUris) {
            try {
                val docFile = DocumentFile.fromTreeUri(reactContext, treeUri) ?: continue
                if (!docFile.exists() || !docFile.isDirectory) continue
                
                Log.d(TAG, "SAF scanning tree: ${treeUri}")
                scanDocumentFileRecursive(docFile, recordings)
            } catch (e: Exception) {
                Log.w(TAG, "SAF scan failed for $treeUri", e)
            }
        }
        
        Log.d(TAG, "SAF scan found ${recordings.size} files")
        return recordings
    }

    private fun scanDocumentFileRecursive(dir: DocumentFile, results: MutableList<AudioFile>) {
        try {
            for (file in dir.listFiles()) {
                if (file.isDirectory) {
                    scanDocumentFileRecursive(file, results)
                } else if (file.isFile) {
                    val name = file.name ?: continue
                    val ext = name.substringAfterLast('.', "").lowercase()
                    if (ext !in SUPPORTED_EXTENSIONS) continue
                    val size = file.length()
                    if (size == 0L) continue
                    val lastModified = file.lastModified()
                    val uri = file.uri.toString()
                    results.add(AudioFile(name, uri, lastModified, size, file.uri))
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error scanning document dir: ${dir.uri}", e)
        }
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

            // v42: Multi-strategy scanning
            // 1. MediaStore Audio (standard)
            var recordings = scanViaMediaStore() ?: emptyList()
            
            // 2. MediaStore Files (catches AWB and other files not indexed as audio)
            val filesRecordings = scanViaMediaStoreFiles()
            recordings = (recordings + filesRecordings).distinctBy { "${it.name}_${it.size}" }
            
            // 3. SAF-based scanning (user-selected folders - works on all API levels)
            val safRecordings = scanViaSAF()
            recordings = (recordings + safRecordings).distinctBy { "${it.name}_${it.size}" }
            
            // 4. Direct directory scan (works on API < 30, or if MANAGE_EXTERNAL_STORAGE granted)
            val dirRecordings = scanViaDirectories()
            recordings = (recordings + dirRecordings).distinctBy { "${it.name}_${it.size}" }
            
            // Sort by newest first
            recordings = recordings.sortedByDescending { it.lastModified }
            
            Log.d(TAG, "Total recordings found: ${recordings.size} (MediaStore: mixed, SAF: ${safRecordings.size}, Dirs: ${dirRecordings.size})")

            val result = Arguments.createArray()
            
            for (r in recordings) {
                val map = Arguments.createMap()
                map.putString("filename", r.name)
                map.putString("path", r.path)
                map.putDouble("size", r.size.toDouble())
                map.putDouble("lastModified", r.lastModified.toDouble())
                map.putBoolean("isOld", r.lastModified < installTime)
                
                // v42: Store content URI if available for SAF files
                if (r.contentUri != null) {
                    map.putString("contentUri", r.contentUri.toString())
                }
                
                map.putDouble("durationMs", 0.0) 
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "scanRecordings failed", e)
            promise.reject("SCAN_ERROR", e.message)
        }
    }

    data class AudioFile(val name: String, val path: String, val lastModified: Long, val size: Long, val contentUri: Uri? = null)

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
                    // v42: Don't check file.exists() on API 30+ — MediaStore says it exists
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                        val file = File(path)
                        if (!file.exists() || file.length() == 0L) continue
                    }
                    val dateModified = it.getLong(dateCol) * 1000
                    val size = it.getLong(sizeCol)
                    if (size == 0L) continue
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

    // v42: Additional scan via MediaStore.Files to catch AWB and other non-standard audio files
    private fun scanViaMediaStoreFiles(): List<AudioFile> {
        val recordings = mutableListOf<AudioFile>()
        try {
            val projection = arrayOf(
                MediaStore.Files.FileColumns.DISPLAY_NAME,
                MediaStore.Files.FileColumns.DATA,
                MediaStore.Files.FileColumns.DATE_MODIFIED,
                MediaStore.Files.FileColumns.SIZE,
                MediaStore.Files.FileColumns.MIME_TYPE
            )
            
            // Build selection for supported extensions
            val extPatterns = SUPPORTED_EXTENSIONS.map { "%.${it}" }
            val selection = extPatterns.joinToString(" OR ") { "${MediaStore.Files.FileColumns.DATA} LIKE ?" }
            val selectionArgs = extPatterns.toTypedArray()

            val cursor = reactContext.contentResolver.query(
                MediaStore.Files.getContentUri("external"),
                projection,
                selection,
                selectionArgs,
                "${MediaStore.Files.FileColumns.DATE_MODIFIED} DESC"
            )
            
            cursor?.use {
                val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
                val pathCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
                val dateCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
                val sizeCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
                while (it.moveToNext()) {
                    val name = it.getString(nameCol) ?: continue
                    val path = it.getString(pathCol) ?: continue
                    val ext = name.substringAfterLast('.', "").lowercase()
                    if (ext !in SUPPORTED_EXTENSIONS) continue
                    val size = it.getLong(sizeCol)
                    if (size == 0L) continue
                    val dateModified = it.getLong(dateCol) * 1000
                    recordings.add(AudioFile(name, path, dateModified, size))
                }
            }
            Log.d(TAG, "MediaStore.Files scan found ${recordings.size} audio files")
        } catch (e: Exception) {
            Log.w(TAG, "MediaStore.Files scan failed", e)
        }
        return recordings
    }

    private fun scanViaDirectories(): List<AudioFile> {
        val recordings = mutableListOf<AudioFile>()
        val scannedPaths = mutableSetOf<String>()
        for (dirPath in getAllDirectories()) {
            try {
                val dir = File(dirPath)
                if (dir.exists() && dir.isDirectory) {
                    dir.walkTopDown()
                        .onEnter { it.canRead() }
                        .onFail { _, _ -> }
                        .filter { it.isFile && it.extension.lowercase() in SUPPORTED_EXTENSIONS }
                        .forEach { file ->
                            if (scannedPaths.add(file.absolutePath)) {
                                recordings.add(AudioFile(file.name, file.absolutePath, file.lastModified(), file.length()))
                            }
                        }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed scanning directory $dirPath", e)
            }
        }
        return recordings.sortedByDescending { it.lastModified }
    }

    // ── AUDIO CONVERSION ──

    // v42: Try to open a file, falling back to ContentResolver for SAF URIs
    private fun openFileBytes(filePath: String): ByteArray? {
        // First try direct File access
        try {
            val file = File(filePath)
            if (file.exists() && file.length() > 0L && file.length() <= MAX_PCM_BYTES) {
                return file.readBytes()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Direct file read failed for $filePath, trying ContentResolver", e)
        }

        // Try as content:// URI
        try {
            val uri = if (filePath.startsWith("content://")) {
                Uri.parse(filePath)
            } else {
                // Try to find in MediaStore by path
                findMediaStoreUri(filePath)
            }
            
            if (uri != null) {
                val stream = reactContext.contentResolver.openInputStream(uri)
                if (stream != null) {
                    val bytes = stream.readBytes()
                    stream.close()
                    if (bytes.isNotEmpty() && bytes.size <= MAX_PCM_BYTES) {
                        return bytes
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "ContentResolver read failed for $filePath", e)
        }

        return null
    }

    // v42: Find MediaStore content URI for a file path
    private fun findMediaStoreUri(filePath: String): Uri? {
        try {
            val projection = arrayOf(MediaStore.Audio.Media._ID)
            val selection = "${MediaStore.Audio.Media.DATA} = ?"
            val selectionArgs = arrayOf(filePath)
            val cursor = reactContext.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection, selection, selectionArgs, null
            )
            cursor?.use {
                if (it.moveToFirst()) {
                    val id = it.getLong(it.getColumnIndexOrThrow(MediaStore.Audio.Media._ID))
                    return Uri.withAppendedPath(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id.toString())
                }
            }
            
            // Also try MediaStore.Files
            val projection2 = arrayOf(MediaStore.Files.FileColumns._ID)
            val selection2 = "${MediaStore.Files.FileColumns.DATA} = ?"
            val cursor2 = reactContext.contentResolver.query(
                MediaStore.Files.getContentUri("external"),
                projection2, selection2, selectionArgs, null
            )
            cursor2?.use {
                if (it.moveToFirst()) {
                    val id = it.getLong(it.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID))
                    return Uri.withAppendedPath(MediaStore.Files.getContentUri("external"), id.toString())
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "findMediaStoreUri failed for $filePath", e)
        }
        return null
    }

    @ReactMethod
    fun decodeToBase64(filePath: String, promise: Promise) {
        Thread {
            try {
                val pcmBytes = decodeToPcmBytes(filePath)
                if (pcmBytes != null && pcmBytes.isNotEmpty()) {
                    val base64 = encodeBase64Chunked(pcmBytes)
                    promise.resolve(base64)
                    return@Thread
                }
                // Fallback: send raw file bytes
                Log.w(TAG, "PCM decode failed for $filePath, falling back to raw file base64")
                val bytes = openFileBytes(filePath)
                if (bytes != null && bytes.isNotEmpty()) {
                    promise.resolve(Base64.encodeToString(bytes, Base64.NO_WRAP))
                } else {
                    promise.reject("DECODE_ERROR", "File does not exist or is empty: $filePath")
                }
            } catch (e: Exception) {
                try {
                    Log.w(TAG, "Decode exception for $filePath, trying raw file fallback", e)
                    val bytes = openFileBytes(filePath)
                    if (bytes != null && bytes.isNotEmpty()) {
                        promise.resolve(Base64.encodeToString(bytes, Base64.NO_WRAP))
                    } else {
                        promise.reject("DECODE_ERROR", "Failed to decode audio: ${e.message}", e)
                    }
                } catch (e2: Exception) {
                    promise.reject("DECODE_ERROR", "Failed to decode audio: ${e.message}", e)
                }
            }
        }.start()
    }

    private fun encodeBase64Chunked(bytes: ByteArray): String {
        return if (bytes.size <= 768 * 1024) {
            Base64.encodeToString(bytes, Base64.NO_WRAP)
        } else {
            val chunkSize = 768 * 1024
            val sb = StringBuilder((bytes.size * 4 / 3) + 4)
            var offset = 0
            while (offset < bytes.size) {
                val end = minOf(offset + chunkSize, bytes.size)
                sb.append(Base64.encodeToString(bytes.copyOfRange(offset, end), Base64.NO_WRAP))
                offset = end
            }
            sb.toString()
        }
    }

    @ReactMethod
    fun getFileBase64(filePath: String, promise: Promise) {
        Thread {
            try {
                val bytes = openFileBytes(filePath)
                if (bytes != null && bytes.isNotEmpty()) {
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    promise.resolve(base64)
                } else {
                    promise.reject("FILE_ERROR", "File does not exist or cannot be read: $filePath")
                }
            } catch (e: Exception) {
                promise.reject("FILE_ERROR", e.message, e)
            }
        }.start()
    }

    private fun decodeToPcmBytes(filePath: String): ByteArray? {
        // v42: Try direct path first, then ContentResolver
        val extractor = MediaExtractor()
        try {
            // Try direct file path
            try {
                val file = File(filePath)
                if (file.exists() && file.length() > 0L) {
                    extractor.setDataSource(filePath)
                } else {
                    throw Exception("File not accessible via path")
                }
            } catch (e: Exception) {
                // Try via ContentResolver
                val uri = if (filePath.startsWith("content://")) {
                    Uri.parse(filePath)
                } else {
                    findMediaStoreUri(filePath)
                }
                if (uri != null) {
                    extractor.setDataSource(reactContext, uri, null)
                } else {
                    Log.w(TAG, "MediaExtractor: Cannot open $filePath via any method")
                    extractor.release()
                    return null
                }
            }
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

    // ── CALL EVENTS (real-time capture; no call log access) ──

    @ReactMethod
    fun findCallInfoForTimestamp(timestampMs: Double, promise: Promise) {
        try {
            CallEventStore.init(reactApplicationContext)
            val event = CallEventStore.findNearest(timestampMs.toLong())
            if (event == null) {
                promise.resolve(null)
                return
            }
            val result = Arguments.createMap().apply {
                putString("phone", event.phone)
                putString("direction", event.direction)
                val name = event.phone?.let { PhoneUtil.lookupContactName(reactApplicationContext, it) }
                if (name != null) putString("contactName", name)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            Log.w(TAG, "findCallInfoForTimestamp failed", e)
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun hasCallScreeningRole(promise: Promise) {
        try {
            promise.resolve(RoleUtil.hasScreeningRole(reactApplicationContext))
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun isCallScreeningRoleAvailable(promise: Promise) {
        try {
            promise.resolve(RoleUtil.isScreeningRoleAvailable(reactApplicationContext))
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestCallScreeningRole(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No current activity to request role from")
                return
            }
            val started = RoleUtil.requestScreeningRole(activity)
            promise.resolve(started)
        } catch (e: Exception) {
            promise.reject("ROLE_REQUEST_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getRecentCallEvents(promise: Promise) {
        try {
            CallEventStore.init(reactApplicationContext)
            val arr = Arguments.createArray()
            CallEventStore.snapshot().forEach { ev ->
                arr.pushMap(Arguments.createMap().apply {
                    if (ev.phone != null) putString("phone", ev.phone) else putNull("phone")
                    putString("direction", ev.direction)
                    putDouble("callStartMs", ev.callStartMs.toDouble())
                    if (ev.callAnsweredMs != null) putDouble("callAnsweredMs", ev.callAnsweredMs!!.toDouble()) else putNull("callAnsweredMs")
                    if (ev.callEndMs != null) putDouble("callEndMs", ev.callEndMs!!.toDouble()) else putNull("callEndMs")
                    putString("source", ev.source)
                    putBoolean("finalized", ev.finalized)
                })
            }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("GET_EVENTS_FAILED", e.message, e)
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
            Log.d(TAG, "Starting BackgroundMonitorService...")
            BackgroundMonitorService.start(reactApplicationContext)
            
            reactApplicationContext.getSharedPreferences("kikocall_prefs", android.content.Context.MODE_PRIVATE)
                .edit()
                .putBoolean("monitoring_enabled", true)
                .apply()
            
            Log.d(TAG, "BackgroundMonitorService started successfully")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start BackgroundMonitorService", e)
            promise.reject("MONITOR_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopMonitorService(promise: Promise) {
        try {
            BackgroundMonitorService.stop(reactApplicationContext)
            reactApplicationContext.getSharedPreferences("kikocall_prefs", android.content.Context.MODE_PRIVATE)
                .edit()
                .putBoolean("monitoring_enabled", false)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MONITOR_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isMonitorRunning(promise: Promise) {
        promise.resolve(BackgroundMonitorService.isRunning)
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
        // v42: Play Store Compliance - always return true since we use Scoped Storage
        // (SAF folder picker + MediaStore + READ_MEDIA_AUDIO)
        promise.resolve(true)
    }

    @ReactMethod
    fun requestAllFilesAccess(promise: Promise) {
        // v42: No longer needed - we use SAF + MediaStore instead of MANAGE_EXTERNAL_STORAGE
        promise.resolve(true)
    }

    // ── SMS Retriever for Auto-Read OTP ──

    @ReactMethod
    fun startSmsRetriever(promise: Promise) {
        try {
            val client = SmsRetriever.getClient(reactApplicationContext)
            val task = client.startSmsRetriever()
            task.addOnSuccessListener {
                Log.d(TAG, "SMS Retriever started successfully")
                promise.resolve(true)
            }
            task.addOnFailureListener { e ->
                Log.e(TAG, "SMS Retriever failed to start", e)
                promise.reject("SMS_ERROR", "Failed to start SMS Retriever: ${e.message}", e)
            }
        } catch (e: Exception) {
            Log.e(TAG, "SMS Retriever exception", e)
            promise.reject("SMS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getAppSignatureHash(promise: Promise) {
        try {
            val hash = getAppSignatures()
            promise.resolve(hash)
        } catch (e: Exception) {
            promise.reject("HASH_ERROR", e.message, e)
        }
    }

    private fun getAppSignatures(): String {
        try {
            val packageName = reactApplicationContext.packageName
            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val signingInfo = reactApplicationContext.packageManager.getPackageInfo(
                    packageName, PackageManager.GET_SIGNING_CERTIFICATES
                ).signingInfo
                if (signingInfo != null) {
                    if (signingInfo.hasMultipleSigners()) {
                        signingInfo.apkContentsSigners
                    } else {
                        signingInfo.signingCertificateHistory
                    }
                } else {
                    emptyArray<android.content.pm.Signature>()
                }
            } else {
                @Suppress("DEPRECATION")
                reactApplicationContext.packageManager.getPackageInfo(
                    packageName, PackageManager.GET_SIGNATURES
                ).signatures
            }
            
            if (signatures != null) {
                for (sig in signatures) {
                    val hash = hash(packageName, sig.toByteArray())
                    if (hash != null) return hash
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "getAppSignatures failed", e)
        }
        return ""
    }

    private fun hash(packageName: String, signature: ByteArray): String? {
        val appInfo = "$packageName ${String(Base64.encode(signature, Base64.DEFAULT))}"
        try {
            val messageDigest = MessageDigest.getInstance("SHA-256")
            messageDigest.update(appInfo.toByteArray(Charsets.UTF_8))
            var hashSignature = messageDigest.digest()
            hashSignature = Arrays.copyOfRange(hashSignature, 0, 9)
            var base64Hash = Base64.encodeToString(hashSignature, Base64.NO_PADDING or Base64.NO_WRAP)
            base64Hash = base64Hash.substring(0, 11)
            return base64Hash
        } catch (e: Exception) {
            Log.e(TAG, "hash:NoSuchAlgorithm", e)
        }
        return null
    }

    // ── LOG EXPORT ──

    @ReactMethod
    fun exportAndShareLogs(promise: Promise) {
        Thread {
            try {
                val process = Runtime.getRuntime().exec("logcat -d")
                val bufferedReader = BufferedReader(InputStreamReader(process.inputStream))
                val logBuilder = StringBuilder()
                var line: String?
                while (bufferedReader.readLine().also { line = it } != null) {
                    logBuilder.append(line).append("\n")
                }
                
                val cacheDir = File(reactApplicationContext.cacheDir, "logs")
                cacheDir.mkdirs()
                val logFile = File(cacheDir, "KikoCall_Logs.txt")
                FileOutputStream(logFile).use { fos ->
                    fos.write(logBuilder.toString().toByteArray())
                }
                
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
