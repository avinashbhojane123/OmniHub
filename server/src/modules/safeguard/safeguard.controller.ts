import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { SafeGuardService } from './safeguard.service';

@Controller('api/v1')
export class SafeGuardController {
  constructor(private readonly safeguardService: SafeGuardService) {}

  @Post('family/create')
  createFamily(@Body() body: { parentId: string }) {
    return this.safeguardService.createFamily(body.parentId || 'parent-root');
  }

  @Post('family/join')
  joinFamily(
    @Body()
    body: {
      familyCode: string;
      childName: string;
      age: number;
      deviceName: string;
    }
  ) {
    return this.safeguardService.joinFamily(
      body.familyCode,
      body.childName,
      body.age,
      body.deviceName
    );
  }

  @Post('family/accept-consent')
  acceptConsent(@Body() body: { familyMemberId: string }) {
    return this.safeguardService.acceptConsent(body.familyMemberId);
  }

  @Get('family/children')
  getChildren() {
    return this.safeguardService.getChildren();
  }

  @Post('app-usage/sync')
  syncAppUsage(@Body() body: { deviceId: string; logs: any[] }) {
    return this.safeguardService.syncAppUsage(body.deviceId, body.logs || []);
  }

  @Post('device-control/command')
  sendCommand(
    @Body()
    body: {
      childId: string;
      commandType: string;
      payload?: any;
    }
  ) {
    return this.safeguardService.sendCommand(body.childId, body.commandType, body.payload);
  }

  @Post('risk-alerts/analyze')
  analyzeRisk(
    @Body()
    body: {
      deviceId: string;
      content: string;
      appName: string;
    }
  ) {
    return this.safeguardService.analyzeAndAlert(body.deviceId, body.content, body.appName);
  }

  @Get('risk-alerts/:childId')
  getAlerts(@Param('childId') childId: string) {
    return this.safeguardService.getAlerts(childId);
  }

  @Get('geofence/:childId/list')
  getGeofences(@Param('childId') childId: string) {
    return this.safeguardService.getGeofences(childId);
  }
}
