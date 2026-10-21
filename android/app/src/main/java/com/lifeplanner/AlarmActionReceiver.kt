package com.lifeplanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

class AlarmActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        val alarmId = intent.getStringExtra("alarmId") ?: ""
        val title = intent.getStringExtra("title") ?: "Alarm Reminder"
        val description = intent.getStringExtra("description") ?: ""

        val notifId = intent.getIntExtra(
            "notificationId",
            if (alarmId.isNotEmpty()) (Math.abs(alarmId.hashCode()) % 90000 + 10000) else 99999
        )

        if ("com.lifeplanner.ACTION_STOP_ALARM" == action) {
            AlarmRingtoneModule.stopRingtone(context)
            try {
                NotificationManagerCompat.from(context).cancel(notifId)
            } catch (e: Exception) {
                e.printStackTrace()
            }

            // Auto-reschedule recurring habit alarm for tomorrow (+24 hours)
            if (alarmId.startsWith("alarm_habit_") || alarmId.contains("habit")) {
                val nextOccurrence = System.currentTimeMillis() + 24 * 60 * 60 * 1000L
                AlarmRingtoneModule.scheduleAlarm(
                    context = context,
                    alarmId = alarmId,
                    timestampMs = nextOccurrence,
                    title = title,
                    description = description,
                    persist = true
                )
            }
        } else if ("com.lifeplanner.ACTION_SNOOZE_ALARM" == action) {
            AlarmRingtoneModule.stopRingtone(context)
            try {
                NotificationManagerCompat.from(context).cancel(notifId)
            } catch (e: Exception) {
                e.printStackTrace()
            }

            // Reschedule alarm for 5 minutes later
            val snoozeTime = System.currentTimeMillis() + 5 * 60 * 1000L
            AlarmRingtoneModule.scheduleAlarm(
                context = context,
                alarmId = if (alarmId.isNotEmpty()) alarmId else "snooze_${System.currentTimeMillis()}",
                timestampMs = snoozeTime,
                title = title,
                description = if (description.isNotEmpty()) description else "Snoozed alarm ringing now!"
            )
        }
    }
}
