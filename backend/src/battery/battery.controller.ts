import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Query,
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

  @Get('settings')
  getSettings(@Query('deviceId') deviceId?: string) {
    return this.batteryService.getSettings(deviceId || 'default_device');
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateBatterySettingsDto) {
    return this.batteryService.updateSettings(dto);
  }

  @Post('sessions')
  recordSession(@Body() dto: CreateBatterySessionDto) {
    return this.batteryService.recordSession(dto);
  }

  @Get('sessions')
  getRecentSessions(
    @Query('deviceId') deviceId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.batteryService.getRecentSessions(
      deviceId || 'default_device',
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('alert')
  postAlert(@Body() dto: BatteryAlertEventDto) {
    return this.batteryService.handleAlertEvent(dto);
  }
}
