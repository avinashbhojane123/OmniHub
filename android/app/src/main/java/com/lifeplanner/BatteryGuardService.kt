package com.lifeplanner

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class BatteryGuardService : Service() {

    companion object {
        const val PREFS_NAME = "LifePlannerBatteryPrefs"
        const val CHANNEL_ID = "battery_monitor_channel"
        const val NOTIFICATION_ID = 2001

        const val ACTION_START = "com.lifeplanner.action.START_BATTERY_GUARD"
        const val ACTION_STOP = "com.lifeplanner.action.STOP_BATTERY_GUARD"
        const val ACTION_UPDATE_CONFIG = "com.lifeplanner.action.UPDATE_BATTERY_CONFIG"

        var isRunning = false
            private set
    }

    private var receiverRegistered = false
    private var hasTriggeredFullAlarm = false
    private var hasTriggered100Alarm = false
    private var hasTriggeredLowAlarm = false
    private var hasTriggeredCritical5Alarm = false
    private var hasTriggeredTempAlarm = false
    private var lastChargingState: Boolean? = null

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent == null) return
            val action = intent.action

            if (action == Intent.ACTION_POWER_DISCONNECTED) {
                // Charger unplugged: automatically stop ringing and reset charging alarms
                hasTriggeredFullAlarm = false
                hasTriggered100Alarm = false
                if (AlarmRingtoneModule.isPlaying && AlarmRingtoneModule.activeAlarmId?.startsWith("battery_") == true) {
                    AlarmRingtoneModule.stopRingtone(this@BatteryGuardService)
                }
            } else if (action == Intent.ACTION_POWER_CONNECTED) {
                hasTriggeredLowAlarm = false
                hasTriggeredCritical5Alarm = false
            }

            evaluateBatteryStatus(intent)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        if (action == ACTION_STOP) {
            stopForegroundService()
            return START_NOT_STICKY
        }

        startForegroundService()
        registerBatteryReceiver()
        return START_STICKY
    }

    private fun startForegroundService() {
        isRunning = true
        val notification = buildOngoingNotification(
            title = "⚡ Battery Guard Active",
            body = "Monitoring battery charge and temperature safety"
        )
        startForeground(NOTIFICATION_ID, notification)
    }

    private fun stopForegroundService() {
        isRunning = false
        unregisterBatteryReceiver()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun registerBatteryReceiver() {
        if (!receiverRegistered) {
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_BATTERY_CHANGED)
                addAction(Intent.ACTION_POWER_CONNECTED)
                addAction(Intent.ACTION_POWER_DISCONNECTED)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ContextCompat.registerReceiver(
                    this,
                    batteryReceiver,
                    filter,
                    ContextCompat.RECEIVER_NOT_EXPORTED
                )
            } else {
                registerReceiver(batteryReceiver, filter)
            }
            receiverRegistered = true
        }
    }

    private fun unregisterBatteryReceiver() {
        if (receiverRegistered) {
            try {
                unregisterReceiver(batteryReceiver)
            } catch (e: Exception) {}
            receiverRegistered = false
        }
    }

    private fun evaluateBatteryStatus(intent: Intent) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val guardActive = prefs.getBoolean("battery_guard_active", true)
        if (!guardActive) return

        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val batteryPct = if (level >= 0 && scale > 0) (level * 100) / scale else -1

        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                         status == BatteryManager.BATTERY_STATUS_FULL

        val chargePlug = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)
        val plugType = when (chargePlug) {
            BatteryManager.BATTERY_PLUGGED_AC -> "AC"
            BatteryManager.BATTERY_PLUGGED_USB -> "USB"
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "Wireless"
            else -> if (isCharging) "Plugged" else "Unplugged"
        }

        val tempTenths = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0)
        val temperature = tempTenths / 10.0 // Celsius

        // Update foreground notification display
        val fullTarget = prefs.getInt("battery_full_target", 80)
        val notifBody = if (isCharging) {
            "Charging via $plugType at $batteryPct% • Target: $fullTarget%"
        } else {
            "Battery: $batteryPct% • Guard active"
        }
        val notification = buildOngoingNotification(
            title = if (isCharging) "⚡ Battery Guard: $batteryPct% ($plugType)" else "🔋 Battery Guard Active",
            body = notifBody
        )
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, notification)

        // Reset state on charge change
        if (lastChargingState != null && lastChargingState != isCharging) {
            if (isCharging) {
                if (batteryPct >= fullTarget) {
                    hasTriggeredFullAlarm = true
                } else {
                    hasTriggeredFullAlarm = false
                }
                hasTriggered100Alarm = false
            } else {
                hasTriggeredLowAlarm = false
                hasTriggeredCritical5Alarm = false
            }
        }
        lastChargingState = isCharging

        val fullEnabled = prefs.getBoolean("battery_full_enabled", true)
        val overcharge100 = prefs.getBoolean("battery_overcharge_100", true)
        val lowEnabled = prefs.getBoolean("battery_low_enabled", true)
        val lowTarget = prefs.getInt("battery_low_target", 20)
        val critLow = prefs.getBoolean("battery_critical_low_5", true)
        val tempEnabled = prefs.getBoolean("battery_temp_enabled", true)
        val tempTarget = prefs.getInt("battery_temp_target", 42)
        val sound = prefs.getBoolean("battery_sound", true)
        val vibration = prefs.getBoolean("battery_vibration", true)

        // 1. Full Charge Alarm Check
        if (fullEnabled && isCharging && batteryPct >= fullTarget) {
            if (!hasTriggeredFullAlarm) {
                hasTriggeredFullAlarm = true
                triggerLoudAlarm(
                    alarmId = "battery_full",
                    title = "⚡ Battery $batteryPct% Charged!",
                    description = "Target reached ($fullTarget%). Unplug your charger to protect battery health.",
                    playSound = sound,
                    playVibe = vibration
                )
            }
        } else if (!isCharging || batteryPct < fullTarget) {
            hasTriggeredFullAlarm = false
        }

        // 2. Critical 100% Overcharge Failsafe Alarm
        if (overcharge100 && fullTarget < 100 && isCharging && batteryPct >= 100) {
            if (!hasTriggered100Alarm) {
                hasTriggered100Alarm = true
                triggerLoudAlarm(
                    alarmId = "battery_100",
                    title = "🚨 CRITICAL OVERCHARGE: 100% Full!",
                    description = "Phone reached 100%. Continuous trickle charge degrades battery. Unplug immediately!",
                    playSound = sound,
                    playVibe = vibration
                )
            }
        } else if (!isCharging || batteryPct < 100) {
            hasTriggered100Alarm = false
        }

        // 3. Low Battery Reminder
        if (lowEnabled && !isCharging && batteryPct <= lowTarget && batteryPct > 5) {
            if (!hasTriggeredLowAlarm) {
                hasTriggeredLowAlarm = true
                triggerLoudAlarm(
                    alarmId = "battery_low",
                    title = "🪫 Low Battery Alert ($batteryPct%)",
                    description = "Battery dropped to $batteryPct%. Please connect your charger to avoid shutdown.",
                    playSound = sound,
                    playVibe = vibration
                )
            }
        } else if (isCharging || batteryPct > lowTarget) {
            hasTriggeredLowAlarm = false
        }

        // 4. Critical 5% Discharge Alarm
        if (critLow && !isCharging && batteryPct <= 5 && batteryPct > 0) {
            if (!hasTriggeredCritical5Alarm) {
                hasTriggeredCritical5Alarm = true
                triggerLoudAlarm(
                    alarmId = "battery_crit5",
                    title = "🪫 CRITICAL 5% BATTERY!",
                    description = "Phone will shut down in seconds! Connect charger immediately.",
                    playSound = sound,
                    playVibe = vibration
                )
            }
        } else if (isCharging || batteryPct > 5) {
            hasTriggeredCritical5Alarm = false
        }

        // 5. Overheat Alarm Check
        if (tempEnabled && temperature >= tempTarget) {
            if (!hasTriggeredTempAlarm) {
                hasTriggeredTempAlarm = true
                triggerLoudAlarm(
                    alarmId = "battery_temp",
                    title = "🔥 High Battery Temperature (${String.format("%.1f", temperature)}°C)!",
                    description = "Battery is running hot ($temperature°C). Unplug charger and allow device to cool down.",
                    playSound = sound,
                    playVibe = vibration
                )
            }
        } else if (temperature < tempTarget - 2) {
            hasTriggeredTempAlarm = false
        }
    }

    private fun triggerLoudAlarm(
        alarmId: String,
        title: String,
        description: String,
        playSound: Boolean,
        playVibe: Boolean
    ) {
        // Play ringtone with alarm stream
        AlarmRingtoneModule.playRingtone(
            context = this,
            playAudio = playSound,
            playVibrate = playVibe,
            alarmId = alarmId,
            title = title,
            description = description
        )

        // Wake screen and launch AlarmAlertActivity
        try {
            val alertIntent = Intent(this, AlarmAlertActivity::class.java).apply {
                action = "com.lifeplanner.ACTION_ALARM_ALERT"
                putExtra("alarmId", alarmId)
                putExtra("alarmTitle", title)
                putExtra("alarmDescription", description)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            }
            startActivity(alertIntent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun buildOngoingNotification(title: String, body: String): android.app.Notification {
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_lock_idle_charging)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Battery Guard Background Monitor",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Ensures continuous battery tracking and threshold alarms while charging"
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterBatteryReceiver()
        isRunning = false
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
