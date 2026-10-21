import { Controller, Get, Post } from '@nestjs/common';
import { KeepAliveService } from './keep-alive.service';

@Controller('keep-alive')
export class KeepAliveController {
  constructor(private readonly keepAliveService: KeepAliveService) {}

  @Get()
  getKeepAliveStatus() {
    return this.keepAliveService.getStatus();
  }

  @Get('/ping')
  ping() {
    return {
      statusCode: 200,
      status: 'ok',
      message: 'Server is active and responsive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Post('/ping-now')
  async triggerPingNow() {
    return await this.keepAliveService.pingServer();
  }
}
