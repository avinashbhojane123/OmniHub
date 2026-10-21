import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import { statSync, createReadStream, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, extname, basename } from 'path';

export interface StreamableMedia {
  id: string;
  title: string;
  type: 'movie' | 'series';
  filename?: string;
  sourceType: 'local' | 'remote';
  sourceUrl?: string;
  duration?: string;
  quality: string;
  sizeBytes?: number;
  overview: string;
  posterUrl: string;
  backdropUrl: string;
  genres: string[];
  releaseYear: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodes?: {
    episodeNumber: number;
    title: string;
    duration: string;
    streamId: string;
  }[];
  tmdbId?: number;
}

export const BUILTIN_STREAM_CATALOG: StreamableMedia[] = [
  {
    id: 'stream-tears-of-steel',
    title: 'Tears of Steel (Sci-Fi Full Feature)',
    type: 'movie',
    sourceType: 'remote',
    sourceUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    duration: '12m 14s',
    quality: '1080p Full HD',
    overview:
      'Set in a dystopian future Amsterdam, a group of scientists and soldiers attempt to reset the past by reconnecting with a giant robot AI in this stunning sci-fi VFX feature.',
    posterUrl:
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&q=80',
    backdropUrl:
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80',
    genres: ['Sci-Fi', 'Action', 'VFX'],
    releaseYear: '2024',
  },
  {
    id: 'stream-big-buck-bunny',
    title: 'Big Buck Bunny (Full Movie)',
    type: 'movie',
    sourceType: 'remote',
    sourceUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    duration: '9m 56s',
    quality: '4K Ultra HD',
    overview:
      'A large and lovable rabbit deals with bullying forest creatures in this award-winning 3D computer-animated comedy feature.',
    posterUrl:
      'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&q=80',
    backdropUrl:
      'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200&q=80',
    genres: ['Animation', 'Comedy', 'Family'],
    releaseYear: '2023',
  },
  {
    id: 'stream-sintel',
    title: 'Sintel: The Dragon Quest (Full Movie)',
    type: 'movie',
    sourceType: 'remote',
    sourceUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    duration: '14m 48s',
    quality: '1080p HD',
    overview:
      'A lonely young girl named Sintel rescues a wounded baby dragon and embarks on a dangerous journey across frozen mountains to reclaim him.',
    posterUrl:
      'https://images.unsplash.com/photo-1514539079130-25950c84af65?w=500&q=80',
    backdropUrl:
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80',
    genres: ['Animation', 'Fantasy', 'Adventure'],
    releaseYear: '2023',
  },
  {
    id: 'series-cyberpunk-chronicles',
    title: 'Cyberpunk Chronicles: Season 1',
    type: 'series',
    sourceType: 'remote',
    duration: '3 Episodes',
    quality: '1080p HDR',
    overview:
      'An episodic sci-fi series exploring autonomous robotics, clandestine hackers, and futuristic space travel.',
    posterUrl:
      'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=500&q=80',
    backdropUrl:
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&q=80',
    genres: ['Sci-Fi', 'Cyberpunk', 'Series'],
    releaseYear: '2024',
    episodes: [
      {
        episodeNumber: 1,
        title: 'Episode 1: The Machine Awakens',
        duration: '12m 14s',
        streamId: 'stream-tears-of-steel',
      },
      {
        episodeNumber: 2,
        title: 'Episode 2: The Forest Protocol',
        duration: '9m 56s',
        streamId: 'stream-big-buck-bunny',
      },
      {
        episodeNumber: 3,
        title: 'Episode 3: The Golden Drake',
        duration: '14m 48s',
        streamId: 'stream-sintel',
      },
    ],
  },
];

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly videosDir: string;

  constructor() {
    this.videosDir = join(process.cwd(), 'videos');
    if (!existsSync(this.videosDir)) {
      mkdirSync(this.videosDir, { recursive: true });
    }
  }

  getVideosDirectory(): string {
    return this.videosDir;
  }

  /**
   * Scans local videos folder and merges with built-in streaming catalog
   */
  async getCatalog(): Promise<StreamableMedia[]> {
    const localVideos: StreamableMedia[] = [];

    try {
      if (existsSync(this.videosDir)) {
        const files = readdirSync(this.videosDir);
        for (const file of files) {
          const ext = extname(file).toLowerCase();
          if (['.mp4', '.mkv', '.webm', '.mov'].includes(ext)) {
            const filePath = join(this.videosDir, file);
            const stat = statSync(filePath);
            const base = basename(file, ext);

            // Clean title from filename (e.g., Dune.Part.Two.1080p.mp4 -> Dune Part Two)
            const cleanTitle = base
              .replace(/[._-]+/g, ' ')
              .replace(/\b(1080p|720p|4k|x264|x265|aac|bluray|webrip)\b/gi, '')
              .trim();

            localVideos.push({
              id: `local-${encodeURIComponent(file)}`,
              title: cleanTitle || file,
              type: file.toLowerCase().includes('s01') || file.toLowerCase().includes('e01') ? 'series' : 'movie',
              filename: file,
              sourceType: 'local',
              quality: file.toLowerCase().includes('4k') ? '4K Ultra HD' : '1080p HD',
              sizeBytes: stat.size,
              overview: `Local video stream from server storage (${(stat.size / (1024 * 1024)).toFixed(1)} MB). Full seek and scrub support.`,
              posterUrl:
                'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80',
              backdropUrl:
                'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1200&q=80',
              genres: ['Local Media', 'Server Stream'],
              releaseYear: '2024',
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to scan local videos directory: ${err.message}`);
    }

    return [...localVideos, ...BUILTIN_STREAM_CATALOG];
  }

  /**
   * Streams a video file using HTTP 206 Partial Content range requests.
   * Enables instant scrubbing, fast seeking, and low memory footprint.
   */
  async streamMedia(
    id: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    // 1. Check if it's a local video file
    if (id.startsWith('local-')) {
      const filename = decodeURIComponent(id.replace('local-', ''));
      const filePath = join(this.videosDir, filename);

      if (!existsSync(filePath)) {
        throw new NotFoundException(`Video file "${filename}" not found on server`);
      }

      const stat = statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      const ext = extname(filePath).toLowerCase();
      const contentType = ext === '.webm' ? 'video/webm' : ext === '.mkv' ? 'video/x-matroska' : 'video/mp4';

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
          res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
          return;
        }

        const chunkSize = end - start + 1;
        const stream = createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        });

        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
        });

        createReadStream(filePath).pipe(res);
      }
      return;
    }

    // 2. Check built-in catalog
    const catalogItem = BUILTIN_STREAM_CATALOG.find((m) => m.id === id);
    if (!catalogItem || !catalogItem.sourceUrl) {
      throw new NotFoundException(`Media stream with ID "${id}" not found`);
    }

    // Proxy the remote video stream with range forwarding for seamless seeking
    try {
      const targetUrl = catalogItem.sourceUrl;
      const headers: Record<string, string> = {};
      if (req.headers.range) {
        headers['range'] = req.headers.range as string;
      }

      const remoteRes = await fetch(targetUrl, { headers });

      res.status(remoteRes.status);
      remoteRes.headers.forEach((value, key) => {
        if (
          [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
          ].includes(key.toLowerCase())
        ) {
          res.setHeader(key, value);
        }
      });
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!remoteRes.body) {
        res.end();
        return;
      }

      // Stream the response buffer chunks to client
      const reader = remoteRes.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (res.writableEnded) {
              await reader.cancel();
              break;
            }
            res.write(Buffer.from(value));
          }
          res.end();
        } catch {
          res.end();
        }
      };

      pump();
    } catch (err: any) {
      this.logger.error(`Error streaming remote media "${id}": ${err.message}`);
      res.status(500).json({ error: 'Failed to stream requested media' });
    }
  }
}
