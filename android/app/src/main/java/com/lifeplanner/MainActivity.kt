package com.lifeplanner

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    applyLockScreenFlags()
    super.onCreate(null)
    handleAlarmIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    applyLockScreenFlags()
    handleAlarmIntent(intent)
  }

  override fun onResume() {
    super.onResume()
    applyLockScreenFlags()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    applyLockScreenFlags()
  }

  private fun handleAlarmIntent(intent: Intent?) {
    if (intent?.getBooleanExtra("isAlarmTrigger", false) == true) {
      val alarmId = intent.getStringExtra("alarmId") ?: ""
      val title = intent.getStringExtra("alarmTitle") ?: "Alarm"
      val description = intent.getStringExtra("alarmDescription") ?: ""
      AlarmRingtoneModule.notifyAlarmTriggered(alarmId, title, description)
    }
  }

  private fun applyLockScreenFlags() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      window.statusBarColor = android.graphics.Color.TRANSPARENT
      window.navigationBarColor = android.graphics.Color.parseColor("#0B081E")
    }
    @Suppress("DEPRECATION")
    window.addFlags(
      WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
      WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
      WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
    )
  }

  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    val action = event.action
    val keyCode = event.keyCode
    if (keyCode == android.view.KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == android.view.KeyEvent.KEYCODE_VOLUME_UP) {
      if (AlarmRingtoneModule.isPlaying && action == android.view.KeyEvent.ACTION_DOWN) {
        AlarmRingtoneModule.stopRingtone(this)
        return true
      }
    }
    return super.dispatchKeyEvent(event)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "LifePlanner"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
