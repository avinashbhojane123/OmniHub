package com.lifeplanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class DeviceBatteryModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceBattery"

    private var receiverRegistered = false

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent == null) return
            val action = intent.action
            if (action == Intent.ACTION_BATTERY_CHANGED ||
                action == Intent.ACTION_POWER_CONNECTED ||
                action == Intent.ACTION_POWER_DISCONNECTED) {
                sendBatteryUpdate()
            }
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        stopMonitoring()
    }

    private fun getBatteryData(): WritableMap {
        val map = Arguments.createMap()
        val ifilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus: Intent? = reactContext.registerReceiver(null, ifilter)

        if (batteryStatus != null) {
            val level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            val batteryPct = if (level >= 0 && scale > 0) (level * 100) / scale else -1

            val status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                             status == BatteryManager.BATTERY_STATUS_FULL

            val chargePlug = batteryStatus.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)
            val plugType = when (chargePlug) {
                BatteryManager.BATTERY_PLUGGED_AC -> "AC"
                BatteryManager.BATTERY_PLUGGED_USB -> "USB"
                BatteryManager.BATTERY_PLUGGED_WIRELESS -> "Wireless"
                else -> if (isCharging) "Plugged" else "Unplugged"
            }

            val statusString = when (status) {
                BatteryManager.BATTERY_STATUS_CHARGING -> "Charging"
                BatteryManager.BATTERY_STATUS_FULL -> "Full"
                BatteryManager.BATTERY_STATUS_DISCHARGING -> "Discharging"
                BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "Not Charging"
                else -> "Unknown"
            }

            val health = batteryStatus.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN)
            val healthString = when (health) {
                BatteryManager.BATTERY_HEALTH_GOOD -> "Good"
                BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheat"
                BatteryManager.BATTERY_HEALTH_DEAD -> "Dead"
                BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over Voltage"
                BatteryManager.BATTERY_HEALTH_COLD -> "Cold"
                else -> "Unknown"
            }

            val tempTenths = batteryStatus.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0)
            val temperature = tempTenths / 10.0 // tenths of a degree Celsius e.g. 370 -> 37.0 C

            val voltage = batteryStatus.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0) // mV e.g. 3964
            val technology = batteryStatus.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY) ?: "Li-poly"
            val present = batteryStatus.getBooleanExtra(BatteryManager.EXTRA_PRESENT, true)

            map.putInt("level", batteryPct)
            map.putBoolean("isCharging", isCharging)
            map.putString("chargingType", plugType)
            map.putString("status", statusString)
            map.putString("health", healthString)
            map.putDouble("temperature", temperature)
            map.putInt("voltage", voltage)
            map.putString("technology", technology)
            map.putBoolean("present", present)
        } else {
            map.putInt("level", 50)
            map.putBoolean("isCharging", false)
            map.putString("chargingType", "Unplugged")
            map.putString("status", "Unknown")
            map.putString("health", "Unknown")
            map.putDouble("temperature", 25.0)
            map.putInt("voltage", 3800)
            map.putString("technology", "Li-ion")
            map.putBoolean("present", true)
        }
        return map
    }

    @ReactMethod
    fun getBatteryInfo(promise: Promise) {
        try {
            promise.resolve(getBatteryData())
        } catch (e: Exception) {
            promise.reject("BATTERY_ERROR", e.message)
        }
    }

    private fun sendBatteryUpdate() {
        if (reactContext.hasActiveReactInstance()) {
            val data = getBatteryData()
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("BatteryStatusChanged", data)
        }
    }

    @ReactMethod
    fun startMonitoring() {
        if (!receiverRegistered) {
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_BATTERY_CHANGED)
                addAction(Intent.ACTION_POWER_CONNECTED)
                addAction(Intent.ACTION_POWER_DISCONNECTED)
            }
            reactContext.registerReceiver(batteryReceiver, filter)
            receiverRegistered = true
        }
        sendBatteryUpdate()
    }

    @ReactMethod
    fun stopMonitoring() {
        if (receiverRegistered) {
            try {
                reactContext.unregisterReceiver(batteryReceiver)
            } catch (e: Exception) {}
            receiverRegistered = false
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
