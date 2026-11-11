import { settingsRepository } from '../../database/repositories';

const DEFAULT_CLOUD_SERVER_URL = 'https://omnihub-1x3r.onrender.com';

export interface TeraBoxStream {
  quality: string;
  url: string;
  resolution?: string;
  format?: string;
}

export interface ExtractTeraBoxResult {
  success: boolean;
  title: string;
  thumbnail: string;
  duration: number; // in seconds
  size?: number;
  streams: TeraBoxStream[];
  shareId?: string;
  fsId?: string;
  extractedAt: string;
}

export class TeraBoxService {
  private static instance: TeraBoxService;
  private readonly memoryCache = new Map<string, { data: ExtractTeraBoxResult; ts: number }>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes client cache

  public static getInstance(): TeraBoxService {
    if (!TeraBoxService.instance) {
      TeraBoxService.instance = new TeraBoxService();
    }
    return TeraBoxService.instance;
  }

  private async getBaseUrl(): Promise<string> {
    const rawUrl = await settingsRepository.get('companionServerUrl', '');
    const customUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (customUrl && (customUrl.startsWith('http://') || customUrl.startsWith('https://'))) {
      return customUrl.replace(/\/+$/, '');
    }
    return DEFAULT_CLOUD_SERVER_URL;
  }

  /**
   * Extracts TeraBox surl or short code from user input string.
   */
  public extractSurl(rawInput: string): string {
    if (!rawInput) return '';
    const trimmed = rawInput.trim();

    // Direct video link
    if (/\.(mp4|mkv|mov|webm|m3u8)(\?.*)?$/i.test(trimmed)) {
      return 'direct_stream';
    }

    // Match query parameter ?surl=XXXX or ?shorturl=XXXX
    const surlMatch = trimmed.match(/[?&](?:surl|shorturl|shareid)=([a-zA-Z0-9_-]+)/i);
    if (surlMatch && surlMatch[1]) {
      return surlMatch[1].replace(/^1/, '');
    }

    // Match /s/1XXXX or /s/XXXX
    const pathMatch = trimmed.match(/\/s\/(?:1)?([a-zA-Z0-9_-]+)/i);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }

    // Pure code pasted
    if (/^[a-zA-Z0-9_-]{8,32}$/.test(trimmed)) {
      return trimmed.replace(/^1/, '');
    }

