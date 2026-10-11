# SafeGuard Family - Complete REST & Real-Time API Specification

**Base URL:** `http://localhost:5000/api/v1`  
**WebSocket URL:** `ws://localhost:5000/device-control`

---

## 1. Authentication Endpoints

### 1.1 Register User
- **Method:** `POST`
- **Route:** `/auth/register`
- **Request Body:**
```json
{
  "fullName": "Sarah Jenkins",
  "email": "sarah@example.com",
  "password": "StrongPassword123!",
  "role": "PARENT"
}
```
- **Response (201 Created):**
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "user": {
    "id": "u-451f28b4",
    "fullName": "Sarah Jenkins",
    "email": "sarah@example.com",
    "role": "PARENT"
  }
}
```

### 1.2 Login User
- **Method:** `POST`
- **Route:** `/auth/login`
- **Request Body:**
```json
{
  "email": "sarah@example.com",
  "password": "StrongPassword123!"
}
```

---

## 2. Family Management Endpoints

### 2.1 Create Family
- **Method:** `POST`
- **Route:** `/family/create`
- **Role:** `PARENT`
- **Response (201):**
```json
{
  "familyId": "fam-9021a",
  "familyCode": "SAFE-8492",
  "expiresAt": "2026-10-15T00:00:00.000Z"
}
```

### 2.2 Join Family (Child Pairing)
- **Method:** `POST`
- **Route:** `/family/join`
- **Role:** `CHILD`
- **Request Body:**
```json
{
  "familyCode": "SAFE-8492",
  "childName": "Emma Jenkins",
  "age": 14,
  "deviceName": "Samsung Galaxy A54",
  "androidVersion": "14"
}
```
- **Response (200):**
```json
{
  "success": true,
  "familyMemberId": "fm-1982b",
  "familyId": "fam-9021a",
  "controlLevel": "BALANCED"
}
```

### 2.3 Accept Informed Monitoring Consent
- **Method:** `POST`
- **Route:** `/family/accept-consent`
- **Role:** `CHILD`
- **Request Body:**
```json
{
  "familyMemberId": "fm-1982b",
  "consentAccepted": true
}
```

### 2.4 List Family Children
- **Method:** `GET`
- **Route:** `/family/children`
- **Role:** `PARENT`
- **Response (200):**
```json
[
  {
    "id": "child-01",
    "name": "Emma Jenkins",
    "age": 14,
    "controlLevel": "BALANCED",
    "consentAccepted": true,
    "device": {
      "id": "dev-01",
      "model": "Samsung Galaxy A54",
      "batteryLevel": 82,
      "isOnline": true,
      "lastSeen": "2026-10-10T18:30:00Z"
    }
  }
]
```

---

## 3. App Usage & Device Activity Endpoints

### 3.1 Synchronize App Usage
- **Method:** `POST`
- **Route:** `/app-usage/sync`
- **Role:** `CHILD`
- **Request Body:**
```json
{
  "deviceId": "dev-01",
  "date": "2026-10-10",
  "logs": [
    {
      "packageName": "com.instagram.android",
      "appName": "Instagram",
      "durationSeconds": 4820,
      "openCount": 18
    },
    {
      "packageName": "com.google.android.youtube",
      "appName": "YouTube",
      "durationSeconds": 6120,
      "openCount": 9
    }
  ]
}
```

### 3.2 Get Daily Usage Summary
- **Method:** `GET`
- **Route:** `/app-usage/child/:childId/daily?date=2026-10-10`
- **Role:** `PARENT`

---

## 4. Location & Geofencing Endpoints

### 4.1 Push Live GPS Location
- **Method:** `POST`
- **Route:** `/location/update`
- **Role:** `CHILD`
- **Request Body:**
```json
{
  "deviceId": "dev-01",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "accuracy": 8.4,
  "batteryLevel": 82,
  "address": "Market St, San Francisco, CA"
}
```

### 4.2 Get Child Live Location
- **Method:** `GET`
- **Route:** `/location/:childId/live`
- **Role:** `PARENT`

### 4.3 Create Geofence (Safe/Unsafe Zone)
- **Method:** `POST`
- **Route:** `/geofence/create`
- **Role:** `PARENT`
- **Request Body:**
```json
{
  "childId": "child-01",
  "name": "High School Campus",
  "latitude": 37.779,
  "longitude": -122.418,
  "radiusMeters": 250,
  "type": "SAFE"
}
```

---

## 5. Remote Device Controls Endpoints

### 5.1 Send Command to Child Device
- **Method:** `POST`
- **Route:** `/device-control/command`
- **Role:** `PARENT`
- **Request Body:**
```json
{
  "childId": "child-01",
  "commandType": "LOCK_DEVICE",
  "payload": {
    "reason": "Bedtime restriction",
    "durationMinutes": 480
  }
}
```

### 5.2 Block / Unblock App
- **Method:** `POST`
- **Route:** `/device-control/block-app`
- **Role:** `PARENT`
- **Request Body:**
```json
{
  "childId": "child-01",
  "packageName": "com.zhiliaoapp.musically",
  "appName": "TikTok",
  "isBlocked": true
}
```

---

## 6. AI Keyword Risk Detection & Alerts

### 6.1 Analyze Text / Notification for Risks
- **Method:** `POST`
- **Route:** `/risk-alerts/analyze`
- **Role:** `CHILD` (or Local Gateway)
- **Request Body:**
```json
{
  "deviceId": "dev-01",
  "appName": "WhatsApp",
  "source": "NOTIFICATION",
  "content": "Don't tell your mom where we are meeting tonight"
}
```
- **Response (200):**
```json
{
  "riskDetected": true,
  "category": "ONLINE_GROOMING",
  "severity": "CRITICAL",
  "matchedKeywords": ["meeting tonight", "don't tell"],
  "alertId": "alert-8910"
}
```

---

## 7. Real-Time WebSocket Events Catalog

Namespace: `/device-control`

| Direction | Event Name | Payload Summary |
|---|---|---|
| Server -> Child | `device:command:new` | Remote command dispatch (`LOCK_DEVICE`, `BLOCK_APP`, etc.) |
| Server -> Child | `rules:app-block:update` | Array of blocked package names |
| Server -> Child | `geofence:update` | Active safe/unsafe zone radii |
| Child -> Server | `device:status:heartbeat` | Battery, network state, timestamp |
| Child -> Server | `device:location:live` | Real-time GPS coordinates stream |
| Child -> Server | `device:alert:risk` | Instant notification of detected risk keyword |
| Server -> Parent | `parent:alert:push` | Immediate UI banner & sound trigger on parent app |
