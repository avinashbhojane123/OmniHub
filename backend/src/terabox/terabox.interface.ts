export interface TeraBoxFileItem {
  fs_id: string | number;
  server_filename: string;
  size: number;
  category?: number;
  duration?: number;
  thumbs?: {
    url1?: string;
    url2?: string;
    url3?: string;
    icon?: string;
  };
  dlink?: string;
  resolutions?: Record<string, string>;
}

export interface TeraBoxShareApiResponse {
  errno: number;
  errmsg?: string;
  list?: TeraBoxFileItem[];
  shareid?: string | number;
  uk?: string | number;
  title?: string;
}

export interface CachedStreamMetadata {
  title: string;
  thumbnail: string;
  duration: number;
  size: number;
  streams: Array<{
    quality: string;
    url: string;
    resolution?: string;
    format?: string;
  }>;
  shareId?: string;
  fsId?: string;
  cachedAt: number;
  expiresAt: number;
}

