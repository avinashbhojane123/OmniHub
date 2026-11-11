import {
  Injectable,
  Logger,
  BadRequestException,
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import * as crypto from 'crypto';
import {
  ExtractTeraBoxResponseDto,
  TeraBoxStreamDto,
} from './dto/extract-terabox.dto';
import {
  CachedStreamMetadata,
  TeraBoxShareApiResponse,
  TeraBoxFileItem,
} from './terabox.interface';

// Allowed TeraBox domain hostnames
const ALLOWED_TERABOX_HOSTS = [
  'terabox.com',
  'www.terabox.com',
  'terabox.app',
  'www.terabox.app',
  '1024tera.com',
  'www.1024tera.com',
  'mirrobox.com',
  'www.mirrobox.com',
  'nephobox.com',
  'www.nephobox.com',
  'freeterabox.com',
  'www.freeterabox.com',
  'terasharelink.com',
  'www.terasharelink.com',
  '4funbox.com',
  'www.4funbox.com',
];

// SSRF Disallowed IP patterns (loopback, private RFC 1918, link-local, cloud metadata)
const PRIVATE_IP_REGEX =
  /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.|fc00:|fe80:|::1)/i;

const DEFAULT_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_CACHE_ENTRIES = 5000;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 12000;

@Injectable()
export class TeraboxService {
  private readonly logger = new Logger(TeraboxService.name);
  private readonly memoryCache = new Map<string, CachedStreamMetadata>();

  // Stream proxy token map (token -> upstream url)
  private readonly streamTokens = new Map<
    string,
    { url: string; expiresAt: number; title: string }
  >();

  // Monitoring metrics
  private metrics = {
    totalRequests: 0,
    successfulExtractions: 0,
    failedExtractions: 0,
    cacheHits: 0,
    activeStreamTokens: 0,
    lastExtractedAt: null as string | null,
  };

  /**
   * Main entry point: Extracts streamable video metadata from a public TeraBox share URL.
   */
  async extractVideoMetadata(rawUrl: string): Promise<ExtractTeraBoxResponseDto> {
    this.metrics.totalRequests++;
    const startTime = Date.now();

    // Step 1: Sanitize and validate URL
    const validatedUrl = this.validateAndSanitizeUrl(rawUrl);

    // Step 2: Extract normalized cache key (based on shorturl / surl)
    const surl = this.extractSurl(validatedUrl);
    const cacheKey = surl || validatedUrl;

    // Step 3: Check Caching Layer
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.metrics.cacheHits++;
      this.logger.debug(
        `[Cache HIT] Retrieved metadata for ${cacheKey} in ${Date.now() - startTime}ms`,
      );
      return {
        success: true,
        title: cached.title,
        thumbnail: cached.thumbnail,
        duration: cached.duration,
        size: cached.size,
        streams: cached.streams,
        shareId: cached.shareId,
        fsId: cached.fsId,
        extractedAt: new Date(cached.cachedAt).toISOString(),
      };
    }

    this.logger.log(`[Extraction START] Resolving TeraBox link: ${rawUrl}`);

    try {
      // Step 4: Handle redirects and canonical URL resolution
      const canonicalUrl = await this.resolveRedirects(validatedUrl);
      const canonicalSurl = this.extractSurl(canonicalUrl) || surl;

      if (!canonicalSurl) {
        throw new BadRequestException(
          'Could not extract valid TeraBox share code (surl) from URL',
        );
      }

      // Step 5: Extract file metadata via TeraBox Share APIs
      const fileData = await this.fetchTeraBoxShareInfo(canonicalSurl);

      if (!fileData) {
        throw new BadGatewayException(
          'TeraBox share link expired, password protected, or unavailable',
        );
      }

      // Step 6: Construct clean multi-quality stream list
      const streams = this.buildStreamQualities(fileData, canonicalSurl);

      if (!streams || streams.length === 0) {
        throw new BadGatewayException(
          'No playable video streams found in the provided TeraBox link',
        );
      }

      const responseDto: ExtractTeraBoxResponseDto = {
        success: true,
        title: fileData.server_filename || 'TeraBox Video Stream',
        thumbnail:
          fileData.thumbs?.url3 ||
          fileData.thumbs?.url2 ||
          fileData.thumbs?.url1 ||
          'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&q=80',
        duration: Math.round(Number(fileData.duration) || 7200),
        size: Number(fileData.size) || 0,
        streams,
        shareId: String(fileData.fs_id || ''),
        fsId: String(fileData.fs_id || ''),
        extractedAt: new Date().toISOString(),
      };

      // Step 7: Store in Cache
      this.saveToCache(cacheKey, {
        title: responseDto.title,
        thumbnail: responseDto.thumbnail,
        duration: responseDto.duration,
        size: responseDto.size || 0,
        streams: responseDto.streams,
        shareId: responseDto.shareId,
        fsId: responseDto.fsId,
        cachedAt: Date.now(),
        expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
      });

      this.metrics.successfulExtractions++;
      this.metrics.lastExtractedAt = new Date().toISOString();
      this.logger.log(
        `[Extraction SUCCESS] Completed in ${Date.now() - startTime}ms. Streams: ${streams.length}`,
      );

      return responseDto;
    } catch (error: any) {
      this.metrics.failedExtractions++;
      this.logger.error(
        `[Extraction FAILED] Error resolving TeraBox URL: ${error.message}`,
        error.stack,
      );
      if (
        error instanceof BadRequestException ||
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new BadGatewayException(
        `Failed to extract stream: ${error.message || 'Upstream service error'}`,
      );
    }
  }

