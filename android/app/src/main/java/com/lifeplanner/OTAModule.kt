package com.lifeplanner

import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class OTAModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "OTAModule"

    @ReactMethod
    fun getOTAStatus(promise: Promise) {
        try {
            val otaFile = File(reactContext.filesDir, "ota/index.android.bundle")
            val map = Arguments.createMap().apply {
                putBoolean("hasCustomBundle", otaFile.exists() && otaFile.length() > 50000L)
                putDouble("bundleSize", if (otaFile.exists()) otaFile.length().toDouble() else 0.0)
                putDouble("lastModified", if (otaFile.exists()) otaFile.lastModified().toDouble() else 0.0)
                putString("bundlePath", otaFile.absolutePath)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("OTA_STATUS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun downloadOTABundle(downloadUrl: String, promise: Promise) {
        Thread {
            try {
                val otaDir = File(reactContext.filesDir, "ota")
                if (!otaDir.exists()) {
                    otaDir.mkdirs()
                }

                val tempFile = File(otaDir, "index.android.bundle.tmp")
                val finalFile = File(otaDir, "index.android.bundle")

                val url = URL(downloadUrl)
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 15000
                conn.readTimeout = 45000
                conn.requestMethod = "GET"
                conn.connect()

                if (conn.responseCode != HttpURLConnection.HTTP_OK) {
                    promise.reject("DOWNLOAD_ERROR", "Server returned HTTP ${conn.responseCode}: ${conn.responseMessage}")
                    return@Thread
                }

                conn.inputStream.use { input ->
                    FileOutputStream(tempFile).use { output ->
                        input.copyTo(output)
                    }
                }

                if (!tempFile.exists() || tempFile.length() < 50000L) {
                    tempFile.delete()
                    promise.reject("CORRUPT_BUNDLE", "Downloaded bundle is too small or corrupt (${tempFile.length()} bytes)")
                    return@Thread
                }

                // Atomic rename
                if (finalFile.exists()) {
                    finalFile.delete()
                }
                val renamed = tempFile.renameTo(finalFile)
                if (!renamed) {
                    tempFile.copyTo(finalFile, overwrite = true)
                    tempFile.delete()
                }

                val result = Arguments.createMap().apply {
                    putBoolean("success", true)
                    putDouble("size", finalFile.length().toDouble())
                    putDouble("modified", finalFile.lastModified().toDouble())
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("DOWNLOAD_FAILED", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun revertToEmbedded(promise: Promise) {
        try {
            val otaFile = File(reactContext.filesDir, "ota/index.android.bundle")
            var deleted = false
            if (otaFile.exists()) {
                deleted = otaFile.delete()
            }
            promise.resolve(deleted)
        } catch (e: Exception) {
            promise.reject("REVERT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun restartApp(promise: Promise) {
        try {
            val pm = reactContext.packageManager
            val intent = pm.getLaunchIntentForPackage(reactContext.packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                reactContext.startActivity(intent)
                promise.resolve(true)
                Runtime.getRuntime().exit(0)
            } else {
                reactContext.currentActivity?.recreate()
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("RESTART_ERROR", e.message, e)
        }
    }
}
