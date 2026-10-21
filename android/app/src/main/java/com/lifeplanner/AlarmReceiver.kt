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
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val alarmId = intent.getStringExtra("alarmId") ?: "alarm_${System.currentTimeMillis()}"
        val title = intent.getStringExtra("title") ?: "Alarm Reminder"
        val description = intent.getStringExtra("description") ?: "Scheduled time reached!"

        // 1. Play native loud alarm ringtone immediately
        AlarmRingtoneModule.playRingtone(
            context = context,
            playAudio = true,
            playVibrate = true,
            alarmId = alarmId,
            title = title,
            description = description
        )

        // 2. Ensure Android Notification Channel exists
        val channelId = "alarm_clock_channel_v5"
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

        // 3. Intents for MainActivity (content & full-screen)
        val fullScreenIntent = Intent(context, MainActivity::class.java).apply {
            action = "com.lifeplanner.ACTION_ALARM_FULLSCREEN"
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
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

        // Compute unique notification ID based on alarmId to prevent overwriting
        val notificationId = Math.abs(alarmId.hashCode()) % 90000 + 10000

        // 4. Intent for Stop Alarm
        val stopIntent = Intent(context, AlarmActionReceiver::class.java).apply {
            action = "com.lifeplanner.ACTION_STOP_ALARM"
            putExtra("alarmId", alarmId)
            putExtra("notificationId", notificationId)
        }
        val stopPendingIntent = PendingIntent.getBroadcast(
            context,
            (alarmId + "_stop").hashCode(),
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // 5. Intent for Snooze Alarm
        val snoozeIntent = Intent(context, AlarmActionReceiver::class.java).apply {
            action = "com.lifeplanner.ACTION_SNOOZE_ALARM"
            putExtra("alarmId", alarmId)
            putExtra("title", title)
            putExtra("description", description)
            putExtra("notificationId", notificationId)
        }
        val snoozePendingIntent = PendingIntent.getBroadcast(
            context,
            (alarmId + "_snooze").hashCode(),
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // 6. Build persistent full-screen alarm notification
        val smallIconRes = context.resources.getIdentifier("ic_notification", "drawable", context.packageName).let {
            if (it != 0) it else android.R.drawable.ic_lock_idle_alarm
        }

        val stopAction = NotificationCompat.Action.Builder(0, "🔕 STOP ALARM", stopPendingIntent)
            .setAuthenticationRequired(false)
            .build()

        val snoozeAction = NotificationCompat.Action.Builder(0, "💤 SNOOZE (5m)", snoozePendingIntent)
            .setAuthenticationRequired(false)
            .build()

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(smallIconRes)
            .setContentTitle("⏰ Alarm: $title")
            .setContentText(description)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(fullScreenPendingIntent)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .addAction(stopAction)
            .addAction(snoozeAction)

        try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build())
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 7. Directly start MainActivity if device allows
        try {
            context.startActivity(fullScreenIntent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
