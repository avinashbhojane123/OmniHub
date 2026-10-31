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

        if ("com.lifeplanner.ACTION_STOP_ALARM" == action || "ACTION_DISMISS" == action || "ACTION_STOP" == action) {
            AlarmRingtoneModule.stopRingtone(context)
            try {
                NotificationManagerCompat.from(context).cancel(notifId)
            } catch (e: Exception) {
                e.printStackTrace()
            }

            // Auto-reschedule recurring habit alarm for tomorrow without drift
            if (alarmId.startsWith("alarm_habit_") || alarmId.contains("habit")) {
                var targetMs: Long = 0L
                try {
                    val prefs = context.getSharedPreferences("lifeplanner_scheduled_alarms", Context.MODE_PRIVATE)
                    val jsonStr = prefs.getString(alarmId, null)
                    if (jsonStr != null) {
                        val obj = org.json.JSONObject(jsonStr)
                        val prevTs = obj.optLong("timestampMs", 0L)
                        if (prevTs > 0L) {
                            val cal = java.util.Calendar.getInstance().apply {
                                timeInMillis = prevTs
                                add(java.util.Calendar.DAY_OF_YEAR, 1)
                            }
                            val now = System.currentTimeMillis()
                            while (cal.timeInMillis <= now) {
                                cal.add(java.util.Calendar.DAY_OF_YEAR, 1)
                            }
                            targetMs = cal.timeInMillis
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }

                if (targetMs <= 0L) {
                    val cal = java.util.Calendar.getInstance().apply {
                        add(java.util.Calendar.DAY_OF_YEAR, 1)
                        set(java.util.Calendar.SECOND, 0)
                        set(java.util.Calendar.MILLISECOND, 0)
                    }
                    targetMs = cal.timeInMillis
                }

                AlarmRingtoneModule.scheduleAlarm(
                    context = context,
                    alarmId = alarmId,
                    timestampMs = targetMs,
                    title = title,
                    description = description,
                    persist = true
                )
            }
        } else if ("com.lifeplanner.ACTION_SNOOZE_ALARM" == action || "ACTION_SNOOZE" == action) {
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
