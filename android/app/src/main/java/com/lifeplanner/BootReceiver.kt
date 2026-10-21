package com.lifeplanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.d("LifePlannerBoot", "System broadcast received: $action. Restoring pending alarms...")
        try {
            AlarmRingtoneModule.restoreAlarms(context)
            Log.d("LifePlannerBoot", "Successfully restored alarms for action: $action")
        } catch (e: Exception) {
            Log.e("LifePlannerBoot", "Failed to restore alarms on $action", e)
        }
    }
}
