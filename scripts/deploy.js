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
      try {
        const state = execSync(`adb -s ${parts[0]} get-state`, { encoding: 'utf8', timeout: 3000 }).trim();
        if (state === 'device') {
          devices.push(parts[0]);
        }
      } catch { }
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
    } catch { }
    devices = getDevices();
  }

  if (devices.length === 0) {
    console.error('Error: No Android device connected via USB or Wi-Fi. Connect via USB or specify IP: node scripts/deploy.js <IP:5555>');
    process.exit(1);
  }

  const explicitTarget = (targetIp && devices.includes(targetIp)) ? targetIp : null;
  const usbDevice = devices.find((d) => !d.includes(':5555'));
  const target = explicitTarget || usbDevice || devices.find((d) => d.includes(':5555')) || devices[0];
  console.log(`Targeting device: ${target} (available: ${devices.join(', ')})`);

  const apkPath = path.resolve(__dirname, '../android/app/build/outputs/apk/debug/app-debug.apk');
  const bundlePath = path.resolve(__dirname, '../android/app/src/main/assets/index.android.bundle');
  const forceRebuild = process.argv.includes('--rebuild');

  console.log('Bundling latest React Native assets...');
  run('npm run bundle:android');

  const isBundleNewer = fs.existsSync(bundlePath) && fs.existsSync(apkPath) && fs.statSync(bundlePath).mtimeMs > fs.statSync(apkPath).mtimeMs;

  if (!fs.existsSync(apkPath) || isBundleNewer || forceRebuild) {
    console.log('Rebuilding debug APK with latest assets...');
    const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    run(`cd android && ${gradlewCmd} assembleDebug && cd ..`);
  }

  let installed = false;
  const candidates = [target, ...devices.filter(d => d !== target)];
  for (const dev of candidates) {
    try {
      console.log(`Attempting installation on ${dev}...`);
      try {
        run(`adb -s ${dev} reverse tcp:8081 tcp:8081`);
      } catch { }
      try {
        run(`adb -s ${dev} shell am force-stop com.lifeplanner`);
      } catch { }
      run(`adb -s ${dev} install -r "${apkPath}"`);
      run(`adb -s ${dev} shell am start -n com.lifeplanner/.MainActivity`);
      console.log(`Deployed successfully to ${dev}!`);
      installed = true;
      break;
    } catch (err) {
      console.warn(`Installation on ${dev} failed: ${err.message}. Trying next candidate...`);
    }
  }

  if (!installed) {
    throw new Error('Failed to install APK on all available devices');
  }
} catch (e) {
  console.error('Deployment failed:', e.message);
  process.exit(1);
}
