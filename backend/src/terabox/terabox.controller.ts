import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { TeraboxService } from './terabox.service';
import {
  ExtractTeraBoxDto,
  ExtractTeraBoxResponseDto,
} from './dto/extract-terabox.dto';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Controller('api/v1/terabox')
@UseGuards(RateLimitGuard)
export class TeraboxController {
  private readonly logger = new Logger(TeraboxController.name);

  constructor(private readonly teraboxService: TeraboxService) {}

  /**
   * POST /api/v1/terabox/extract
   * Core extraction endpoint for Android ExoPlayer streaming.
   */
  @Post('extract')
  @HttpCode(HttpStatus.OK)
  async extract(
    @Body() dto: ExtractTeraBoxDto,
  ): Promise<ExtractTeraBoxResponseDto> {
    this.logger.log(`Extracting video metadata for URL: ${dto.url}`);
    return this.teraboxService.extractVideoMetadata(dto.url);
  }

  /**
   * GET /api/v1/terabox/stream
   * High-throughput HTTP 206 Partial Content proxy for ExoPlayer seekable streaming.
   */
  @Get('stream')
  async stream(
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('Stream token is required');
    }

    const streamInfo = this.teraboxService.getStreamByToken(token);
    if (!streamInfo) {
      throw new NotFoundException('Stream token expired or invalid');
    }

    const upstreamUrl = streamInfo.url;
    const parsed = new URL(upstreamUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const rangeHeader = req.headers.range;
    const requestHeaders: Record<string, any> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
      Referer: 'https://www.terabox.app/',
    };

    if (rangeHeader) {
      requestHeaders.Range = rangeHeader;
    }

    const upstreamReq = client.request(
      parsed,
      {
        method: 'GET',
        headers: requestHeaders,
      },
      (upstreamRes) => {
        const statusCode = upstreamRes.statusCode || 200;

        // Forward caching and streaming headers
        res.status(statusCode);
        if (upstreamRes.headers['content-range']) {
          res.setHeader('Content-Range', upstreamRes.headers['content-range']);
        }
        if (upstreamRes.headers['content-length']) {
          res.setHeader('Content-Length', upstreamRes.headers['content-length']);
        }
        if (upstreamRes.headers['content-type']) {
          res.setHeader('Content-Type', upstreamRes.headers['content-type']);
        } else {
          res.setHeader('Content-Type', 'video/mp4');
        }

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        // Stream pipe with backpressure directly to client ExoPlayer
        upstreamRes.pipe(res);
      },
    );

    upstreamReq.on('error', (err) => {
      this.logger.error(`Stream proxy error: ${err.message}`, err.stack);
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          message: 'Failed to stream from video CDN',
        });
      }
    });

    req.on('close', () => {
      upstreamReq.destroy();
    });

    upstreamReq.end();
  }

  /**
   * GET /api/v1/terabox/stats
   * Monitoring hook for extraction service health and performance.
   */
  @Get('stats')
  getStats() {
    return this.teraboxService.getStats();
  }

  /**
   * GET /api/v1/terabox/health
   */
  @Get('health')
  getHealth() {
    return {
      status: 'UP',
      service: 'terabox-extraction-service',
      timestamp: new Date().toISOString(),
    };
  }
}

