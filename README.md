# OmniHub (LifePlanner & Battery Guard)

An integrated productivity and device care suite for Android built with React Native, TypeScript, and SQLite.

---

## 🚀 Workspaces

1. **LifePlanner & Tasks**:
   - Comprehensive task management with recurring schedules, priority matrix, categories, and due dates.
   - Habit tracking with streak analytics and daily habit logs.
   - Google Keep-style rich notes with color labels, pinning, and archive support.
   - Local Calendar timeline view and conflict detection.
   - Automated local alarm triggers and notification scheduling.
   - Encrypted local backup and restore (JSON export/import).

2. **Battery Guard & Alarm**:
   - Real-time battery telemetry (level, charging state, temperature, voltage, health).
   - Eco-charge threshold alarm (80% battery protector).
   - Anti-overcharge continuous alarm with foreground service.
   - Low battery warning and overheating alerts.
   - Custom ringtone player via native Android audio integration.

---

## 🛠️ Technology Stack

- **Framework**: React Native 0.87.1 (Android)
- **Language**: TypeScript 6.0
- **Database**: SQLite via `@op-engineering/op-sqlite`
- **Navigation**: React Navigation v7 (Native Stack & Bottom Tabs)
- **Notifications & Alarms**: `@notifee/react-native` + Native Android AlarmManager & Foreground Service
- **Testing**: Jest with 100% passing test suites

---

## 📦 Getting Started

### Prerequisites
- Node.js >= 22.11.0
- Android SDK & Java 17+
- Android device or emulator

### Installation
```bash
npm install
```

### Running Locally
```bash
# Start Metro bundler
npm start

# Run on connected Android device/emulator
npm run android
```

### Running Unit Tests & Linter
```bash
# Run unit test suites
npm test

# Run ESLint static analysis
npm run lint

# TypeScript verification
npx tsc --noEmit
```

### Building & Deploying to Physical Device
```bash
# Bundle production JS assets
npm run bundle:android

# Build and deploy over USB or Wi-Fi
node scripts/deploy.js

# Deploy specifically to a Wi-Fi ADB device IP:Port
node scripts/deploy.js 10.220.190.164:5555
```

---

## 🔄 Rollback Instructions

If you need to roll back any changes:

1. **Revert working directory changes to the last clean git commit**:
   ```bash
   git checkout HEAD -- .
   ```
2. **Re-install dependencies**:
   ```bash
   npm install
   ```
3. **Re-generate assets**:
   ```bash
   npm run bundle:android
   ```
4. **Re-run tests**:
   ```bash
   npm test
   ```
