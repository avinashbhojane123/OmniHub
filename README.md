# OmniHub Suite & SafeGuard Family Platform

> **"Visible Protection. Responsible Parenting. Child Safety First."**

An enterprise-grade, ethical, transparent, and legally compliant Parental Control & Child Safety Platform unified directly into the OmniHub application suite.

---

## 🌟 Key Innovation: Single-APK Unified Role Switching

**No need to develop, distribute, or sideload a separate APK for parent and child!**

Both roles operate seamlessly inside this single application package:
- 👨‍👩‍👧 **Parent Dashboard Role**: Multi-child switcher, live GPS map & geofencing, screen time & app limits, 1-tap app blocking, call/SMS/notification activity feeds, AI keyword risk alert center, remote lock/unlock, and adaptive parental control levels.
- 🧒 **Child Safety Agent Role**: Transparent monitoring agent with persistent status disclosure, mandatory informed consent, Android permissions wizard (Usage Access, Notification Listener, Accessibility App Blocker, GPS Location), live digital wellbeing telemetry, live AI safety scanner test station, and full-screen remote lockdown overlay with Emergency SOS.
- 🔒 **PIN-Protected Mode Switching**: Switching from Child Agent back to Parent Dashboard requires the 4-digit Parent Security PIN (default `1234`), preventing unauthorized role tampering by children.

---

## 📂 System Architecture & Modules

```text
├── docs/
│   ├── architecture.md          # End-to-end architecture & single-APK design
│   ├── api-spec.md              # Complete REST API & WebSocket specifications
│   ├── erd.md                   # Database Entity-Relationship diagram
│   ├── compliance.md            # COPPA, GDPR-K, DPDP Act ethical compliance
│   └── deployment.md            # Docker, Kubernetes & cloud deployment guide
├── src/
│   ├── screens/safeguard/       # Unified SafeGuard screens (Parent & Child views)
│   │   ├── SafeGuardScreen.tsx       # Master role switcher & PIN modal container
│   │   ├── ParentDashboardView.tsx   # Parent telemetry, app blocker, GPS & risk hub
│   │   └── ChildAgentView.tsx        # Child agent, consent, permissions wizard & SOS
│   ├── services/safeguard/
│   │   ├── RiskDetectionEngine.ts    # AI Keyword Risk & Threat Scanner (6 categories)
│   │   ├── SafeGuardStore.ts         # Unified reactive state repository & command bus
│   │   └── SafeGuardNativeBridge.ts  # Native Android Kotlin module bridge & fallback
│   └── types/safeguard.ts            # Type-safe schemas and domain entities
├── android/app/src/main/java/com/lifeplanner/
│   ├── SafeGuardAgentModule.kt               # Native usage stats & permissions bridge
│   ├── SafeGuardAgentPackage.kt              # React Native package registration
│   ├── SafeGuardNotificationListenerService.kt# Android notification safety listener
│   └── SafeGuardAccessibilityService.kt      # Foreground app detector & blocker
├── server/                                   # NestJS Companion Backend
│   ├── prisma/schema.prisma                  # PostgreSQL schema with UUID keys
│   ├── src/modules/safeguard/                # Controller, service & risk engine
│   └── docker-compose.yml                    # Postgres + Redis + NestJS container stack
```

---

## 🚀 Quick Start Guide

### 1. Launching SafeGuard in the Mobile App
1. Start Metro:
   ```bash
   npm start
   ```
2. Run on Android:
   ```bash
   npm run android
   ```
3. Open the **OmniHub Workspace Switcher** on startup (or via Settings) and select **SafeGuard Family**.
4. Use the top header switcher pill (👨‍👩‍👧 `Parent` ⇄ 🧒 `Child`) to switch roles anytime.
   - Enter default PIN `1234` when switching from Child to Parent.

### 2. Running the Backend & Database (Docker)
```bash
docker-compose up -d postgres redis
cd server
npm install
npm run start:dev
```
The NestJS API will be available at `http://localhost:5000/api/v1`.

### 3. Running Unit Tests
```bash
npm test
```
Runs 100% passing tests including the new `RiskDetectionEngine.test.ts`.

---

## ⚖️ Ethical & Legal Compliance
- **Zero Hidden Surveillance**: Persistent foreground notification is mandatory.
- **Informed Consent**: Explicit explanation of what is protected and what remains private.
- **Data Minimization**: Raw personal conversation databases are never stored; only safety risk keywords generate alerts.
