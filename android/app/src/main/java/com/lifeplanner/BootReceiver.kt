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

        try {
            val prefs = context.getSharedPreferences(BatteryGuardService.PREFS_NAME, Context.MODE_PRIVATE)
            val guardActive = prefs.getBoolean("battery_guard_active", true)
            if (guardActive) {
                val serviceIntent = Intent(context, BatteryGuardService::class.java).apply {
                    this.action = BatteryGuardService.ACTION_START
                }
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
                Log.d("LifePlannerBoot", "Restored BatteryGuardService on boot")
            }
        } catch (e: Exception) {
            Log.e("LifePlannerBoot", "Failed to start BatteryGuardService on boot", e)
        }
    }
}
