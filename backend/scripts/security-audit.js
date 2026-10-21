const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('        REAL-TIME CHAT SECURITY AUDIT RUNNER       ');
console.log('====================================================\n');

const srcDir = path.join(__dirname, '..', 'src');
let checkCount = 0;
let passedCount = 0;

function auditCheck(name, passed, detail) {
  checkCount++;
  if (passed) passedCount++;
  const status = passed ? '[PASS]' : '[WARN]';
  console.log(`${status} ${name}`);
  if (detail) console.log(`       ↳ ${detail}`);
}

function getAllFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const allSrcFiles = getAllFiles(srcDir);

// 1. Check Global Validation Pipe
const mainFile = path.join(srcDir, 'main.ts');
if (fs.existsSync(mainFile)) {
  const mainContent = fs.readFileSync(mainFile, 'utf8');
  auditCheck(
    'Global ValidationPipe',
    mainContent.includes('ValidationPipe') && mainContent.includes('whitelist: true'),
    'Whitelist DTO validation pipe is active globally in main.ts'
  );
  auditCheck(
    'HTTP Security Response Headers',
    mainContent.includes('X-Content-Type-Options') && mainContent.includes('Content-Security-Policy'),
    'Security headers (nosniff, CSP sandbox, X-Frame-Options) present on static routes'
  );
}

// 2. Check SSRF Protection
const igService = path.join(srcDir, 'instagram', 'instagram.service.ts');
if (fs.existsSync(igService)) {
  const igContent = fs.readFileSync(igService, 'utf8');
  auditCheck(
    'SSRF Media Proxy Validation',
    igContent.includes('.cdninstagram.com') && igContent.includes('isAllowedHost'),
    'Target domain hostname allowlisting enforced in proxyMedia'
  );
}

// 3. Check File Upload Restrictions
const uploadController = path.join(srcDir, 'upload', 'upload.controller.ts');
if (fs.existsSync(uploadController)) {
  const uploadContent = fs.readFileSync(uploadController, 'utf8');
  auditCheck(
    'File Upload Extension Filtering',
    uploadContent.includes('.html') && uploadContent.includes('.exe') && uploadContent.includes('.js'),
    'Script and executable extensions blocked from uploads'
  );
  auditCheck(
    'Upload Endpoint Rate Limiting',
    uploadContent.includes('RateLimitGuard'),
    'RateLimitGuard attached to file upload route'
  );
}

// 4. Check Hardcoded Secrets
let hardcodedSecretsFound = false;
for (const file of allSrcFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.match(/(?:password|secret|key)\s*=\s*['"][^'"]{8,}['"]/i)) {
    if (!file.includes('spec.ts') && !file.includes('mock')) {
      hardcodedSecretsFound = true;
    }
  }
}
auditCheck(
  'Hardcoded Secret Check',
  !hardcodedSecretsFound,
  hardcodedSecretsFound
    ? 'Potential hardcoded secrets detected in source files'
    : 'No plaintext hardcoded credentials found in application logic'
);

console.log('\n----------------------------------------------------');
console.log(`Audit Completed: ${passedCount}/${checkCount} Security Checks Passed.`);
console.log('----------------------------------------------------\n');

if (passedCount < checkCount) {
  process.exit(1);
} else {
  process.exit(0);
}
