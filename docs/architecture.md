# SafeGuard Family - System Architecture

## 1. Executive Summary

**SafeGuard Family** is an enterprise-grade, ethical, transparent, and legally compliant Parental Control & Child Safety Platform. Built on the principle of **"Visible Protection, Responsible Parenting, Child Safety First"**, the platform completely eliminates clandestine spyware mechanisms in favor of **full transparency, explicit informed consent, and Android platform-compliant system services**.

A key innovation in this implementation is the **Single-APK Unified Role Architecture**: both the **Parent Dashboard** and the **Child Safety Agent** exist within the same application package. Parents and children can switch roles seamlessly, protected by parental PIN authentication, eliminating the need to maintain, deploy, or sideload separate APKs.

---

## 2. High-Level Architectural Overview

```
+---------------------------------------------------------------------------------------------+
|                                    SINGLE MOBILE APPLICATION                                |
|                                   (React Native + Native Kotlin)                            |
|                                                                                             |
|  +-------------------------------------+             +-----------------------------------+  |
|  |           PARENT DASHBOARD          |   SWITCH    |        CHILD SAFETY AGENT         |  |
|  | - Multi-Child Selector              |<----------->| - Persistent Monitoring Banner    |  |
|  | - Live GPS Map & Geofencing Hub     |   (PIN      | - Mandatory Informed Consent      |  |
|  | - Screen Time & App Usage Graphs    |  Protected) | - Permission Wizard (Usage/Notif) |  |
|  | - Remote Device Controls (Lock/App) |             | - Foreground Telemetry Heartbeat  |  |
|  | - AI Keyword Risk Alert Feed        |             | - Live Keyword Safety Scanner     |  |
|  | - Calls, SMS & Notifications Feed   |             | - Lockdown Screen Overlay (Modal) |  |
|  +------------------+------------------+             +-----------------+-----------------+  |
|                     |                                                  |                    |
+---------------------|--------------------------------------------------|--------------------+
                      | HTTPS / WSS                                      | HTTPS / WSS
                      v                                                  v
+---------------------------------------------------------------------------------------------+
|                                  BACKEND API & REAL-TIME GATEWAY                             |
|                                         (NestJS + TypeScript)                               |
|                                                                                             |
|  +--------------------+  +--------------------+  +--------------------+  +---------------+  |
|  |    Auth & RBAC     |  |   Family Service   |  |   Device Control   |  |  Risk Engine  |  |
|  |    (JWT + Guard)   |  | (Code Pairing/Sync)|  | (Queue & Socket.IO)|  | (AI Scanning) |  |
|  +--------------------+  +--------------------+  +--------------------+  +---------------+  |
|  +--------------------+  +--------------------+  +--------------------+  +---------------+  |
|  |  Monitoring Sync   |  | Location & Geofence|  |    App Usage Logs  |  | Reports & BI  |  |
|  +--------------------+  +--------------------+  +--------------------+  +---------------+  |
+---------------------------------------------------------------------------------------------+
                                       |              |
                      +----------------+              +----------------+
                      v                                                v
+------------------------------------------+      +-------------------------------------------+
|          POSTGRESQL / SUPABASE           |      |                  REDIS 7                  |
|    (Relational Database via Prisma)      |      |     (Sessions, Cache & Socket Rooms)      |
+------------------------------------------+      +-------------------------------------------+
```

---

## 3. Single-APK Unified Role Architecture

### 3.1 The "Why"
Traditional parental control systems often distribute two distinct APKs: "Parent App" on Google Play Store and "Child Agent APK" via sideloading. This creates:
1. Double build overhead and dependency divergence.
2. Inconvenient device management for parents with multiple roles.
3. Confusion during pairing and family setup.

### 3.2 Switching & Protection Model
In SafeGuard Family, both personas coexist in the same bundle:
- **Role Selector & Switcher**: Easily accessible from the navigation header and OmniHub Workspace switcher.
- **Parental PIN Verification**: Switching from Child Agent back to Parent Dashboard requires the 4-digit Parent Security PIN (default `1234` or user-defined).
- **Persistent State**: The active role is persisted locally. When installed on the child's dedicated phone, Child Mode remains locked active.

---

## 4. End-to-End Data Flow

### 4.1 Remote Device Command Flow
```
[Parent Dashboard]                     [NestJS Backend Gateway]               [Child Safety Agent]
       |                                           |                                   |
       |--- POST /device-control/command --------->|                                   |
       |    { type: 'LOCK_DEVICE' }                |                                   |
       |                                           |--- WebSocket: device:command:new ->|
       |                                           |    (Room: device:{deviceId})       |
       |                                           |                                   |
       |                                           |                                   |-- Executes Action:
       |                                           |                                   |   Activates Fullscreen
       |                                           |                                   |   Lockdown Overlay
       |                                           |                                   |
       |                                           |<-- WebSocket: command:executed ---|
       |<-- WebSocket: command:status:updated -----|
```

### 4.2 Keyword Risk Detection Flow
```
[Child Device Event]              [Local AI Risk Scanner]             [Backend Risk Service]     [Parent Dashboard]
       |                                   |                                     |                       |
       |-- New Notification Captured ----->|                                     |                       |
       |   (Instagram: "I want to hurt...")|                                     |                       |
       |                                   |-- Match Keyword Dictionary          |                       |
       |                                   |   Category: SELF_HARM               |                       |
       |                                   |   Severity: CRITICAL                |                       |
       |                                   |                                     |                       |
       |                                   |--- POST /risk-alerts/analyze ------>|                       |
       |                                   |    (With redacted snippet & tags)   |                       |
       |                                   |                                     |--- Instant Push ----->|
       |                                   |                                     |    Alert Triggered    |
       |                                   |                                     |                       |-- Alert Badge & Siren
       |                                   |                                     |                       |   "Critical Risk Detected"
```

---

## 5. Security Architecture & Privacy Isolation

1. **Family Ownership Guard**: Every query ensures `family_id` matches the authenticated parent. Parents can never query devices from other families.
2. **Data Minimization**: Passwords, private encryption keys, and full unredacted conversation databases are never stored. Only notification snippets matching risk patterns or metadata headers are logged.
3. **Transparent Notification**: Android system requirements mandate an ongoing persistent notification (`SafeGuard Agent Active`) on the child device.
