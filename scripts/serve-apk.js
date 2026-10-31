const http = require('http');
const fs = require('fs');
const path = require('path');

const os = require('os');

const PORT = 8888;
const apkPath = path.resolve(__dirname, '../android/app/build/outputs/apk/debug/app-debug.apk');

if (!fs.existsSync(apkPath)) {
  console.warn('[NOTICE] APK file not found at:', apkPath);
  console.warn('[NOTICE] Web APK download is unavailable until built, but OTA bundle updates are fully active.');
}

const server = http.createServer((req, res) => {
  // Handle OTA version endpoint
  if (req.url === '/ota/version' || req.url === '/ota/version.json') {
    const otaVersionPath = path.resolve(__dirname, '../ota-release/version.json');
    if (fs.existsSync(otaVersionPath)) {
      const data = fs.readFileSync(otaVersionPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
      return;
    }
    res.writeHead(404, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: 'No OTA version published yet' }));
    return;
  }

  // Handle OTA bundle download endpoint
  if (req.url === '/ota/index.android.bundle' || req.url.startsWith('/ota/bundle')) {
    let bundleFile = path.resolve(__dirname, '../ota-release/index.android.bundle');
    if (!fs.existsSync(bundleFile)) {
      bundleFile = path.resolve(__dirname, '../android/app/src/main/assets/index.android.bundle');
    }

    if (fs.existsSync(bundleFile)) {
      const stat = fs.statSync(bundleFile);
      console.log(`[OTA] Serving OTA bundle to ${req.socket.remoteAddress} (Size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB)...`);
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      fs.createReadStream(bundleFile).pipe(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('OTA bundle not found');
    return;
  }

  if (req.url === '/app-debug.apk' || req.url === '/download') {
    if (!fs.existsSync(apkPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('APK file not found. Build it with: npm run bundle:android && cd android && gradlew assembleDebug');
      return;
    }

    const stat = fs.statSync(apkPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    console.log(`[HTTP] Serving APK to ${req.socket.remoteAddress} (Size: ${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const file = fs.createReadStream(apkPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="OmniHub.apk"',
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="OmniHub.apk"',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(apkPath).pipe(res);
    }
    return;
  }

  // Mobile landing page
  const apkExists = fs.existsSync(apkPath);
  const stat = apkExists ? fs.statSync(apkPath) : null;
  const sizeMb = stat ? (stat.size / (1024 * 1024)).toFixed(1) : 'N/A';
  const buildDate = stat ? new Date(stat.mtime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending Build';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Install OmniHub</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      margin: 0;
      padding: 32px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 90vh;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 24px;
      padding: 36px 24px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .icon {
      font-size: 54px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 24px;
      font-weight: 800;
      margin: 0 0 8px 0;
      background: linear-gradient(135deg, #a78bfa, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p {
      color: #94a3b8;
      font-size: 14px;
      margin: 0 0 24px 0;
      line-height: 1.5;
    }
    .badge {
      display: inline-block;
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 12px;
      margin-bottom: 24px;
    }
    .btn {
      display: block;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      text-decoration: none;
      font-size: 17px;
      font-weight: 700;
      padding: 16px 24px;
      border-radius: 16px;
      box-shadow: 0 10px 20px rgba(99, 102, 241, 0.4);
      transition: transform 0.15s ease;
    }
    .btn:active {
      transform: scale(0.97);
    }
    .meta {
      margin-top: 24px;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🚀</div>
    <h1>OmniHub</h1>
    <div class="badge">Latest Build Ready</div>
    <p>Hotspot direct install with lock-screen alarm wake up and Google Sheets cloud sync.</p>
    <a href="/download" class="btn">📥 Install OmniHub APK (${sizeMb} MB)</a>
    <div class="meta">Built at ${buildDate} • Fast local hotspot transfer</div>
  </div>
</body>
</html>`;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  console.log(`\n========================================================`);
  console.log(`⚡ [HOTSPOT / OTA SERVER ACTIVE] Listening on port ${PORT}`);
  console.log(`📡 Access from Android phone using:`);
  if (addresses.length > 0) {
    addresses.forEach((ip) => console.log(`   👉 http://${ip}:${PORT}`));
  } else {
    console.log(`   👉 http://127.0.0.1:${PORT}`);
  }
  console.log(`========================================================\n`);
});
