package com.lifeplanner.terabox

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.os.Build
import android.util.Rational
import android.view.WindowManager
import com.facebook.react.bridge.*

class TeraBoxPlayerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TeraBoxPlayerModule"

    @ReactMethod
    fun isPiPSupported(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val hasPip = reactContext.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
                promise.resolve(hasPip)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun enterPiP(aspectRatioWidth: Int, aspectRatioHeight: Int, promise: Promise) {
        val activity: Activity? = currentActivity
        if (activity == null) {
            promise.reject("ACTIVITY_NULL", "Activity is not available")
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val w = if (aspectRatioWidth > 0) aspectRatioWidth else 16
                val h = if (aspectRatioHeight > 0) aspectRatioHeight else 9
                // Android requires rational numerator/denominator within [0.418410, 2.390000]
                val safeRatio = Rational(w, h)
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(safeRatio)
                    .build()
                val entered = activity.enterPictureInPictureMode(params)
                promise.resolve(entered)
            } catch (e: Exception) {
                promise.reject("PIP_ERROR", "Failed to enter Picture-in-Picture mode: ${e.message}")
            }
        } else {
            promise.reject("UNSUPPORTED", "PiP requires Android 8.0 (API 26) or higher")
        }
    }

    @ReactMethod
    fun setOrientation(orientation: String) {
        val activity: Activity? = currentActivity ?: return
        activity.runOnUiThread {
            when (orientation.lowercase()) {
                "landscape" -> activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                "portrait" -> activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                "sensor" -> activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR
                "unspecified" -> activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                else -> activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_USER
            }
        }
    }

    @ReactMethod
    fun setKeepScreenOn(enabled: Boolean) {
        val activity: Activity? = currentActivity ?: return
        activity.runOnUiThread {
            if (enabled) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }
}