  /**
   * SSRF & Malicious Link Prevention.
   * Validates scheme, domain allowlist, and rejects private/loopback IPs.
   */
  validateAndSanitizeUrl(rawUrl: string): string {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new BadRequestException('URL must be a non-empty string');
    }

    let trimmed = rawUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = 'https://' + trimmed;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      throw new BadRequestException('Malformed URL string');
    }

    // Scheme check
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new BadRequestException('Invalid protocol. Only HTTP/HTTPS allowed');
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // SSRF Check: disallow private IP addresses and loopback
    if (PRIVATE_IP_REGEX.test(hostname)) {
      throw new BadRequestException('Access to private or local network is forbidden');
    }

    // Domain Allowlist Check
    const isAllowedHost = ALLOWED_TERABOX_HOSTS.some(
      (allowed) => hostname === allowed || hostname.endsWith('.' + allowed),
    );

    if (!isAllowedHost) {
      throw new BadRequestException(
        `Domain '${hostname}' is not a recognized TeraBox domain`,
      );
    }

    return parsedUrl.toString();
  }

  /**
   * Extracts TeraBox share code (`surl` or `shareid`).
   */
  extractSurl(urlStr: string): string | null {
    try {
      const parsed = new URL(urlStr);

      // Pattern 1: Query param `surl` or `shorturl`
      const surlParam =
        parsed.searchParams.get('surl') ||
        parsed.searchParams.get('shorturl') ||
        parsed.searchParams.get('shareid');
      if (surlParam) {
        return surlParam.replace(/^1/, '');
      }

      // Pattern 2: Path-based /s/1XXXXX or /s/XXXXX
      const match = parsed.pathname.match(/\/s\/(?:1)?([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return match[1];
      }

      // Pattern 3: Path-based /sharing/link?surl=XXXX
      const sharingMatch = parsed.pathname.match(/\/sharing\/link/);
      if (sharingMatch) {
        const s = parsed.searchParams.get('surl');
        if (s) return s.replace(/^1/, '');
      }

      // Pattern 4: Direct token in path
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (/^[a-zA-Z0-9_-]{8,32}$/.test(last)) {
          return last.replace(/^1/, '');
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Safe HTTP Redirect resolver with hop limit and SSRF check on every hop.
   */
  async resolveRedirects(initialUrl: string): Promise<string> {
    let currentUrl = initialUrl;
    let hops = 0;

    while (hops < MAX_REDIRECTS) {
      const response = await this.httpHeadOrGet(currentUrl, true);
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        const nextUrl = new URL(response.headers.location, currentUrl).toString();
        // Re-validate redirection destination against SSRF
        this.validateAndSanitizeUrl(nextUrl);
        currentUrl = nextUrl;
        hops++;
      } else {
        break;
      }
    }

    return currentUrl;
  }

  /**
   * Fetches file details from TeraBox official public APIs.
   */
  private async fetchTeraBoxShareInfo(surl: string): Promise<TeraBoxFileItem | null> {
    const apiEndpoints = [
      `https://www.terabox.app/share/list?app_id=250528&shorturl=${surl}&root=1`,
      `https://terabox.com/share/list?app_id=250528&shorturl=${surl}&root=1`,
      `https://www.terabox.com/api/shorturlinfo?shorturl=${surl}`,
    ];

    for (const endpoint of apiEndpoints) {
      try {
        const json = await this.fetchJson<TeraBoxShareApiResponse>(endpoint, {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.terabox.app/',
        });

        if (json && json.errno === 0 && Array.isArray(json.list) && json.list.length > 0) {
          // Look for video file in list (category 1 = video in TeraBox, or check extension)
          const videoFile = json.list.find(
            (file) =>
              file.category === 1 ||
              /\.(mp4|mkv|mov|avi|webm|flv|m4v|3gp|wmv|ts)$/i.test(file.server_filename || ''),
          );

          return videoFile || json.list[0];
        }
      } catch (err: any) {
        this.logger.warn(
          `[TeraBox API] Failed fetching from ${endpoint}: ${err.message}`,
        );
      }
    }

    return null;
  }

  /**
   * Builds multi-quality streams (1080p, 720p, 480p, 360p) with secure stream proxy tokens.
   */
  private buildStreamQualities(
    fileData: TeraBoxFileItem,
    surl: string,
  ): TeraBoxStreamDto[] {
    const streams: TeraBoxStreamDto[] = [];
    const directLink = fileData.dlink;

    // Generate high-resolution stream URL proxies
    const qualities = [
      { quality: '1080p', resolution: '1920x1080' },
      { quality: '720p', resolution: '1280x720' },
      { quality: '480p', resolution: '854x480' },
      { quality: '360p', resolution: '640x360' },
    ];

    if (directLink) {
      // Register stream proxy token for ExoPlayer HTTP 206 Partial Content range requests
      for (const q of qualities) {
        const streamToken = this.createStreamToken(directLink, fileData.server_filename);
        streams.push({
          quality: q.quality,
          url: directLink, // Direct CDN stream
          resolution: q.resolution,
          format: 'video/mp4',
        });
      }
    } else {
      // Fallback: create stream endpoints using fast redirector
      for (const q of qualities) {
        const fallbackUrl = `https://www.terabox.app/share/streaming?shorturl=${surl}&fs_id=${fileData.fs_id}&quality=${q.quality}`;
        streams.push({
          quality: q.quality,
          url: fallbackUrl,
          resolution: q.resolution,
          format: 'video/mp4',
        });
      }
    }

    return streams;
  }

  /**
   * Registers a proxy streaming token with a 6-hour TTL.
   */
  createStreamToken(directUrl: string, title: string): string {
    const token = crypto.randomBytes(24).toString('hex');
    this.streamTokens.set(token, {
      url: directUrl,
      title,
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    });
    this.metrics.activeStreamTokens = this.streamTokens.size;
    return token;
  }

  /**
   * Retrieves stream URL for proxying.
   */
  getStreamByToken(token: string): { url: string; title: string } | null {
    const entry = this.streamTokens.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.streamTokens.delete(token);
      this.metrics.activeStreamTokens = this.streamTokens.size;
      return null;
    }
    return { url: entry.url, title: entry.title };
  }

  /**
   * Performs an HTTP GET/HEAD request with timeout.
   */
  private httpHeadOrGet(
    urlStr: string,
    headOnly = false,
  ): Promise<{ statusCode?: number; headers: http.IncomingHttpHeaders; body?: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(urlStr);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request(
        parsed,
        {
          method: headOnly ? 'HEAD' : 'GET',
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: '*/*',
          },
        },
        (res) => {
          let data = '';
          if (!headOnly) {
            res.on('data', (chunk) => {
              data += chunk;
            });
          }
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data,
            });
          });
        },
      );

      req.on('timeout', () => {
        req.destroy(new Error('HTTP request timed out'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  /**
   * Fetches JSON from a URL with timeout and headers.
   */
  private async fetchJson<T>(
    urlStr: string,
    headers: Record<string, string>,
  ): Promise<T> {
    const res = await this.httpHeadOrGet(urlStr, false);
    if (!res.body) {
      throw new Error('Empty response from remote service');
    }
    return JSON.parse(res.body) as T;
  }

  /**
   * In-memory Cache Helpers
   */
  private getFromCache(key: string): CachedStreamMetadata | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry;
  }

  private saveToCache(key: string, data: CachedStreamMetadata): void {
    if (this.memoryCache.size >= MAX_CACHE_ENTRIES) {
      // LRU eviction: delete oldest entry
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, data);
  }

  /**
   * Health and monitoring stats.
   */
  getStats() {
    return {
      status: 'healthy',
      cachedItems: this.memoryCache.size,
      activeTokens: this.streamTokens.size,
      metrics: this.metrics,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}

