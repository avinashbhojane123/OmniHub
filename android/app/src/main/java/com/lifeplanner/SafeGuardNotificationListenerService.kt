package com.lifeplanner

import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class SafeGuardNotificationListenerService : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        try {
            val packageName = sbn.packageName ?: return
            // Ignore notifications produced by our own application
            if (packageName == applicationContext.packageName) return

            val extras = sbn.notification.extras
            val title = extras.getString("android.title") ?: ""
            val text = extras.getCharSequence("android.text")?.toString() ?: ""

            if (title.isBlank() && text.isBlank()) return

            // Broadcast notification event to React Native receiver or local listener
            val intent = Intent("com.safeguard.NOTIFICATION_RECEIVED").apply {
                putExtra("packageName", packageName)
                putExtra("title", title)
                putExtra("content", text)
                putExtra("timestamp", sbn.postTime)
                setPackage(applicationContext.packageName)
            }
            applicationContext.sendBroadcast(intent)
        } catch (e: Exception) {
            Log.e("SafeGuardNotification", "Error processing notification", e)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
    }
}
