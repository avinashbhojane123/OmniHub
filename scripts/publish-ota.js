const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const otaDir = path.resolve(__dirname, '../ota-release');
if (!fs.existsSync(otaDir)) {
  fs.mkdirSync(otaDir, { recursive: true });
}

console.log('[OTA] Compiling React Native Android bundle for instant OTA update...');
const startTime = Date.now();

try {
  execSync(
    'npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output ./ota-release/index.android.bundle --assets-dest ./ota-release/res/',
    {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    }
  );

  const bundlePath = path.join(otaDir, 'index.android.bundle');
  const stat = fs.statSync(bundlePath);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  const version = Date.now();
  const buildTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const versionPayload = {
    version,
    buildTime,
    sizeBytes: stat.size,
    sizeMb,
    bundleUrl: '/ota/index.android.bundle',
    notes: process.argv[2] || 'OTA update from Antigravity',
  };

  fs.writeFileSync(path.join(otaDir, 'version.json'), JSON.stringify(versionPayload, null, 2));

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n========================================================`);
  console.log(`⚡ [OTA SUCCESS] Bundle ready in ${durationSec}s!`);
  console.log(`📦 Version: ${version} (${sizeMb} MB)`);
  console.log(`🌐 Ready for instant download over hotspot!`);
  console.log(`========================================================\n`);
} catch (err) {
  console.error('[OTA ERROR] Failed to bundle for OTA:', err.message);
  process.exit(1);
}
