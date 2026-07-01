package com.kikocall

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import cl.json.ShareApplication

class MainApplication : Application(), ReactApplication, ShareApplication {

  // react-native-share resolves file:// paths through the authority returned here
  // (see RNSharePathUtil.compileAuthorities). Point it at the app's own FileProvider
  // (com.kikocall.provider / @xml/provider_paths) which whitelists external-files, files
  // and cache dirs, so generated PDF receipts/reports can be shared without the
  // "Failed to find configured root" NPE.
  override fun getFileProviderAuthority(): String = "$packageName.provider"

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(com.kikocall.native_modules.RecordingMonitorPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