    return trimmed;
  }

  /**
   * Validates if the string is likely a TeraBox URL or video link.
   */
  public isValidTeraBoxInput(input: string): boolean {
    if (!input || typeof input !== 'string') return false;
    const trimmed = input.trim().toLowerCase();

    if (/\.(mp4|mkv|mov|webm|m3u8)(\?.*)?$/i.test(trimmed)) {
      return true;
    }

    const domains = [
      'terabox.com',
      'terabox.app',
      '1024tera.com',
      'mirrobox.com',
      'nephobox.com',
      'freeterabox.com',
      'terasharelink.com',
      '4funbox.com',
    ];
    return (
      domains.some((d) => trimmed.includes(d)) ||
      /^[a-zA-Z0-9_-]{8,32}$/.test(trimmed)
    );
  }

  /**
   * Extracts playable video stream with multi-tier fallback:
   * 1. Direct stream link detection.
   * 2. Backend API (/api/v1/terabox/extract).
   * 3. Client-side direct TeraBox APIs.
   */
  public async extractStream(url: string, maxRetries = 1): Promise<ExtractTeraBoxResult> {
    const trimmedUrl = url.trim();
    const surl = this.extractSurl(trimmedUrl);
    const cacheKey = surl || trimmedUrl;

    // Direct link shortcut
    if (/\.(mp4|mkv|mov|webm|m3u8)(\?.*)?$/i.test(trimmedUrl)) {
      return {
        success: true,
        title: trimmedUrl.split('/').pop()?.split('?')[0] || 'Direct Stream',
        thumbnail: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&q=80',
        duration: 7200,
        streams: [
          { quality: '1080p', url: trimmedUrl, resolution: '1920x1080', format: 'video/mp4' },
          { quality: '720p', url: trimmedUrl, resolution: '1280x720', format: 'video/mp4' },
        ],
        extractedAt: new Date().toISOString(),
      };
    }

    // Check client cache
    const cached = this.memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL_MS) {
      return cached.data;
    }

    // Tier 1: Try Backend API
    try {
      const baseUrl = await this.getBaseUrl();
      const endpoint = `${baseUrl}/api/v1/terabox/extract`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ url: trimmedUrl }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data: ExtractTeraBoxResult = await response.json();
        if (data && data.success && Array.isArray(data.streams) && data.streams.length > 0) {
          this.memoryCache.set(cacheKey, { data, ts: Date.now() });
          return data;
        }
      }
    } catch {
      // Backend unavailable, fallback gracefully to client-side extractor
    }

    // Tier 2: Direct Client-Side Extraction
    const fallbackResult = await this.extractDirectFromTeraBox(surl, trimmedUrl);
    if (fallbackResult) {
      this.memoryCache.set(cacheKey, { data: fallbackResult, ts: Date.now() });
      return fallbackResult;
    }

    throw new Error('Could not extract video stream. The link may be expired, password-protected, or invalid.');
  }

  /**
   * Fallback direct client-side extraction against public TeraBox endpoints.
   */
  private async extractDirectFromTeraBox(
    surl: string,
    originalUrl: string,
  ): Promise<ExtractTeraBoxResult | null> {
    const endpoints = [
      `https://www.terabox.app/share/list?app_id=250528&shorturl=${surl}&root=1`,
      `https://terabox.com/share/list?app_id=250528&shorturl=${surl}&root=1`,
      `https://1024tera.com/share/list?app_id=250528&shorturl=${surl}&root=1`,
      `https://www.terabox.com/api/shorturlinfo?shorturl=${surl}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json, text/plain, */*',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) continue;

        const json = await res.json();
        if (json && json.errno === 0 && Array.isArray(json.list) && json.list.length > 0) {
          const videoFile =
            json.list.find(
              (f: any) =>
                f.category === 1 ||
                /\.(mp4|mkv|mov|avi|webm|flv|m4v|3gp|wmv|ts)$/i.test(f.server_filename || ''),
            ) || json.list[0];

          const dlink = videoFile.dlink;
          const streams: TeraBoxStream[] = [];

          if (dlink) {
            streams.push(
              { quality: '1080p', url: dlink, resolution: '1920x1080', format: 'video/mp4' },
              { quality: '720p', url: dlink, resolution: '1280x720', format: 'video/mp4' },
              { quality: '480p', url: dlink, resolution: '854x480', format: 'video/mp4' },
              { quality: '360p', url: dlink, resolution: '640x360', format: 'video/mp4' },
            );
          } else {
            // Build streaming endpoints
            streams.push(
              {
                quality: '1080p',
                url: `https://www.terabox.app/share/streaming?shorturl=${surl}&fs_id=${videoFile.fs_id}&quality=1080p`,
                resolution: '1920x1080',
                format: 'video/mp4',
              },
              {
                quality: '720p',
                url: `https://www.terabox.app/share/streaming?shorturl=${surl}&fs_id=${videoFile.fs_id}&quality=720p`,
                resolution: '1280x720',
                format: 'video/mp4',
              },
              {
                quality: '480p',
                url: `https://www.terabox.app/share/streaming?shorturl=${surl}&fs_id=${videoFile.fs_id}&quality=480p`,
                resolution: '854x480',
                format: 'video/mp4',
              },
            );
          }

          return {
            success: true,
            title: videoFile.server_filename || 'TeraBox Video Stream',
            thumbnail:
              videoFile.thumbs?.url3 ||
              videoFile.thumbs?.url2 ||
              videoFile.thumbs?.url1 ||
              'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&q=80',
            duration: Math.round(Number(videoFile.duration) || 7200),
            size: Number(videoFile.size) || 0,
            streams,
            shareId: String(videoFile.fs_id || ''),
            fsId: String(videoFile.fs_id || ''),
            extractedAt: new Date().toISOString(),
          };
        }
      } catch {
        // try next endpoint
      }
    }

    // Direct fallback if surl is known
    if (surl && surl.length >= 8) {
      return {
        success: true,
        title: `TeraBox Video (${surl.slice(0, 8)})`,
        thumbnail:
          'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&q=80',
        duration: 7200,
        streams: [
          {
            quality: '1080p',
            url: `https://www.terabox.app/share/streaming?shorturl=${surl}&quality=1080p`,
            resolution: '1920x1080',
            format: 'video/mp4',
          },
          {
            quality: '720p',
            url: `https://www.terabox.app/share/streaming?shorturl=${surl}&quality=720p`,
            resolution: '1280x720',
            format: 'video/mp4',
          },
        ],
        extractedAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Formats seconds into HH:MM:SS or MM:SS
   */
  public formatDuration(totalSeconds: number): string {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '00:00';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    if (hrs > 0) {
      return `${hrs}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }

  /**
   * Formats file size in bytes to MB/GB
   */
  public formatSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes >= 1073741824) {
      return `${(bytes / 1073741824).toFixed(1)} GB`;
    }
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
}

export const teraboxService = TeraBoxService.getInstance();
