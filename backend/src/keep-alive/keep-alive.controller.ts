import {
  Controller,
  Get,
  Post,
  Head,
  HttpCode,
  HttpStatus,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import * as crypto from 'crypto';
import { KeepAliveService } from './keep-alive.service';
import type { KeepAliveStatus, PingResult } from './keep-alive.service';
import { RateLimitGuard, SetRateLimit } from '../common/guards/rate-limit.guard';
import { TriggerPingDto } from './dto/keep-alive.dto';
import type { KeepAlivePingResponse } from './dto/keep-alive.dto';

@UseGuards(RateLimitGuard)
@Controller('keep-alive')
export class KeepAliveController {
  private readonly logger = new Logger(KeepAliveController.name);

  constructor(private readonly keepAliveService: KeepAliveService) {}

  /**
   * Verify administrative access for triggering manual on-demand pings.
   * Employs constant-time string comparison to prevent timing attacks.
   */
  private verifyAdminAccess(req?: Request, providedSecret?: string): void {
    const configuredSecret =
      process.env.KEEP_ALIVE_ADMIN_SECRET || process.env.ADMIN_KEY;

    if (!configuredSecret) {
      return;
    }

    const headerSecret =
      (req?.headers?.['x-admin-key'] as string) ||
      (req?.headers?.['x-admin-secret'] as string) ||
      (typeof req?.headers?.authorization === 'string' &&
      req.headers.authorization.startsWith('Bearer ')
        ? req.headers.authorization.substring(7).trim()
        : undefined);

    const querySecret =
      (typeof req?.query?.adminSecret === 'string'
        ? req.query.adminSecret
        : undefined) ||
      (typeof req?.query?.secret === 'string' ? req.query.secret : undefined) ||
      (typeof req?.query?.key === 'string' ? req.query.key : undefined);

    const candidate = (
      providedSecret ||
      headerSecret ||
      querySecret ||
      ''
    ).trim();

    if (!candidate) {
      throw new UnauthorizedException(
        'Admin secret is required to trigger on-demand keep-alive ping',
      );
    }

    const configuredBuffer = Buffer.from(configuredSecret, 'utf8');
    const candidateBuffer = Buffer.from(candidate, 'utf8');

    if (
      configuredBuffer.length !== candidateBuffer.length ||
      !crypto.timingSafeEqual(configuredBuffer, candidateBuffer)
    ) {
      throw new UnauthorizedException('Invalid admin credentials');
    }
  }

  @Get()
  @Head()
  @HttpCode(HttpStatus.OK)
  @SetRateLimit({ maxHits: 60, windowMs: 60000 })
  getKeepAliveStatus(): KeepAliveStatus {
    return this.keepAliveService.getStatus();
  }

  @Get('ping')
  @Head('ping')
  @HttpCode(HttpStatus.OK)
  @SetRateLimit({ maxHits: 120, windowMs: 60000 })
  ping(): KeepAlivePingResponse {
    return {
      statusCode: 200,
      status: 'ok',
      message: 'Server is active and responsive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Post('ping-now')
  @HttpCode(HttpStatus.OK)
  @SetRateLimit({ maxHits: 5, windowMs: 60000 })
  async triggerPingNow(
    @Req() req?: Request,
    @Body() body?: TriggerPingDto,
  ): Promise<PingResult> {
    this.verifyAdminAccess(req, body?.adminSecret);
    this.logger.log('Manual keep-alive ping triggered via controller');
    return await this.keepAliveService.pingServer();
  }
}
