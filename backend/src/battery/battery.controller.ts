import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Query,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { BatteryService } from './battery.service';
import {
  UpdateBatterySettingsDto,
  CreateBatterySessionDto,
  BatteryAlertEventDto,
} from './dto/battery.dto';

@Controller('battery')
export class BatteryController {
  constructor(private readonly batteryService: BatteryService) {}

  /**
   * Resolves a sanitized device identifier, falling back to 'default_device'.
   */
  private resolveDeviceId(deviceId?: string): string {
    return typeof deviceId === 'string' && deviceId.trim().length > 0
      ? deviceId.trim()
      : 'default_device';
  }

  /**
   * Health and connectivity check endpoint for mobile sync services & orchestrators.
   */
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'battery',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Retrieves battery settings for a device.
   */
  @Get('settings')
  async getSettings(@Query('deviceId') deviceId?: string) {
    return this.batteryService.getSettings(this.resolveDeviceId(deviceId));
  }

  /**
   * Updates battery settings with fallback to query deviceId if omitted from body.
   */
  @Put('settings')
  async updateSettings(
    @Body() dto: UpdateBatterySettingsDto,
    @Query('deviceId') queryDeviceId?: string,
  ) {
    if (!dto.deviceId && queryDeviceId && queryDeviceId.trim().length > 0) {
      dto.deviceId = queryDeviceId.trim();
    }
    return this.batteryService.updateSettings(dto);
  }

  /**
   * Resets device battery settings to factory safe defaults.
   */
  @Post('settings/reset')
  @HttpCode(HttpStatus.OK)
  async resetSettings(@Query('deviceId') deviceId?: string) {
    return this.batteryService.resetSettings(this.resolveDeviceId(deviceId));
  }

  /**
   * Records or updates a charging session with idempotency and fallback to query deviceId.
   */
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  async recordSession(
    @Body() dto: CreateBatterySessionDto,
    @Query('deviceId') queryDeviceId?: string,
  ) {
    if (!dto.deviceId && queryDeviceId && queryDeviceId.trim().length > 0) {
      dto.deviceId = queryDeviceId.trim();
    }
    return this.batteryService.recordSession(dto);
  }

  /**
   * Retrieves recent charging sessions with validated, bounded pagination.
   */
  @Get('sessions')
  async getRecentSessions(
    @Query('deviceId') deviceId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const cleanId = this.resolveDeviceId(deviceId);
    const defaultLimit =
      Number.parseInt(process.env.BATTERY_SESSIONS_DEFAULT_LIMIT || '20', 10) || 20;
    const maxLimit =
      Number.parseInt(process.env.BATTERY_SESSIONS_MAX_LIMIT || '100', 10) || 100;
    const parsedLimit =
      limit !== undefined ? Number.parseInt(limit, 10) : defaultLimit;
    const parsedOffset = offset !== undefined ? Number.parseInt(offset, 10) : 0;

    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(maxLimit, parsedLimit))
      : defaultLimit;
    const safeOffset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;

    return this.batteryService.getRecentSessions(cleanId, safeLimit, safeOffset);
  }

  /**
   * Aggregates battery charging telemetry stats for a device.
   */
  @Get('sessions/stats')
  async getSessionStats(@Query('deviceId') deviceId?: string) {
    return this.batteryService.getDeviceStats(this.resolveDeviceId(deviceId));
  }

  /**
   * Retrieves a specific session by ID with positive ID enforcement.
   */
  @Get('sessions/:id')
  async getSessionById(
    @Param('id', ParseIntPipe) id: number,
    @Query('deviceId') deviceId?: string,
  ) {
    if (id <= 0) {
      throw new BadRequestException('Session ID must be a positive integer');
    }
    const cleanId = typeof deviceId === 'string' && deviceId.trim().length > 0 ? deviceId.trim() : undefined;
    return this.batteryService.getSessionById(id, cleanId);
  }

  /**
   * Deletes a specific session by ID with positive ID enforcement.
   */
  @Delete('sessions/:id')
  async deleteSession(
    @Param('id', ParseIntPipe) id: number,
    @Query('deviceId') deviceId?: string,
  ) {
    if (id <= 0) {
      throw new BadRequestException('Session ID must be a positive integer');
    }
    const cleanId = typeof deviceId === 'string' && deviceId.trim().length > 0 ? deviceId.trim() : undefined;
    return this.batteryService.deleteSession(id, cleanId);
  }

  /**
   * Clears all session records for a device.
   */
  @Delete('sessions')
  async clearSessions(@Query('deviceId') deviceId?: string) {
    return this.batteryService.clearSessions(this.resolveDeviceId(deviceId));
  }

  /**
   * Logs and persists battery alerts (overcharge, overheat, critical discharge).
   */
  @Post('alert')
  @HttpCode(HttpStatus.OK)
  async postAlert(
    @Body() dto: BatteryAlertEventDto,
    @Query('deviceId') queryDeviceId?: string,
  ) {
    if (!dto.deviceId && queryDeviceId && queryDeviceId.trim().length > 0) {
      dto.deviceId = queryDeviceId.trim();
    }
    return this.batteryService.handleAlertEvent(dto);
  }

  /**
   * Retrieves logged alert history for a device.
   */
  @Get('alerts')
  async getAlerts(
    @Query('deviceId') deviceId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const cleanId = this.resolveDeviceId(deviceId);
    const defaultLimit =
      Number.parseInt(process.env.BATTERY_SESSIONS_DEFAULT_LIMIT || '20', 10) || 20;
    const maxLimit =
      Number.parseInt(process.env.BATTERY_SESSIONS_MAX_LIMIT || '100', 10) || 100;
    const parsedLimit =
      limit !== undefined ? Number.parseInt(limit, 10) : defaultLimit;
    const parsedOffset = offset !== undefined ? Number.parseInt(offset, 10) : 0;

    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(maxLimit, parsedLimit))
      : defaultLimit;
    const safeOffset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;

    return this.batteryService.getRecentAlerts(cleanId, safeLimit, safeOffset);
  }

  /**
   * Clears alert history for a device.
   */
  @Delete('alerts')
  async clearAlerts(@Query('deviceId') deviceId?: string) {
    return this.batteryService.clearAlerts(this.resolveDeviceId(deviceId));
  }
}
