package com.lifeplanner

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import com.facebook.react.bridge.*
import java.util.Locale

class SafeGuardAgentModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SafeGuardAgentModule"

    @ReactMethod
    fun hasUsageStatsPermission(promise: Promise) {
        try {
            val appOps = reactContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    reactContext.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    reactContext.packageName
                )
            }
            promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
        } catch (e: Exception) {
            promise.reject("USAGE_STATS_ERROR", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun openUsageStatsSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun hasNotificationListenerPermission(promise: Promise) {
        try {
            val flat = Settings.Secure.getString(
                reactContext.contentResolver,
                "enabled_notification_listeners"
            )
            val pkgName = reactContext.packageName
            val enabled = flat != null && flat.contains(pkgName)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("NOTIF_PERMISSION_ERROR", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun openNotificationListenerSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun isAccessibilityServiceEnabled(promise: Promise) {
        try {
            val enabledServices = Settings.Secure.getString(
                reactContext.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: ""
            val expectedService = "${reactContext.packageName}/${SafeGuardAccessibilityService::class.java.canonicalName}"
            promise.resolve(enabledServices.contains(expectedService))
        } catch (e: Exception) {
            promise.reject("ACCESSIBILITY_CHECK_ERROR", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun getInstalledApplications(promise: Promise) {
        try {
            val pm = reactContext.packageManager
            val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            val appList = Arguments.createArray()

            for (app in packages) {
                // Filter out standard internal system APKs that don't have launcher intents
                val isSystem = (app.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                val launchIntent = pm.getLaunchIntentForPackage(app.packageName)
                if (launchIntent != null || !isSystem) {
                    val map = Arguments.createMap().apply {
                        putString("packageName", app.packageName)
                        putString("appName", pm.getApplicationLabel(app).toString())
                        putBoolean("isSystemApp", isSystem)
                    }
                    appList.pushMap(map)
                }
            }
            promise.resolve(appList)
        } catch (e: Exception) {
            promise.reject("INSTALLED_APPS_ERROR", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun getDeviceHardwareInfo(promise: Promise) {
        try {
            val map = Arguments.createMap().apply {
                putString("brand", Build.BRAND.replaceFirstChar { it.uppercase(Locale.ROOT) })
                putString("model", Build.MODEL)
                putString("device", Build.DEVICE)
                putString("androidVersion", Build.VERSION.RELEASE)
                putInt("sdkInt", Build.VERSION.SDK_INT)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("HARDWARE_INFO_ERROR", e.localizedMessage, e)
        }
    }
}
