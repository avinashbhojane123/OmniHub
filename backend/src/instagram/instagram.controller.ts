import {
  Controller,
  Get,
  Post,
  Delete,
  Head,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { InstagramService } from './instagram.service';
import { RateLimitGuard, SetRateLimit } from '../common/guards/rate-limit.guard';
import {
  InstagramPreviewDto,
  InstagramProxyDto,
  InstagramSessionKeyDto,
} from './dto/instagram.dto';
import type {
  InstagramSessionStatusResponse,
  InstagramSessionKeyResponse,
} from './dto/instagram.dto';

@UseGuards(RateLimitGuard)
@Controller('instagram')
export class InstagramController {
  private readonly logger = new Logger(InstagramController.name);

  constructor(private readonly instagramService: InstagramService) {}

  /**
   * Resolve an authoritative and safe base URL prefix for media proxy links.
   * Protects against Host Header Poisoning, SSRF, header injection, and protocol smuggling.
   */
  private resolveBaseUrl(req?: Request): string {
    const configuredUrl =
      process.env.BACKEND_URL ||
      process.env.BASE_URL ||
      process.env.SERVER_URL ||
      process.env.RENDER_EXTERNAL_URL;

    if (configuredUrl) {
      try {
        const parsed = new URL(configuredUrl);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return `${parsed.protocol}//${parsed.host}`;
        }
      } catch {
        // Ignore invalid configured URL and proceed to fallback
      }
    }

    if (!req) {
      return '';
    }

    const forwardedProto = req.headers?.['x-forwarded-proto'];
    let protocol = 'https';
    if (typeof forwardedProto === 'string') {
      const candidate = forwardedProto.split(',')[0].trim().toLowerCase();
      if (candidate === 'http' || candidate === 'https') {
        protocol = candidate;
      }
    } else if (
      req.protocol &&
      (req.protocol === 'http' || req.protocol === 'https')
    ) {
      protocol = req.protocol;
    }

    const hostCandidate =
      process.env.SERVER_HOST ||
      (typeof req.get === 'function' ? req.get('host') : undefined) ||
      (typeof req.headers?.host === 'string' ? req.headers.host : '');

    const cleanHost = (hostCandidate || '').trim();

    // Strict validation against Host Header Poisoning:
    // Only allow valid hostname / IPv4 / IPv6 literals with optional port. Disallow control chars, CRLF, spaces, slashes.
    const validHostRegex = /^(\[[a-fA-F0-9:]+\]|[a-zA-Z0-9.-]+)(?::\d{1,5})?$/;
    if (
      !cleanHost ||
      !validHostRegex.test(cleanHost) ||
      cleanHost.includes('..') ||
      cleanHost.length > 255
    ) {
      return '';
    }

    return `${protocol}://${cleanHost}`;
  }

  /**
   * Verify administrative access for modifying or clearing the Instagram session key.
   * Uses constant-time comparison to prevent timing attacks.
   */
  private verifyAdminAccess(req?: Request, providedSecret?: string): void {
    const configuredSecret =
      process.env.INSTAGRAM_ADMIN_SECRET || process.env.ADMIN_KEY;

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

    const candidate = (providedSecret || headerSecret || '').trim();

    if (!candidate) {
      throw new UnauthorizedException(
        'Admin secret is required to manage session key',
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

  @Get('preview')
  @SetRateLimit({ maxHits: 30, windowMs: 60000 })
  async getPreview(
    @Query() query: InstagramPreviewDto,
    @Req() req: Request,
  ) {
    const rawUrl = typeof query === 'string' ? query : query?.url;
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      throw new BadRequestException('Query parameter "url" is required');
    }

    const sanitizedUrl = rawUrl.trim();
    const baseUrlPrefix = this.resolveBaseUrl(req);

    return this.instagramService.getPreview(sanitizedUrl, baseUrlPrefix);
  }

  @Get('proxy-media')
  @Head('proxy-media')
  @SetRateLimit({ maxHits: 120, windowMs: 60000 })
  proxyMedia(
    @Query() query: InstagramProxyDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const rawUrl = typeof query === 'string' ? query : query?.url;
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      throw new BadRequestException('Query parameter "url" is required');
    }

    return this.instagramService.proxyMedia(rawUrl.trim(), req, res);
  }

  @Get('session-status')
  @SetRateLimit({ maxHits: 60, windowMs: 60000 })
  getSessionStatus(): InstagramSessionStatusResponse {
    return {
      configured: this.instagramService.hasSessionId(),
    };
  }

  @Post('session-key')
  @SetRateLimit({ maxHits: 10, windowMs: 60000 })
  setSessionKey(
    @Body() body: InstagramSessionKeyDto,
    @Req() req: Request,
  ): InstagramSessionKeyResponse {
    this.verifyAdminAccess(req, body?.adminSecret);

    const rawSessionId = typeof body === 'string' ? body : body?.sessionId;
    const sanitizedSessionId = (rawSessionId || '')
      .replace(/[\r\n\t]/g, '')
      .trim();

    this.instagramService.setCustomSessionId(sanitizedSessionId);
    this.logger.log(
      `Instagram session key ${sanitizedSessionId ? 'configured' : 'cleared'} via controller`,
    );

    return {
      success: true,
      configured: this.instagramService.hasSessionId(),
    };
  }

  @Delete('session-key')
  @SetRateLimit({ maxHits: 10, windowMs: 60000 })
  clearSessionKey(
    @Req() req: Request,
    @Body() body?: InstagramSessionKeyDto,
  ): InstagramSessionKeyResponse {
    this.verifyAdminAccess(req, body?.adminSecret);

    this.instagramService.setCustomSessionId('');
    this.logger.log('Instagram session key cleared via DELETE endpoint');

    return {
      success: true,
      configured: this.instagramService.hasSessionId(),
      cleared: true,
    };
  }
}
