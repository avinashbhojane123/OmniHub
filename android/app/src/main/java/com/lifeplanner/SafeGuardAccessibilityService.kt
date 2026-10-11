package com.lifeplanner

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityEvent

class SafeGuardAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
            notificationTimeout = 100
        }
        serviceInfo = info
        Log.i("SafeGuardAccessibility", "Service Connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            val pkgName = event.packageName?.toString() ?: return
            if (pkgName == applicationContext.packageName) return

            // Broadcast window state change so child agent can evaluate app blocking rules
            val intent = Intent("com.safeguard.APP_FOREGROUND_CHANGED").apply {
                putExtra("packageName", pkgName)
                putExtra("className", event.className?.toString() ?: "")
                setPackage(applicationContext.packageName)
            }
            applicationContext.sendBroadcast(intent)
        }
    }

    override fun onInterrupt() {
        Log.w("SafeGuardAccessibility", "Service Interrupted")
    }
}
