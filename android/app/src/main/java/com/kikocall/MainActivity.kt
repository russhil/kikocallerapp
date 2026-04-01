package com.kikocall

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.kikocall.native_modules.RecordingMonitorModule

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "KikoCall"

  /**
   * Prevent react-native-screens crash: "Screen fragments should never be restored."
   * See: https://github.com/software-mansion/react-native-screens/issues/17
   */
  override fun onCreate(savedInstanceState: Bundle?) {
      super.onCreate(null)
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == RecordingMonitorModule.FOLDER_PICKER_REQUEST_CODE) {
      if (resultCode == Activity.RESULT_OK && data != null) {
        val treeUri: Uri? = data.data
        if (treeUri != null) {
          // Persist permission so we can access it across reboots
          contentResolver.takePersistableUriPermission(
            treeUri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION
          )
          val path = treeUri.path ?: treeUri.toString()
          // Convert SAF tree URI path to a real filesystem path if possible
          // e.g. /tree/primary:Recordings/Call Recordings -> /storage/emulated/0/Recordings/Call Recordings
          val realPath = convertTreeUriToPath(treeUri)
          RecordingMonitorModule.pendingFolderPickerPromise?.resolve(realPath ?: path)
          RecordingMonitorModule.pendingFolderPickerPromise = null
        } else {
          RecordingMonitorModule.pendingFolderPickerPromise?.reject("PICKER_ERROR", "No URI returned")
          RecordingMonitorModule.pendingFolderPickerPromise = null
        }
      } else {
        RecordingMonitorModule.pendingFolderPickerPromise?.reject("PICKER_CANCELLED", "Folder picker cancelled")
        RecordingMonitorModule.pendingFolderPickerPromise = null
      }
    }
  }

  private fun convertTreeUriToPath(uri: Uri): String? {
    return try {
      // SAF URI path looks like: /tree/primary:Recordings%2FCall%20Recordings
      val rawPath = uri.path ?: return null
      // Extract the doc part: after "primary:" or "XXXX-XXXX:" for SD card
      val colonIdx = rawPath.indexOf(':')
      if (colonIdx == -1) return null
      val volume = rawPath.substring(rawPath.lastIndexOf('/') + 1, colonIdx)
      val relativePath = java.net.URLDecoder.decode(rawPath.substring(colonIdx + 1), "UTF-8")
      if (volume.equals("primary", ignoreCase = true)) {
        "/storage/emulated/0/$relativePath"
      } else {
        "/storage/$volume/$relativePath"
      }
    } catch (e: Exception) {
      null
    }
  }
}
