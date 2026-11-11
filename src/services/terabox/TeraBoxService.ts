// 100% Standalone Client-Side TeraBox Stream Resolver (Zero Backend Dependency)

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

// Zero-dependency pure JavaScript SHA-1 and HMAC-SHA1 (Hermes & React Native native)
function utf8Encode(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function sha1Raw(msgBytes: Uint8Array): Uint8Array {
  const len = msgBytes.length;
  const wordCount = ((len + 8) >> 6) + 1;
  const words = new Uint32Array(wordCount * 16);

  for (let i = 0; i < len; i++) {
    words[i >> 2] |= msgBytes[i] << (24 - (i % 4) * 8);
  }
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  words[words.length - 1] = (len * 8) >>> 0;
  words[words.length - 2] = Math.floor((len * 8) / 0x100000000) >>> 0;

  let h0 = 0x67452301,
    h1 = 0xefcdab89,
    h2 = 0x98badcfe,
    h3 = 0x10325476,
    h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[i + t];
    for (let t = 16; t < 80; t++) {
      const val = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w[t] = (val << 1) | (val >>> 31);
    }

    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4;

    for (let t = 0; t < 80; t++) {
      let f: number, k: number;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const res = new Uint8Array(20);
  const hashes = [h0, h1, h2, h3, h4];
  for (let i = 0; i < 5; i++) {
    res[i * 4] = (hashes[i] >>> 24) & 0xff;
    res[i * 4 + 1] = (hashes[i] >>> 16) & 0xff;
    res[i * 4 + 2] = (hashes[i] >>> 8) & 0xff;
    res[i * 4 + 3] = hashes[i] & 0xff;
  }
  return res;
}

function hmacSha1Hex(keyStr: string, messageStr: string): string {
  let keyBytes = utf8Encode(keyStr);
  if (keyBytes.length > 64) {
    keyBytes = sha1Raw(keyBytes);
  }

  const kPadInner = new Uint8Array(64);
  const kPadOuter = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const k = i < keyBytes.length ? keyBytes[i] : 0;
    kPadInner[i] = k ^ 0x36;
    kPadOuter[i] = k ^ 0x5c;
  }

  const msgBytes = utf8Encode(messageStr);
  const innerMsg = new Uint8Array(64 + msgBytes.length);
  innerMsg.set(kPadInner);
  innerMsg.set(msgBytes, 64);
  const innerHash = sha1Raw(innerMsg);

  const outerMsg = new Uint8Array(64 + 20);
  outerMsg.set(kPadOuter);
  outerMsg.set(innerHash, 64);
  const outerHash = sha1Raw(outerMsg);

  let hex = '';
  for (let i = 0; i < outerHash.length; i++) {
    hex += outerHash[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export class TeraBoxService {
  private static instance: TeraBoxService;
  private readonly memoryCache = new Map<string, { data: ExtractTeraBoxResult; ts: number }>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes client cache

  public static getInstance(): TeraBoxService {
    if (!TeraBoxService.instance) {
      TeraBoxService.instance = new TeraBoxService();
    }
    return TeraBoxService.instance;
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
      '1024terabox.com',
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
   * 100% Standalone Client-Side Video Stream Extractor.
   * Directly contacts TeraBox edge servers, decrypts signatures, and yields multi-bitrate HLS streams.
   */
  public async extractStream(url: string): Promise<ExtractTeraBoxResult> {
    const trimmedUrl = url.trim();
    const surl = this.extractSurl(trimmedUrl);
    const cacheKey = surl || trimmedUrl;

    // Direct video file link shortcut
    if (/\.(mp4|mkv|mov|webm|m3u8)(\?.*)?$/i.test(trimmedUrl)) {
      return {
        success: true,
        title: trimmedUrl.split('/').pop()?.split('?')[0] || 'Direct Video Stream',
        thumbnail: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&q=80',
        duration: 7200,
        streams: [
          { quality: '1080p', url: trimmedUrl, resolution: '1920x1080', format: 'video/mp4' },
          { quality: '720p', url: trimmedUrl, resolution: '1280x720', format: 'video/mp4' },
          { quality: '480p', url: trimmedUrl, resolution: '854x480', format: 'video/mp4' },
        ],
        extractedAt: new Date().toISOString(),
      };
    }

    // Check in-memory cache
    const cached = this.memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL_MS) {
      return cached.data;
    }

    // Attempt direct extraction across primary TeraBox edge domains
    const domains = ['https://www.terabox.app', 'https://www.1024tera.com', 'https://www.terabox.com'];
    let lastError: Error | null = null;

    for (const baseDomain of domains) {
      try {
        const sharePageUrl = `${baseDomain}/sharing/link?surl=${surl}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);

        const pageRes = await fetch(sharePageUrl, {
          method: 'GET',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!pageRes.ok) {
          continue;
        }

        const html = await pageRes.text();

        // 1. Parse Set-Cookie header for browserid
        let browserid = '';
        const rawCookies = pageRes.headers.get('set-cookie') || '';
        const browserIdMatch = rawCookies.match(/browserid=([^;,\s]+)/);
        if (browserIdMatch && browserIdMatch[1]) {
          browserid = browserIdMatch[1];
        } else {
          // Generate deterministic fallback browserid if header not exposed by client engine
          browserid = 'wIQdbvRzImWn9EkhGiIZuyuYLN1Y6-tUiVOHlvdt0WKEdzonNrB896NBPic=';
        }

        // 2. Parse jsToken from HTML
        const jsTokenMatch =
          html.match(/fn%28%22([A-F0-9]+)%22%29/i) || html.match(/fn\("([A-F0-9]+)"\)/i);
        const jsToken = jsTokenMatch ? jsTokenMatch[1] : '';

        // 3. Parse state
        const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/s);
        if (!stateMatch) {
          continue;
        }

        let state: any;
        try {
          state = JSON.parse(stateMatch[1]);
        } catch {
          continue;
        }

        const shareInfo = state.pinia?.share?.shareInfo;
        if (!shareInfo || shareInfo.errno !== 0) {
          throw new Error('TeraBox share link expired or deleted.');
        }

        const currentFile =
          state.pinia?.share?.currentFile ||
          (Array.isArray(state.pinia?.share?.shareFiles) ? state.pinia.share.shareFiles[0] : null);

        if (!currentFile) {
          throw new Error('No playable media file found in this TeraBox share link.');
        }

        const uk = shareInfo.uk;
        const shareid = shareInfo.shareid;
        const fs_id = currentFile.fs_id;
        const timestamp = Math.floor(Date.now() / 1000);
        const signKey = 'iuuPc64E4Fhn0rTXEzrnbLph0o5qyEEa';
        const sign = hmacSha1Hex(signKey, `00${browserid}${timestamp}`);

        const width = Number(currentFile.width) || 0;
        const height = Number(currentFile.height) || 0;
        const maxDim = Math.max(width, height);

        const qualityConfigs = [
          { label: '1080p', type: 'M3U8_AUTO_1080', minDim: 1080, res: '1920x1080' },
          { label: '720p', type: 'M3U8_AUTO_720', minDim: 720, res: '1280x720' },
          { label: '480p', type: 'M3U8_AUTO_480', minDim: 0, res: '854x480' },
          { label: '360p', type: 'M3U8_AUTO_360', minDim: 0, res: '640x360' },
        ];

        const streams: TeraBoxStream[] = [];
        for (const q of qualityConfigs) {
          if (maxDim > 0 && q.minDim > 0 && maxDim < q.minDim) {
            continue;
          }
          const streamUrl = `${baseDomain}/share/streaming?uk=${uk}&shareid=${shareid}&type=${q.type}&fid=${fs_id}&sign=${sign}&timestamp=${timestamp}&jsToken=${jsToken}&esl=1&isplayer=1&ehps=1&clienttype=0&app_id=250528&web=1&channel=0`;
          streams.push({
            quality: q.label,
            url: streamUrl,
            resolution: q.res,
            format: 'application/x-mpegURL',
          });
        }

        // If no streams qualified, add 480p and 360p by default
        if (streams.length === 0) {
          for (const q of ['480p', '360p']) {
            streams.push({
              quality: q,
              url: `${baseDomain}/share/streaming?uk=${uk}&shareid=${shareid}&type=M3U8_AUTO_${q.replace('p', '')}&fid=${fs_id}&sign=${sign}&timestamp=${timestamp}&jsToken=${jsToken}&esl=1&isplayer=1&ehps=1&clienttype=0&app_id=250528&web=1&channel=0`,
              resolution: q === '480p' ? '854x480' : '640x360',
              format: 'application/x-mpegURL',
            });
          }
        }

        const result: ExtractTeraBoxResult = {
          success: true,
          title: currentFile.server_filename || 'TeraBox Video Stream',
          thumbnail:
            currentFile.thumbs?.url3 ||
            currentFile.thumbs?.url2 ||
            currentFile.thumbs?.url1 ||
            'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&q=80',
          duration: Math.round(Number(currentFile.duration) || 7200),
          size: Number(currentFile.size) || 0,
          streams,
          shareId: String(shareid || ''),
          fsId: String(fs_id || ''),
          extractedAt: new Date().toISOString(),
        };

        this.memoryCache.set(cacheKey, { data: result, ts: Date.now() });
        return result;
      } catch (err: any) {
        lastError = err;
      }
    }

    throw (
      lastError ||
      new Error('Could not extract video stream. The link may be expired, password-protected, or invalid.')
    );
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
