const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const bundlePath = path.resolve(__dirname, '../ota-release/index.android.bundle');
if (!fs.existsSync(bundlePath)) {
  console.log('[OTA ADB] Bundle not found in ota-release. Compiling first...');
  execSync('npm run ota', { stdio: 'inherit' });
}

try {
  const devicesOutput = execSync('adb devices', { encoding: 'utf8' });
  const lines = devicesOutput.trim().split('\n').slice(1).filter(l => l.includes('device') && !l.includes('offline'));
  if (lines.length === 0) {
    console.error('\n❌ No Android device detected via ADB.');
    console.log('👉 Please plug in your phone via USB with "USB Debugging" enabled, or connect via Wi-Fi: adb connect <PHONE_IP>:5555');
    process.exit(1);
  }

  const deviceId = lines[0].split(/\s+/)[0];
  console.log(`\n📲 Pushing OTA bundle directly to Android device: ${deviceId}...`);

  // Push to temporary accessible directory
  execSync(`adb -s ${deviceId} push "${bundlePath}" /data/local/tmp/index.android.bundle`, { stdio: 'inherit' });

  // Move to app private files folder
  execSync(`adb -s ${deviceId} shell "run-as com.lifeplanner mkdir -p files/ota && run-as com.lifeplanner cp /data/local/tmp/index.android.bundle files/ota/index.android.bundle"`, { stdio: 'inherit' });

  // Update OTA settings key in SQLite if accessible or restart app
  console.log('🔄 Restarting app to load updated bundle...');
  execSync(`adb -s ${deviceId} shell am force-stop com.lifeplanner`, { stdio: 'inherit' });
  execSync(`adb -s ${deviceId} shell am start -n com.lifeplanner/.MainActivity`, { stdio: 'inherit' });

  console.log('\n========================================================');
  console.log('🎉 [SUCCESS] Updated bundle pushed and app restarted!');
  console.log('========================================================\n');
} catch (err) {
  console.error('[OTA ADB ERROR]:', err.message);
  process.exit(1);
}
