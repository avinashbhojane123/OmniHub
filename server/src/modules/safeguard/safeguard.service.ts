import { Injectable } from '@nestjs/common';
import { RiskEngineService } from './risk-engine.service';

@Injectable()
export class SafeGuardService {
  constructor(private readonly riskEngine: RiskEngineService) {}

  // In-memory persistent database store for fast standalone execution
  private families: any[] = [
    {
      id: 'fam-demo',
      parentId: 'user-parent-1',
      familyCode: 'SAFE-8492',
      codeExpiresAt: new Date(Date.now() + 86400000 * 30),
      createdAt: new Date(),
    },
  ];

  private members: any[] = [
    {
      id: 'child-emma',
      familyId: 'fam-demo',
      displayName: 'Emma Jenkins',
      age: 14,
      controlLevel: 'BALANCED',
      consentAccepted: true,
      consentAcceptedAt: new Date(),
      screenTimeMinutesToday: 195,
      screenTimeLimitMinutes: 240,
    },
    {
      id: 'child-liam',
      familyId: 'fam-demo',
      displayName: 'Liam Jenkins',
      age: 9,
      controlLevel: 'STRICT',
      consentAccepted: true,
      consentAcceptedAt: new Date(),
      screenTimeMinutesToday: 95,
      screenTimeLimitMinutes: 120,
    },
  ];

  private devices: any[] = [
    {
      id: 'dev-emma-01',
      familyMemberId: 'child-emma',
      deviceName: "Emma's Galaxy A54",
      brand: 'Samsung',
      model: 'Galaxy A54',
      androidVersion: 'Android 14',
      batteryLevel: 78,
      isOnline: true,
      isLocked: false,
      lastSeenAt: new Date(),
    },
    {
      id: 'dev-liam-02',
      familyMemberId: 'child-liam',
      deviceName: "Liam's Tablet",
      brand: 'Lenovo',
      model: 'Tab M10 Plus',
      androidVersion: 'Android 13',
      batteryLevel: 42,
      isOnline: true,
      isLocked: false,
      lastSeenAt: new Date(),
    },
  ];

  private appUsageLogs: any[] = [];
  private commands: any[] = [];
  private riskAlerts: any[] = [];
  private geofences: any[] = [
    {
      id: 'geo-home',
      familyMemberId: 'child-emma',
      name: 'Home Sanctuary',
      latitude: 37.7749,
      longitude: -122.4194,
      radiusMeters: 150,
      type: 'SAFE',
      isActive: true,
    },
    {
      id: 'geo-school',
      familyMemberId: 'child-emma',
      name: 'Lincoln High School',
      latitude: 37.7812,
      longitude: -122.4287,
      radiusMeters: 300,
      type: 'SAFE',
      isActive: true,
    },
  ];

  public createFamily(parentId: string) {
    const familyCode = 'SAFE-' + Math.floor(1000 + Math.random() * 9000);
    const fam = {
      id: `fam-${Date.now()}`,
      parentId,
      familyCode,
      codeExpiresAt: new Date(Date.now() + 86400000 * 30),
      createdAt: new Date(),
    };
    this.families.push(fam);
    return fam;
  }

  public joinFamily(code: string, childName: string, age: number, deviceModel: string) {
    const family = this.families.find((f) => f.familyCode === code);
    if (!family) {
      throw new Error('Invalid or expired family code.');
    }

    const memberId = `child-${Date.now()}`;
    const newMember = {
      id: memberId,
      familyId: family.id,
      displayName: childName,
      age,
      controlLevel: age < 10 ? 'STRICT' : age < 15 ? 'BALANCED' : 'LIGHT',
      consentAccepted: false,
      screenTimeMinutesToday: 0,
      screenTimeLimitMinutes: 180,
    };
    this.members.push(newMember);

    const deviceId = `dev-${Date.now()}`;
    const newDev = {
      id: deviceId,
      familyMemberId: memberId,
      deviceName: `${childName}'s Device`,
      brand: 'Android',
      model: deviceModel || 'Smartphone',
      androidVersion: '14',
      batteryLevel: 100,
      isOnline: true,
      isLocked: false,
      lastSeenAt: new Date(),
    };
    this.devices.push(newDev);

    return {
      familyMemberId: memberId,
      deviceId,
      familyId: family.id,
      controlLevel: newMember.controlLevel,
    };
  }

  public acceptConsent(familyMemberId: string) {
    const member = this.members.find((m) => m.id === familyMemberId);
    if (member) {
      member.consentAccepted = true;
      member.consentAcceptedAt = new Date();
    }
    return { success: true };
  }

  public getChildren() {
    return this.members.map((m) => {
      const dev = this.devices.find((d) => d.familyMemberId === m.id);
      return {
        ...m,
        device: dev,
      };
    });
  }

  public syncAppUsage(deviceId: string, logs: any[]) {
    this.appUsageLogs.push(...logs.map((l) => ({ ...l, deviceId, syncedAt: new Date() })));
    return { syncedCount: logs.length };
  }

  public sendCommand(childId: string, commandType: string, payload?: any) {
    const dev = this.devices.find((d) => d.familyMemberId === childId);
    const cmd = {
      id: `cmd-${Date.now()}`,
      childId,
      deviceId: dev?.id,
      commandType,
      payload,
      status: 'SENT',
      createdAt: new Date(),
    };
    this.commands.unshift(cmd);

    if (dev) {
      if (commandType === 'LOCK_DEVICE') {
        dev.isLocked = true;
        dev.lockReason = payload?.reason || 'Parent remote lock active';
      } else if (commandType === 'UNLOCK_DEVICE') {
        dev.isLocked = false;
        dev.lockReason = undefined;
      }
    }

    return cmd;
  }

  public analyzeAndAlert(deviceId: string, content: string, appName: string) {
    const dev = this.devices.find((d) => d.id === deviceId);
    const scan = this.riskEngine.analyze(content);

    if (scan.riskDetected) {
      const alert = {
        id: `alt-${Date.now()}`,
        deviceId,
        familyMemberId: dev?.familyMemberId,
        category: scan.category,
        severity: scan.severity,
        source: 'NOTIFICATION',
        appName,
        matchedKeywords: scan.matchedKeywords,
        snippet: scan.maskedSnippet,
        alertedAt: new Date(),
        isRead: false,
      };
      this.riskAlerts.unshift(alert);
      return { ...scan, alertId: alert.id };
    }

    return scan;
  }

  public getAlerts(childId?: string) {
    if (childId) {
      return this.riskAlerts.filter((a) => a.familyMemberId === childId);
    }
    return this.riskAlerts;
  }

  public getGeofences(childId: string) {
    return this.geofences.filter((g) => g.familyMemberId === childId);
  }
}
