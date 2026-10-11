package com.lifeplanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (Intent.ACTION_BOOT_COMPLETED == action || "android.intent.action.QUICKBOOT_POWERON" == action) {
            Log.d("LifePlannerBoot", "Device reboot detected: alarm triggers active.")
        } else if (Intent.ACTION_TIMEZONE_CHANGED == action || Intent.ACTION_TIME_CHANGED == action) {
            Log.d("LifePlannerBoot", "Device time or timezone changed.")
        }
    }
}
