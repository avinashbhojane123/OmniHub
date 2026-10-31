package com.lifeplanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
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
        val batteryStatus: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(null, ifilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactContext.registerReceiver(null, ifilter)
        }

        val bm = reactContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager

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

            // Read live current & compute real-time charging wattage dynamically
            var currentNow = 0
            if (bm != null) {
                try {
                    val rawCurrent = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
                    if (rawCurrent != Int.MIN_VALUE && rawCurrent != 0) {
                        val absVal = Math.abs(rawCurrent)
                        // If current exceeds 10,000, value is reported in microamperes (uA), divide by 1000 to get mA
                        currentNow = if (absVal > 10000) absVal / 1000 else absVal
                    }
                } catch (e: Exception) {}
            }

            val rawWattage = if (isCharging && currentNow > 0 && voltage > 0) {
                (voltage.toDouble() * currentNow.toDouble()) / 1000000.0
            } else {
                0.0
            }
            // Clamp anomalous sensor readings to realistic max charger capabilities (120W)
            val wattage = if (rawWattage > 120.0) 0.0 else Math.round(rawWattage * 10.0) / 10.0

            // Native hardware charge time remaining (Android 9+)
            var chargeTimeRemainingMs: Double = -1.0
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && bm != null && isCharging) {
                try {
                    val remainingMs = bm.computeChargeTimeRemaining()
                    if (remainingMs > 0) {
                        chargeTimeRemainingMs = remainingMs.toDouble()
                    }
                } catch (e: Exception) {}
            }

            // Real Battery Cycle Count (Android 14+)
            var cycleCount = -1
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && bm != null) {
                try {
                    val propField = BatteryManager::class.java.getField("BATTERY_PROPERTY_CYCLE_COUNT")
                    val propId = propField.getInt(null)
                    cycleCount = bm.getIntProperty(propId)
                } catch (e: Exception) {
                    try {
                        cycleCount = bm.getIntProperty(7)
                    } catch (e2: Exception) {}
                }
            }

            // Real Capacity in mAh (Charge Counter in uAh)
            var capacityMah = -1
            if (bm != null) {
                try {
                    val chargeCounter = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER)
                    if (chargeCounter > 0) {
                        capacityMah = chargeCounter / 1000
                    }
                } catch (e: Exception) {}
            }

            map.putInt("level", batteryPct)
            map.putBoolean("isCharging", isCharging)
            map.putString("chargingType", plugType)
            map.putString("status", statusString)
            map.putString("health", healthString)
            map.putDouble("temperature", temperature)
            map.putInt("voltage", voltage)
            map.putInt("currentNow", currentNow)
            map.putDouble("wattage", wattage)
            map.putString("technology", technology)
            map.putBoolean("present", present)
            map.putDouble("chargeTimeRemainingMs", chargeTimeRemainingMs)
            map.putInt("cycleCount", cycleCount)
            map.putInt("capacityMah", capacityMah)
        } else {
            // Query actual live capacity from BatteryManager without fake mock values
            val realLevel = if (bm != null) bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) else 0
            map.putInt("level", if (realLevel in 0..100) realLevel else 0)
            map.putBoolean("isCharging", false)
            map.putString("chargingType", "Unplugged")
            map.putString("status", "Unknown")
            map.putString("health", "Unknown")
            map.putDouble("temperature", 0.0)
            map.putInt("voltage", 0)
            map.putInt("currentNow", 0)
            map.putDouble("wattage", 0.0)
            map.putString("technology", "Li-ion")
            map.putBoolean("present", true)
            map.putDouble("chargeTimeRemainingMs", -1.0)
            map.putInt("cycleCount", -1)
            map.putInt("capacityMah", -1)
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ContextCompat.registerReceiver(
                    reactContext,
                    batteryReceiver,
                    filter,
                    ContextCompat.RECEIVER_NOT_EXPORTED
                )
            } else {
                reactContext.registerReceiver(batteryReceiver, filter)
            }
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
    fun syncSettings(settings: ReadableMap, promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences(
                BatteryGuardService.PREFS_NAME,
                Context.MODE_PRIVATE
            )
            val editor = prefs.edit()

            if (settings.hasKey("batteryGuardActive")) {
                editor.putBoolean("battery_guard_active", settings.getBoolean("batteryGuardActive"))
            }
            if (settings.hasKey("fullChargeAlarmEnabled")) {
                editor.putBoolean("battery_full_enabled", settings.getBoolean("fullChargeAlarmEnabled"))
            }
            if (settings.hasKey("fullChargeTarget")) {
                editor.putInt("battery_full_target", settings.getInt("fullChargeTarget"))
            }
            if (settings.hasKey("overchargeFailsafeEnabled")) {
                editor.putBoolean("battery_overcharge_100", settings.getBoolean("overchargeFailsafeEnabled"))
            }
            if (settings.hasKey("lowBatteryAlarmEnabled")) {
                editor.putBoolean("battery_low_enabled", settings.getBoolean("lowBatteryAlarmEnabled"))
            }
            if (settings.hasKey("lowBatteryTarget")) {
                editor.putInt("battery_low_target", settings.getInt("lowBatteryTarget"))
            }
            if (settings.hasKey("criticalLowAlarmEnabled")) {
                editor.putBoolean("battery_critical_low_5", settings.getBoolean("criticalLowAlarmEnabled"))
            }
            if (settings.hasKey("tempAlarmEnabled")) {
                editor.putBoolean("battery_temp_enabled", settings.getBoolean("tempAlarmEnabled"))
            }
            if (settings.hasKey("tempTarget")) {
                editor.putInt("battery_temp_target", settings.getInt("tempTarget"))
            }
            if (settings.hasKey("soundEnabled")) {
                editor.putBoolean("battery_sound", settings.getBoolean("soundEnabled"))
            }
            if (settings.hasKey("vibrationEnabled")) {
                editor.putBoolean("battery_vibration", settings.getBoolean("vibrationEnabled"))
            }
            editor.apply()

            // If guard active, ensure native background service is running
            val guardActive = prefs.getBoolean("battery_guard_active", true)
            if (guardActive) {
                startNativeBackgroundService()
            } else {
                stopNativeBackgroundService()
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SYNC_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startNativeBackgroundService() {
        try {
            val intent = Intent(reactContext, BatteryGuardService::class.java).apply {
                action = BatteryGuardService.ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun stopNativeBackgroundService() {
        try {
            val intent = Intent(reactContext, BatteryGuardService::class.java).apply {
                action = BatteryGuardService.ACTION_STOP
            }
            reactContext.startService(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
