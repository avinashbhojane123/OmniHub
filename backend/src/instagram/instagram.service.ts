import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface InstagramPreviewResult {
  success: boolean;
  shortcode: string;
  mediaType: 'video' | 'image' | 'carousel' | 'embed';
  isVideo: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  proxyVideoUrl?: string;
  proxyThumbnailUrl?: string;
  caption?: string;
  author: {
    username: string;
    fullName?: string;
    profilePicUrl?: string;
    proxyProfilePicUrl?: string;
  };
  metrics?: {
    likeCount?: number;
    commentCount?: number;
    videoViewCount?: number;
  };
  audio?: {
    hasAudio?: boolean;
    audioUrl?: string;
    proxyAudioUrl?: string;
    musicTitle?: string;
    musicArtist?: string;
    audioStartTimeMs?: number;
  };
  embedHtml?: string;
  originalUrl: string;
  cleanUrl: string;
}

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private customSessionId: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  public getSessionId(): string {
    return (
      this.customSessionId ||
      this.configService.get<string>('INSTAGRAM_SESSION_ID') ||
      process.env.INSTAGRAM_SESSION_ID ||
      ''
    ).trim();
  }

  public setCustomSessionId(sessionId: string): void {
    this.customSessionId = (sessionId || '').trim();
    this.logger.log(
      `Updated runtime Instagram session key: ${this.customSessionId ? 'configured' : 'cleared'}`,
    );
  }

  public hasSessionId(): boolean {
    return Boolean(this.getSessionId());
  }

  /**
   * Parse Instagram URL and extract shortcode and clean URL
   */
  public parseUrl(
    inputUrl: string,
  ): { shortcode: string; cleanUrl: string; type: string } | null {
    if (!inputUrl || typeof inputUrl !== 'string') return null;

    const regex =
      /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:(reel|reels|p|tv|share\/reel))\/([a-zA-Z0-9_-]+)/i;
    const match = inputUrl.match(regex);

    if (match && match[2]) {
      const type =
        match[1] === 'reels' || match[1] === 'share/reel' ? 'reel' : match[1];
      const shortcode = match[2];
      return {
        shortcode,
        cleanUrl: `https://www.instagram.com/reel/${shortcode}/`,
        type,
      };
    }
    return null;
  }

  /**
   * Convert Instagram Base64 shortcode to numeric media ID
   */
  public shortcodeToMediaId(shortcode: string): string {
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let mediaId = BigInt(0);
    for (let i = 0; i < shortcode.length; i++) {
      const char = shortcode[i];
      const val = BigInt(alphabet.indexOf(char));
      if (val < 0n) continue;
      mediaId = mediaId * 64n + val;
    }
    return mediaId.toString();
  }

  /**
   * Build headers for Instagram requests with session key
   */
  private getInstagramHeaders(refererUrl?: string): Record<string, string> {
    const sessionId = this.getSessionId();
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '129477',
      'X-Requested-With': 'XMLHttpRequest',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };

    if (refererUrl) {
      headers.Referer = refererUrl;
    }

    if (sessionId) {
      const cleanSession = sessionId.includes('sessionid=')
        ? sessionId
        : `sessionid=${sessionId};`;
      headers.Cookie = cleanSession;
    }

    return headers;
  }

  /**
   * Main method to fetch Instagram Post or Reel Preview
   */
  public async getPreview(
    url: string,
    baseUrlPrefix?: string,
  ): Promise<InstagramPreviewResult> {
    const parsed = this.parseUrl(url);
    if (!parsed) {
      throw new BadRequestException('Invalid Instagram URL provided');
    }

    const { shortcode, cleanUrl } = parsed;
    const mediaId = this.shortcodeToMediaId(shortcode);

    let result: InstagramPreviewResult | null = null;

    // Strategy 1: Instagram __a=1&__d=dis JSON endpoint with session key
    try {
      result = await this.fetchViaAppEndpoint(
        shortcode,
        cleanUrl,
        baseUrlPrefix,
      );
      if (result && (result.videoUrl || result.thumbnailUrl)) {
        return result;
      }
    } catch (err: any) {
      this.logger.debug(
        `Strategy 1 (App endpoint) failed for ${shortcode}: ${err?.message || err}`,
      );
    }

    // Strategy 2: Instagram Mobile / Media Info API
    try {
      result = await this.fetchViaMediaInfoApi(
        mediaId,
        shortcode,
        cleanUrl,
        baseUrlPrefix,
      );
      if (result && (result.videoUrl || result.thumbnailUrl)) {
        return result;
      }
    } catch (err: any) {
      this.logger.debug(
        `Strategy 2 (Media info API) failed for ${shortcode}: ${err?.message || err}`,
      );
    }

    // Strategy 3: Instagram Web HTML OpenGraph & SSR Extraction
    try {
      result = await this.fetchViaHtmlScrape(
        shortcode,
        cleanUrl,
        baseUrlPrefix,
      );
      if (result && (result.videoUrl || result.thumbnailUrl)) {
        return result;
      }
    } catch (err: any) {
      this.logger.debug(
        `Strategy 3 (HTML Scrape) failed for ${shortcode}: ${err?.message || err}`,
      );
    }

    // Strategy 4: oEmbed Fallback
    try {
      result = await this.fetchViaOembed(cleanUrl, shortcode, baseUrlPrefix);
      if (result) {
        return result;
      }
    } catch (err: any) {
      this.logger.debug(
        `Strategy 4 (oEmbed) failed for ${shortcode}: ${err?.message || err}`,
      );
    }

    // Final fallback: Basic preview object with embed url
    return {
      success: true,
      shortcode,
      mediaType: 'embed',
      isVideo: true,
      cleanUrl,
      originalUrl: url,
      author: {
        username: 'Instagram User',
      },
      embedHtml: `<iframe src="https://www.instagram.com/p/${shortcode}/embed/" width="100%" height="480" frameborder="0" scrolling="no" allowtransparency="true"></iframe>`,
    };
  }

  /**
   * Strategy 1: Query Instagram JSON endpoint
   */
  private async fetchViaAppEndpoint(
    shortcode: string,
    cleanUrl: string,
    baseUrlPrefix?: string,
  ): Promise<InstagramPreviewResult | null> {
    const targetUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
    const headers = this.getInstagramHeaders(cleanUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(targetUrl, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const data: any = await response.json();
      const item = data?.items?.[0] || data?.graphql?.shortcode_media;
      if (!item) return null;

      return this.normalizeInstagramItem(
        item,
        shortcode,
        cleanUrl,
        baseUrlPrefix,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Strategy 2: Query Instagram Media Info API
   */
  private async fetchViaMediaInfoApi(
    mediaId: string,
    shortcode: string,
    cleanUrl: string,
    baseUrlPrefix?: string,
  ): Promise<InstagramPreviewResult | null> {
    const targetUrl = `https://i.instagram.com/api/v1/media/${mediaId}/info/`;
    const headers = this.getInstagramHeaders(cleanUrl);
    headers['User-Agent'] =
      'Instagram 300.0.0.29.110 Android (33/13; 420dpi; 1080x2400; samsung; SM-G998B; p3s; exynos2100; en_US; 523671234)';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(targetUrl, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const data: any = await response.json();
      const item = data?.items?.[0];
      if (!item) return null;

      return this.normalizeInstagramItem(
        item,
        shortcode,
        cleanUrl,
        baseUrlPrefix,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Strategy 3: HTML Scraper for OpenGraph and Embedded JSON
   */
  private async fetchViaHtmlScrape(
    shortcode: string,
    cleanUrl: string,
    baseUrlPrefix?: string,
  ): Promise<InstagramPreviewResult | null> {
    const targetUrl = `https://www.instagram.com/reel/${shortcode}/`;
    const headers = this.getInstagramHeaders(cleanUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(targetUrl, {
        headers: {
          ...headers,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const html = await response.text();

      // Extract OpenGraph tags
      const ogVideoMatch =
        html.match(
          /<meta\s+(?:property|name)=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i,
        ) ||
        html.match(
          /content=["']([^"']+)["']\s+(?:property|name)=["']og:video(?::secure_url)?["']/i,
        );
      const ogImageMatch =
        html.match(
          /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i,
        ) ||
        html.match(
          /content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i,
        );
      const ogTitleMatch =
        html.match(
          /<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i,
        ) ||
        html.match(
          /content=["']([^"']+)["']\s+(?:property|name)=["']og:title["']/i,
        );
      const ogDescMatch =
        html.match(
          /<meta\s+(?:property|name)=["']og:description["']\s+content=["']([^"']+)["']/i,
        ) ||
        html.match(
          /content=["']([^"']+)["']\s+(?:property|name)=["']og:description["']/i,
        );

      let videoUrl = ogVideoMatch
        ? this.decodeHtmlEntities(ogVideoMatch[1])
        : undefined;
      let thumbnailUrl = ogImageMatch
        ? this.decodeHtmlEntities(ogImageMatch[1])
        : undefined;
      let caption = ogDescMatch
        ? this.decodeHtmlEntities(ogDescMatch[1])
        : undefined;
      const title = ogTitleMatch
        ? this.decodeHtmlEntities(ogTitleMatch[1])
        : undefined;

      let username = 'Instagram User';
      let fullName: string | undefined;
      if (title) {
        const titleUserMatch =
          title.match(/^([^:]+)\s+on Instagram/i) ||
          title.match(/^@?([a-zA-Z0-9._]+)/);
        if (titleUserMatch) {
          username = titleUserMatch[1].trim();
        }
      }

      // Check for JSON-LD script
      const jsonLdMatch = html.match(
        /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i,
      );
      if (jsonLdMatch && jsonLdMatch[1]) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          if (jsonLd.video && jsonLd.video.contentUrl) {
            videoUrl = jsonLd.video.contentUrl;
          }
          if (jsonLd.thumbnailUrl) {
            thumbnailUrl = jsonLd.thumbnailUrl;
          }
          if (jsonLd.caption || jsonLd.articleBody) {
            caption = jsonLd.caption || jsonLd.articleBody;
          }
          if (jsonLd.author && jsonLd.author.identifier) {
            username = jsonLd.author.identifier.value || username;
          }
        } catch {
          // ignore json parse error
        }
      }

      if (!videoUrl && !thumbnailUrl) return null;

      const prefix = baseUrlPrefix || '';
      return {
        success: true,
        shortcode,
        mediaType: videoUrl ? 'video' : 'image',
        isVideo: Boolean(videoUrl),
        videoUrl,
        thumbnailUrl,
        proxyVideoUrl: videoUrl
          ? `${prefix}/api/instagram/proxy-media?url=${encodeURIComponent(videoUrl)}`
          : undefined,
        proxyThumbnailUrl: thumbnailUrl
          ? `${prefix}/api/instagram/proxy-media?url=${encodeURIComponent(thumbnailUrl)}`
          : undefined,
        caption,
        author: {
          username,
          fullName,
        },
        originalUrl: cleanUrl,
        cleanUrl,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Strategy 4: oEmbed fallback
   */
  private async fetchViaOembed(
    cleanUrl: string,
    shortcode: string,
    baseUrlPrefix?: string,
  ): Promise<InstagramPreviewResult | null> {
    const oembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(cleanUrl)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(oembedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data: any = await response.json();
      if (!data || (!data.title && !data.thumbnail_url && !data.html))
        return null;

      const prefix = baseUrlPrefix || '';
      const thumbnailUrl = data.thumbnail_url;

      return {
        success: true,
        shortcode,
        mediaType: 'embed',
        isVideo: true,
        thumbnailUrl,
        proxyThumbnailUrl: thumbnailUrl
          ? `${prefix}/api/instagram/proxy-media?url=${encodeURIComponent(thumbnailUrl)}`
          : undefined,
        caption: data.title,
        author: {
          username: data.author_name || 'Instagram User',
        },
        embedHtml: data.html,
        originalUrl: cleanUrl,
        cleanUrl,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Normalize Instagram Raw Item from GraphQL or Mobile API
   */
  private normalizeInstagramItem(
    item: any,
    shortcode: string,
    cleanUrl: string,
    baseUrlPrefix?: string,
  ): InstagramPreviewResult {
    const prefix = baseUrlPrefix || '';

    const isVideo = Boolean(
      item.is_video ||
      item.media_type === 2 ||
      (item.video_versions && item.video_versions.length > 0) ||
      item.video_url,
    );

    let videoUrl: string | undefined;
    if (
      item.video_versions &&
      Array.isArray(item.video_versions) &&
      item.video_versions.length > 0
    ) {
      const sortedVideos = [...item.video_versions].sort(
        (a, b) => (b.width || 0) - (a.width || 0),
      );
      videoUrl = sortedVideos[0]?.url;
    } else if (item.video_url) {
      videoUrl = item.video_url;
    }

    let thumbnailUrl: string | undefined;
    if (
      item.image_versions2?.candidates &&
      Array.isArray(item.image_versions2.candidates)
    ) {
      const sortedImages = [...item.image_versions2.candidates].sort(
        (a, b) => (b.width || 0) - (a.width || 0),
      );
      thumbnailUrl = sortedImages[0]?.url;
    } else if (item.display_url) {
      thumbnailUrl = item.display_url;
    } else if (item.thumbnail_src) {
      thumbnailUrl = item.thumbnail_src;
    }

    let caption: string | undefined;
    if (item.caption?.text) {
      caption = item.caption.text;
    } else if (item.edge_media_to_caption?.edges?.[0]?.node?.text) {
      caption = item.edge_media_to_caption.edges[0].node.text;
    }

    const user = item.user || item.owner || {};
    const username = user.username || 'Instagram User';
    const fullName = user.full_name;
    const profilePicUrl = user.profile_pic_url;

    const likeCount =
      item.like_count ??
      item.edge_media_preview_like?.count ??
      item.edge_liked_by?.count;
    const commentCount =
      item.comment_count ?? item.edge_media_to_comment?.count;
    const videoViewCount =
      item.view_count ?? item.video_view_count ?? item.play_count;

    const hasAudio =
      item.has_audio !== undefined ? Boolean(item.has_audio) : true;
    const musicInfo =
      item.clips_metadata?.music_info?.music_asset_info ||
      item.music_metadata?.music_info?.music_asset_info ||
      item.clips_metadata?.original_sound_info;
    const musicTitle =
      musicInfo?.title || musicInfo?.original_audio_title || undefined;
    const musicArtist =
      musicInfo?.display_artist || musicInfo?.ig_artist?.username || undefined;

    let audioUrl: string | undefined;
    if (musicInfo?.progressive_download_url) {
      audioUrl = musicInfo.progressive_download_url;
    } else if (musicInfo?.fast_start_progressive_download_url) {
      audioUrl = musicInfo.fast_start_progressive_download_url;
    } else if (
      item.clips_metadata?.music_info?.music_asset_info
        ?.progressive_download_url
    ) {
      audioUrl =
        item.clips_metadata.music_info.music_asset_info
          .progressive_download_url;
    } else if (
      item.clips_metadata?.original_sound_info?.progressive_download_url
    ) {
      audioUrl =
        item.clips_metadata.original_sound_info.progressive_download_url;
    } else if (
      item.music_metadata?.music_info?.music_asset_info
        ?.progressive_download_url
    ) {
      audioUrl =
        item.music_metadata.music_info.music_asset_info
          .progressive_download_url;
    } else if (
      item.audio_versions &&
      Array.isArray(item.audio_versions) &&
      item.audio_versions.length > 0
    ) {
      audioUrl = item.audio_versions[0]?.url;
    }

    // Check DASH manifest for separate audio track if still not found
    if (!audioUrl && item.video_dash_manifest) {
      const manifest = item.video_dash_manifest;
      const audioAdaptationMatch =
        manifest.match(
          /<AdaptationSet[^>]*mimeType=["']audio\/mp4["'][^>]*>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/i,
        ) ||
        manifest.match(
          /<AdaptationSet[^>]*contentType=["']audio["'][^>]*>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/i,
        ) ||
        manifest.match(
          /<Representation[^>]*mimeType=["']audio\/mp4["'][^>]*>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/i,
        );
      if (audioAdaptationMatch && audioAdaptationMatch[1]) {
        audioUrl = this.decodeHtmlEntities(audioAdaptationMatch[1]);
      }
    }

    const audioStartTimeMs =
      musicInfo?.audio_start_time_in_ms ??
      item.clips_metadata?.music_info?.music_asset_info
        ?.audio_start_time_in_ms ??
      item.music_metadata?.music_info?.music_asset_info
        ?.audio_start_time_in_ms ??
      0;

    return {
      success: true,
      shortcode,
      mediaType: isVideo ? 'video' : 'image',
      isVideo,
      videoUrl,
      thumbnailUrl,
      proxyVideoUrl: videoUrl
        ? `${prefix}/api/instagram/proxy-media?url=${encodeURIComponent(videoUrl)}`
        : undefined,
      proxyThumbnailUrl: thumbnailUrl
        ? `${prefix}/api/instagram/proxy-media?url=${encodeURIComponent(thumbnailUrl)}`
        : undefined,
      caption,
      author: {
        username,
        fullName,
        profilePicUrl,
        proxyProfilePicUrl: profilePicUrl
          ? `${prefix}/api/instagram/proxy-media?url=${encodeURIComponent(profilePicUrl)}`
          : undefined,
      },
      metrics: {
        likeCount,
        commentCount,
        videoViewCount,
      },
      audio: {
        hasAudio,
        audioUrl,
        proxyAudioUrl: audioUrl
          ? `${prefix}/api/instagram/proxy-media?url=${encodeURIComponent(audioUrl)}`
          : undefined,
        musicTitle,
        musicArtist,
        audioStartTimeMs,
      },
      originalUrl: cleanUrl,
      cleanUrl,
    };
  }

  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\\u0026/g, '&');
  }

  /**
   * Proxy media with Range streaming and CORS headers
   */
  public proxyMedia(mediaUrl: string, req: Request, res: Response): void {
    if (!mediaUrl) {
      throw new BadRequestException('Media URL is required');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(mediaUrl);
    } catch {
      throw new BadRequestException('Invalid media URL');
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new BadRequestException('Invalid protocol');
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const isAllowedHost =
      hostname.endsWith('.cdninstagram.com') ||
      hostname.endsWith('.fbcdn.net') ||
      hostname.endsWith('.instagram.com') ||
      hostname === 'cdninstagram.com' ||
      hostname === 'fbcdn.net' ||
      hostname === 'instagram.com';

    if (!isAllowedHost) {
      throw new BadRequestException('Disallowed target domain for media proxy');
    }

    const headers: http.OutgoingHttpHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: 'https://www.instagram.com/',
      Accept: '*/*',
    };

    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const request = client.request(
      parsedUrl,
      {
        method: 'GET',
        headers,
      },
      (upstreamRes) => {
        const statusCode = upstreamRes.statusCode || 200;

        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          upstreamRes.headers.location
        ) {
          return this.proxyMedia(upstreamRes.headers.location, req, res);
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Range, Content-Type, Accept',
        );
        res.setHeader(
          'Access-Control-Expose-Headers',
          'Content-Range, Content-Length, Accept-Ranges',
        );
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        if (upstreamRes.headers['content-type']) {
          res.setHeader('Content-Type', upstreamRes.headers['content-type']);
        }
        if (upstreamRes.headers['content-length']) {
          res.setHeader(
            'Content-Length',
            upstreamRes.headers['content-length'],
          );
        }
        if (upstreamRes.headers['content-range']) {
          res.setHeader('Content-Range', upstreamRes.headers['content-range']);
        }

        res.status(statusCode);
        upstreamRes.pipe(res);
      },
    );

    request.setTimeout(15000, () => {
      request.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Upstream media server timed out' });
      }
    });

    res.on('close', () => {
      request.destroy();
    });

    request.on('error', (err) => {
      this.logger.error(`Media proxy error: ${err.message}`);
      if (!res.headersSent) {
        res
          .status(502)
          .json({ error: 'Failed to proxy media from upstream server' });
      }
    });

    request.end();
  }
}
