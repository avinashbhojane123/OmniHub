import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InstagramService } from './instagram.service';

@Controller('instagram')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Get('preview')
  async getPreview(@Query('url') url: string, @Req() req: Request) {
    if (!url) {
      throw new BadRequestException('Query parameter "url" is required');
    }

    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol =
      (typeof forwardedProto === 'string'
        ? forwardedProto.split(',')[0].trim()
        : req.protocol) || 'https';
    const host =
      req.get('host') || process.env.SERVER_HOST || req.headers.host || '';
    const baseUrlPrefix = host ? `${protocol}://${host}` : '';

    return this.instagramService.getPreview(url, baseUrlPrefix);
  }

  @Get('proxy-media')
  proxyMedia(
    @Query('url') url: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!url) {
      throw new BadRequestException('Query parameter "url" is required');
    }
    return this.instagramService.proxyMedia(url, req, res);
  }

  @Get('session-status')
  getSessionStatus() {
    return {
      configured: this.instagramService.hasSessionId(),
    };
  }

  @Post('session-key')
  setSessionKey(@Body('sessionId') sessionId: string) {
    this.instagramService.setCustomSessionId(sessionId);
    return {
      success: true,
      configured: this.instagramService.hasSessionId(),
    };
  }
}
