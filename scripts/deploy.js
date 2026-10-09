const { execSync } = require('child_process');

function run(cmd) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: 'inherit' });
}

function getDevices() {
  const output = execSync('adb devices', { encoding: 'utf8' });
  const lines = output.trim().split('\n').slice(1);
  const devices = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === 'device') {
      devices.push(parts[0]);
    }
  }
  return devices;
}

const fs = require('fs');
const path = require('path');

const targetIp = process.env.DEVICE_IP || process.argv[2];

try {
  let devices = getDevices();
  if (devices.length === 0 && targetIp) {
    console.log(`No devices found, trying adb connect ${targetIp}...`);
    try {
      execSync(`adb connect ${targetIp.includes(':') ? targetIp : targetIp + ':5555'}`, { stdio: 'inherit' });
    } catch {}
    devices = getDevices();
  }

  if (devices.length === 0) {
    console.error('Error: No Android device connected via USB or Wi-Fi. Connect via USB or specify IP: node scripts/deploy.js <IP:5555>');
    process.exit(1);
  }

  // Prefer wireless device if available, otherwise USB device
  const target = devices.find((d) => d.includes(':5555')) || devices[0];
  console.log(`Targeting device: ${target}`);

  const apkPath = path.resolve(__dirname, '../android/app/build/outputs/apk/debug/app-debug.apk');
  if (!fs.existsSync(apkPath)) {
    console.log('APK not found. Building debug APK first...');
    const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    run(`cd android && ${gradlewCmd} assembleDebug && cd ..`);
  }

  try {
    run(`adb -s ${target} reverse tcp:8081 tcp:8081`);
  } catch {}
  run(`adb -s ${target} install -r "${apkPath}"`);
  run(`adb -s ${target} shell am start -n com.lifeplanner/.MainActivity`);
  console.log('Deployed successfully!');
} catch (e) {
  console.error('Deployment failed:', e.message);
  process.exit(1);
}
