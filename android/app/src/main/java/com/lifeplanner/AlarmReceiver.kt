package com.lifeplanner

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val alarmId = intent.getStringExtra("alarmId") ?: "alarm_${System.currentTimeMillis()}"
        val title = intent.getStringExtra("title") ?: "Alarm"
        val description = intent.getStringExtra("description") ?: "Scheduled time reached!"

        // 1. Acquire WakeLock to turn screen on immediately if phone is sleeping/locked
        try {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val wakeLock = powerManager?.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "OmniHub:AlarmWakeLock"
            )
            wakeLock?.acquire(45000L) // 45 seconds wake-lock during ringing
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 2. Play native loud alarm ringtone & vibration immediately
        AlarmRingtoneModule.playRingtone(
            context = context,
            playAudio = true,
            playVibrate = true,
            alarmId = alarmId,
            title = title,
            description = description
        )

        // 3. Ensure Android Notification Channel exists with HIGH priority & lock-screen visibility
        val channelId = "alarm_clock_channel_v6"
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val existing = notificationManager.getNotificationChannel(channelId)
            if (existing == null) {
                val channel = NotificationChannel(
                    channelId,
                    "Alarm Clock Ringing",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    this.description = "Loud ringing alarms with vibration for your scheduled routines"
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 800, 400, 800)
                    lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
                    setBypassDnd(true)
                    val alarmUri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM)
                        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                        ?: android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI
                    setSound(
                        alarmUri,
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                }
                notificationManager.createNotificationChannel(channel)
            }
        }

        // 4. Full-Screen Intent targeting MainActivity
        val fullScreenIntent = Intent(context, MainActivity::class.java).apply {
            action = "com.lifeplanner.ACTION_ALARM_FULLSCREEN"
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            putExtra("isAlarmTrigger", true)
            putExtra("alarmId", alarmId)
            putExtra("alarmTitle", title)
            putExtra("alarmDescription", description)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            alarmId.hashCode(),
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Compute unique notification ID based on alarmId
        val notificationId = Math.abs(alarmId.hashCode()) % 90000 + 10000

        // 5. Method 2: Direct Lock-Screen Action Buttons (no unlock or PIN required)
        val snoozeIntent = Intent(context, AlarmActionReceiver::class.java).apply {
            action = "ACTION_SNOOZE"
            putExtra("alarmId", alarmId)
            putExtra("title", title)
            putExtra("description", description)
            putExtra("notificationId", notificationId)
        }
        val snoozePendingIntent = PendingIntent.getBroadcast(
            context,
            1,
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val dismissIntent = Intent(context, AlarmActionReceiver::class.java).apply {
            action = "ACTION_DISMISS"
            putExtra("alarmId", alarmId)
            putExtra("notificationId", notificationId)
        }
        val dismissPendingIntent = PendingIntent.getBroadcast(
            context,
            2,
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val smallIconRes = context.resources.getIdentifier("ic_notification", "drawable", context.packageName).let {
            if (it != 0) it else android.R.drawable.ic_lock_idle_alarm
        }

        val snoozeAction = NotificationCompat.Action.Builder(
            android.R.drawable.ic_lock_idle_alarm,
            "Snooze",
            snoozePendingIntent
        ).setAuthenticationRequired(false).build()

        val dismissAction = NotificationCompat.Action.Builder(
            android.R.drawable.ic_menu_close_clear_cancel,
            "Dismiss",
            dismissPendingIntent
        ).setAuthenticationRequired(false).build()

        // 6. Build High-Priority Full-Screen Lock-Screen Notification
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(smallIconRes)
            .setContentTitle("Alarm")
            .setContentText(if (title.isNotEmpty()) title else "Wake up!")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // Required to show on lock screen
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(fullScreenPendingIntent)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .addAction(snoozeAction)
            .addAction(dismissAction)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(notificationId, notification)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 7. Direct activity launch attempt
        try {
            context.startActivity(fullScreenIntent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
