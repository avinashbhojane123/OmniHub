package com.lifeplanner

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

import java.io.File

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    val otaBundleFile = File(applicationContext.filesDir, "ota/index.android.bundle")
    val customBundlePath = if (otaBundleFile.exists() && otaBundleFile.length() > 50000L) {
      otaBundleFile.absolutePath
    } else {
      null
    }

    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(AlarmRingtonePackage())
          add(DeviceBatteryPackage())
          add(OTAPackage())
        },
      jsBundleFilePath = customBundlePath,
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
