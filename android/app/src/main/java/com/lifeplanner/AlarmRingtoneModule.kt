package com.lifeplanner

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class AlarmRingtoneModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AlarmRingtone"

    override fun initialize() {
        super.initialize()
        activeContext = reactContext
    }

    override fun invalidate() {
        super.invalidate()
        stop()
    }

    @Deprecated("Deprecated in Java/React Native")
    override fun onCatalystInstanceDestroy() {
        @Suppress("DEPRECATION")
        super.onCatalystInstanceDestroy()
        stop()
    }

    @Synchronized
    @ReactMethod
    fun play(playAudio: Boolean, playVibrate: Boolean) {
        playRingtone(reactContext, playAudio, playVibrate)
    }

    @Synchronized
    @ReactMethod
    fun stop() {
        stopRingtone(reactContext)
    }

    @ReactMethod
    fun scheduleExactAlarm(alarmId: String, timestampMs: Double, title: String, description: String, promise: Promise) {
        try {
            scheduleAlarm(reactContext, alarmId, timestampMs.toLong(), title, description)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SCHEDULE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelExactAlarm(alarmId: String, promise: Promise) {
        try {
            cancelAlarm(reactContext, alarmId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for React Native NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for React Native NativeEventEmitter
    }

    @ReactMethod
    fun openFullScreenSettings(promise: Promise) {
        try {
            // 1. Try MIUI specific Permissions Editor Activity
            try {
                val intent = Intent("miui.intent.action.APP_PERM_EDITOR").apply {
                    setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
                    putExtra("extra_pkgname", reactContext.packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
                promise.resolve(true)
                return
            } catch (miuiEx: Exception) {
                // Not MIUI or activity not found
            }

            // 2. Try Android 14+ USE_FULL_SCREEN_INTENT settings
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                try {
                    val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                        data = Uri.parse("package:" + reactContext.packageName)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    reactContext.startActivity(intent)
                    promise.resolve(true)
                    return
                } catch (a14Ex: Exception) {}
            }

            // 3. Fallback to standard Application Details Settings
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", reactContext.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openAutoStartSettings(promise: Promise) {
        try {
            // 1. Try MIUI AutoStart Management Activity
            try {
                val intent = Intent().apply {
                    setClassName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
                promise.resolve(true)
                return
            } catch (e: Exception) {}

            // 2. Fallback to application details
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", reactContext.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("AUTOSTART_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openBatterySaverSettings(promise: Promise) {
        try {
            // 1. Try MIUI PowerKeeper HiddenAppsConfigActivity
            try {
                val intent = Intent().apply {
                    setClassName("com.miui.powerkeeper", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity")
                    putExtra("package_name", reactContext.packageName)
                    putExtra("package_label", reactContext.applicationInfo.loadLabel(reactContext.packageManager).toString())
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
                promise.resolve(true)
                return
            } catch (e: Exception) {}

            // 2. Try Android standard battery optimization settings
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    reactContext.startActivity(intent)
                    promise.resolve(true)
                    return
                } catch (e: Exception) {}
            }

            // 3. Fallback to application details
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", reactContext.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BATTERY_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getRingingState(promise: Promise) {
        val map = Arguments.createMap()
        map.putBoolean("isRinging", isPlaying)
        map.putString("alarmId", activeAlarmId)
        map.putString("title", activeTitle)
        map.putString("description", activeDescription)
        promise.resolve(map)
    }

    companion object {
        private var activeContext: Context? = null
        private var mediaPlayer: MediaPlayer? = null
        private var fallbackRingtone: Ringtone? = null
        private var audioManager: AudioManager? = null
        private var focusRequest: AudioFocusRequest? = null
        private var wakeLock: PowerManager.WakeLock? = null
        private var screenWakeLock: PowerManager.WakeLock? = null
        private val handler = Handler(Looper.getMainLooper())
        private val autoStopRunnable = Runnable {
            stopRingtone(activeContext)
        }
        var isPlaying: Boolean = false
            private set
        var activeAlarmId: String? = null
            private set
        var activeTitle: String? = null
            private set
        var activeDescription: String? = null
            private set

        @Synchronized
        fun playRingtone(
            context: Context,
            playAudio: Boolean = true,
            playVibrate: Boolean = true,
            alarmId: String? = null,
            title: String? = null,
            description: String? = null
        ) {
            // Guard: If already playing this exact alarm, don't tear down and re-create
            if (isPlaying && activeAlarmId == alarmId && alarmId != null) {
                return
            }

            activeContext = context
            activeAlarmId = alarmId
            activeTitle = title
            activeDescription = description

            // Crucial: Pass notifyJs = false so internal cleanup doesn't prematurely kill JS alarm state
            stopRingtone(context, clearMetadata = false, notifyJs = false)
            emitAlarmState(true, alarmId, title, description)

            try {
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                // 1. Partial wake lock to keep CPU running and audio playing
                wakeLock = powerManager?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LifePlanner:AlarmWakeLock")?.apply {
                    setReferenceCounted(false)
                    acquire(65000L)
                }

                // 2. Bright screen wake lock with ACQUIRE_CAUSES_WAKEUP to forcefully turn the screen ON
                @Suppress("DEPRECATION")
                val screenFlags = PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE
                screenWakeLock = powerManager?.newWakeLock(screenFlags, "LifePlanner:AlarmScreenWakeLock")?.apply {
                    setReferenceCounted(false)
                    acquire(30000L) // Keep screen lit for 30s so user immediately sees which task is alarming
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }

            handler.removeCallbacks(autoStopRunnable)
            handler.postDelayed(autoStopRunnable, 60000L)

            var isAlarmMuted = false
            if (playAudio) {
                try {
                    requestAlarmAudioFocus(context)
                    audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                    audioManager?.let { am ->
                        val maxVol = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
                        val currentVol = am.getStreamVolume(AudioManager.STREAM_ALARM)
                        // If alarm volume is muted or <= 1, elevate to 75% so user actually hears the alarm!
                        if (currentVol <= 1) {
                            val safeVol = (maxVol * 0.75).toInt().coerceAtLeast(1)
                            am.setStreamVolume(AudioManager.STREAM_ALARM, safeVol, 0)
                        }
                    }

                    // Multi-tiered URI resolver for Xiaomi MIUI / HyperOS and standard Android
                    val candidateUris = listOfNotNull(
                        RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM),
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                        Settings.System.DEFAULT_ALARM_ALERT_URI,
                        RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE),
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                        Settings.System.DEFAULT_RINGTONE_URI,
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                    )

                    var started = false
                    for (uri in candidateUris) {
                        try {
                            mediaPlayer = MediaPlayer().apply {
                                setDataSource(context, uri)
                                setAudioAttributes(
                                    AudioAttributes.Builder()
                                        .setUsage(AudioAttributes.USAGE_ALARM)
                                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                        .build()
                                )
                                isLooping = true
                                prepare()
                                start()
                            }
                            isPlaying = true
                            started = true
                            break
                        } catch (mpEx: Exception) {
                            try {
                                fallbackRingtone = RingtoneManager.getRingtone(context, uri)
                                fallbackRingtone?.let { r ->
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                                        r.audioAttributes = AudioAttributes.Builder()
                                            .setUsage(AudioAttributes.USAGE_ALARM)
                                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                            .build()
                                    }
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                        r.isLooping = true
                                    }
                                    r.play()
                                    isPlaying = true
                                    started = true
                                }
                                if (started) break
                            } catch (rEx: Exception) {}
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            val shouldVibrate = playVibrate || (playAudio && isAlarmMuted)
            if (shouldVibrate) {
                try {
                    val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        val vibratorManager =
                            context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                        vibratorManager?.defaultVibrator
                    } else {
                        @Suppress("DEPRECATION")
                        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    }

                    vibrator?.let {
                        val pattern = longArrayOf(0, 800, 400, 800)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            it.vibrate(VibrationEffect.createWaveform(pattern, 0))
                        } else {
                            @Suppress("DEPRECATION")
                            it.vibrate(pattern, 0)
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        @Synchronized
        fun stopRingtone(context: Context? = null, clearMetadata: Boolean = true, notifyJs: Boolean = true) {
            handler.removeCallbacks(autoStopRunnable)
            try {
                screenWakeLock?.let {
                    if (it.isHeld) {
                        it.release()
                    }
                }
                screenWakeLock = null

                wakeLock?.let {
                    if (it.isHeld) {
                        it.release()
                    }
                }
                wakeLock = null
            } catch (e: Exception) {
                e.printStackTrace()
            }

            try {
                mediaPlayer?.let {
                    if (it.isPlaying) {
                        it.stop()
                    }
                    it.release()
                }
                mediaPlayer = null

                fallbackRingtone?.let {
                    if (it.isPlaying) {
                        it.stop()
                    }
                }
                fallbackRingtone = null
                isPlaying = false

                if (clearMetadata) {
                    activeAlarmId = null
                    activeTitle = null
                    activeDescription = null
                }

                abandonAlarmAudioFocus()

                val targetCtx = context ?: activeContext
                targetCtx?.let { ctx ->
                    val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        val vibratorManager =
                            ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                        vibratorManager?.defaultVibrator
                    } else {
                        @Suppress("DEPRECATION")
                        ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    }
                    vibrator?.cancel()
                }

                if (notifyJs) {
                    emitAlarmState(false)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        fun notifyAlarmTriggered(alarmId: String, title: String, description: String) {
            emitAlarmState(true, alarmId, title, description)
        }

        private fun emitAlarmState(isRinging: Boolean, alarmId: String? = null, title: String? = null, description: String? = null) {
            try {
                val reactCtx = activeContext as? ReactContext
                if (reactCtx != null && reactCtx.hasActiveReactInstance()) {
                    val params = Arguments.createMap().apply {
                        putBoolean("isRinging", isRinging)
                        putString("alarmId", alarmId ?: activeAlarmId ?: "")
                        putString("title", title ?: activeTitle ?: "")
                        putString("description", description ?: activeDescription ?: "")
                    }
                    reactCtx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        ?.emit("onAlarmRinging", params)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        private const val PREFS_NAME = "lifeplanner_scheduled_alarms"

        fun scheduleAlarm(
            context: Context,
            alarmId: String,
            timestampMs: Long,
            title: String,
            description: String,
            persist: Boolean = true
        ) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val intent = Intent(context, AlarmReceiver::class.java).apply {
                action = "com.lifeplanner.ALARM_TRIGGER"
                putExtra("alarmId", alarmId)
                putExtra("title", title)
                putExtra("description", description)
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                alarmId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val showIntent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_MAIN
                addCategory(Intent.CATEGORY_LAUNCHER)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("isAlarmTrigger", true)
                putExtra("alarmId", alarmId)
            }
            val showPendingIntent = PendingIntent.getActivity(
                context,
                (alarmId + "_show").hashCode(),
                showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    val alarmClockInfo = AlarmManager.AlarmClockInfo(timestampMs, showPendingIntent)
                    alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestampMs, pendingIntent)
                } else {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, timestampMs, pendingIntent)
                }
            } catch (e: Exception) {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        if (alarmManager.canScheduleExactAlarms()) {
                            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestampMs, pendingIntent)
                        } else {
                            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestampMs, pendingIntent)
                        }
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestampMs, pendingIntent)
                    } else {
                        alarmManager.setExact(AlarmManager.RTC_WAKEUP, timestampMs, pendingIntent)
                    }
                } catch (fallbackEx: Exception) {
                    fallbackEx.printStackTrace()
                }
            }

            if (persist) {
                try {
                    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    val json = org.json.JSONObject().apply {
                        put("alarmId", alarmId)
                        put("timestampMs", timestampMs)
                        put("title", title)
                        put("description", description)
                    }
                    prefs.edit().putString(alarmId, json.toString()).apply()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        fun cancelAlarm(context: Context, alarmId: String) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val intent = Intent(context, AlarmReceiver::class.java).apply {
                action = "com.lifeplanner.ALARM_TRIGGER"
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                alarmId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            try {
                alarmManager.cancel(pendingIntent)
            } catch (e: Exception) {
                e.printStackTrace()
            }

            try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit().remove(alarmId).apply()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        fun restoreAlarms(context: Context) {
            try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val all = prefs.all
                val now = System.currentTimeMillis()
                val editor = prefs.edit()
                for ((key, value) in all) {
                    try {
                        val jsonStr = value as? String ?: continue
                        val obj = org.json.JSONObject(jsonStr)
                        val ts = obj.optLong("timestampMs", 0L)
                        val alarmId = obj.optString("alarmId", key)
                        val title = obj.optString("title", "Alarm Reminder")
                        val desc = obj.optString("description", "")
                        if (ts > now) {
                            scheduleAlarm(context, alarmId, ts, title, desc, persist = false)
                        } else {
                            editor.remove(key)
                        }
                    } catch (e: Exception) {
                        editor.remove(key)
                    }
                }
                editor.apply()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        private fun requestAlarmAudioFocus(context: Context) {
            try {
                audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                audioManager?.let { am ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        val attrs = AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                            .setAudioAttributes(attrs)
                            .setOnAudioFocusChangeListener { focusChange ->
                                if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                                    // Only permanent loss (e.g. phone call active) stops the alarm
                                    stopRingtone(activeContext)
                                }
                            }
                            .build()
                        focusRequest = req
                        am.requestAudioFocus(req)
                    } else {
                        @Suppress("DEPRECATION")
                        am.requestAudioFocus(
                            { focusChange ->
                                if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                                    stopRingtone(activeContext)
                                }
                            },
                            AudioManager.STREAM_ALARM,
                            AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                        )
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        private fun abandonAlarmAudioFocus() {
            try {
                audioManager?.let { am ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        focusRequest?.let { req ->
                            am.abandonAudioFocusRequest(req)
                        }
                        focusRequest = null
                    } else {
                        @Suppress("DEPRECATION")
                        am.abandonAudioFocus(null)
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
