import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as https from 'https';
import * as dns from 'dns';
import * as zlib from 'zlib';
import * as stream from 'stream';
import { MovieBookmark } from './entities/movie-bookmark.entity';
import { BookmarkMovieDto } from './dto/movie.dto';

export interface TMDbMovie {
  id: number;
  title: string;
  original_title?: string;
  original_language?: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  vote_count: number;
  release_date: string;
  genre_ids: number[];
  genres?: { id: number; name: string }[];
  runtime?: number;
  tagline?: string;
  trailer_key?: string;
  director?: string;
  cast?: { id: number; name: string; character: string; profile_path: string }[];
  category?: 'trending' | 'now_playing' | 'popular' | 'top_rated' | 'upcoming';
  is_tv?: boolean;
}

export const TMDB_GENRES = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 36, name: 'History' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Sci-Fi' },
  { id: 10770, name: 'TV Movie' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'War' },
  { id: 37, name: 'Western' },
];

@Injectable()
export class MoviesService {
  private readonly logger = new Logger(MoviesService.name);
  // Default working TMDb API Key with fallback to env
  private readonly tmdbApiKey =
    process.env.TMDB_API_KEY || '4e44d9029b1270a757cddc766a1bcb63';
  private readonly tmdbBaseUrl = 'https://api.themoviedb.org/3';

  // In-memory fallback watchlist if database connection is unavailable
  private inMemoryBookmarks: Map<number, any> = new Map();

  // Isolated DNS resolver instance configured with public resolvers (no global process mutation)
  private readonly dnsResolver = (() => {
    const r = new dns.Resolver();
    try {
      r.setServers(['8.8.8.8', '1.1.1.1']);
    } catch {}
    return r;
  })();

  // Custom HTTPS Agent that performs IPv4 DNS resolution via public DNS to bypass ISP blocking
  private readonly dnsAgent = new https.Agent({
    keepAlive: true,
    lookup: (hostname, opt, cb) => {
      const callback = typeof opt === 'function' ? opt : cb;
      const options = typeof opt === 'object' && opt ? opt : {};
      this.dnsResolver.resolve4(hostname, (err, addrs) => {
        if (err || !addrs || addrs.length === 0) {
          return dns.lookup(hostname, options as any, callback);
        }
        if (options && (options as any).all) {
          callback(null, addrs.map((a) => ({ address: a, family: 4 })) as any);
        } else {
          callback(null, addrs[0], 4);
        }
      });
    },
  });

  constructor(
    @InjectRepository(MovieBookmark)
    private readonly bookmarkRepo?: Repository<MovieBookmark>,
  ) {}

  /**
   * Safe fetch with short timeout against the TMDb API.
   * Resolves directly via public IPv4 DNS to bypass regional ISP DPI blocks.
   */
  private fetchTMDb<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    return new Promise((resolve) => {
      try {
        const url = new URL(`${this.tmdbBaseUrl}${endpoint}`);
        url.searchParams.set('api_key', this.tmdbApiKey);
        url.searchParams.set('language', 'en-US');
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            url.searchParams.set(k, v);
          }
        });

        const req = https.request(
          url.toString(),
          {
            agent: this.dnsAgent,
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'User-Agent': 'OmniHub-CineVerse/2.0',
            },
            timeout: 10000,
          },
          (res) => {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              this.logger.warn(`TMDb API responded with status ${res.statusCode} for ${endpoint}`);
              resolve(null);
              return;
            }

            const encoding = (res.headers['content-encoding'] || '').toLowerCase();
            let responseStream: stream.Readable = res;
            if (encoding === 'gzip') {
              responseStream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
              responseStream = res.pipe(zlib.createInflate());
            } else if (encoding === 'br') {
              responseStream = res.pipe(zlib.createBrotliDecompress());
            }

            let data = '';
            responseStream.on('data', (chunk) => {
              data += chunk;
            });
            responseStream.on('end', () => {
              try {
                resolve(JSON.parse(data) as T);
              } catch {
                resolve(null);
              }
            });
            responseStream.on('error', () => {
              resolve(null);
            });
          },
        );

        req.on('error', (err) => {
          this.logger.warn(`TMDb API live fetch failed for ${endpoint}: ${err?.message || err}`);
          resolve(null);
        });

        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });

        req.end();
      } catch (err: any) {
        this.logger.warn(`TMDb fetch exception: ${err?.message || err}`);
        resolve(null);
      }
    });
  }

  /**
   * Helper to format raw TMDb response movie to unified format
   */
  private formatMovie(m: any, defaultCategory: 'trending' | 'now_playing' | 'popular' | 'top_rated' | 'upcoming' = 'popular'): TMDbMovie {
    const poster = m.poster_path
      ? m.poster_path.startsWith('http')
        ? m.poster_path
        : `https://image.tmdb.org/t/p/w500${m.poster_path.startsWith('/') ? '' : '/'}${m.poster_path}`
      : '';

    const backdrop = m.backdrop_path
      ? m.backdrop_path.startsWith('http')
        ? m.backdrop_path
        : `https://image.tmdb.org/t/p/original${m.backdrop_path.startsWith('/') ? '' : '/'}${m.backdrop_path}`
      : poster;

    return {
      id: m.id,
      title: m.title || m.name || 'Untitled',
      original_title: m.original_title || m.original_name || m.title || m.name,
      original_language: m.original_language || undefined,
      overview: m.overview || 'No synopsis available for this title.',
      poster_path: poster,
      backdrop_path: backdrop,
      vote_average: Number((m.vote_average || 0).toFixed(1)),
      vote_count: m.vote_count || 0,
      release_date: m.release_date || m.first_air_date || '',
      genre_ids: m.genre_ids || (m.genres ? m.genres.map((g: any) => g.id) : []),
      genres: m.genres,
      runtime: m.runtime || (Array.isArray(m.episode_run_time) ? m.episode_run_time[0] : undefined),
      tagline: m.tagline || '',
      category: defaultCategory,
      is_tv: Boolean(m.is_tv || m.media_type === 'tv' || m.first_air_date),
    };
  }

  async getTrending(page = 1): Promise<{ results: TMDbMovie[]; page: number; total_pages: number; total_results: number }> {
    const live = await this.fetchTMDb<any>('/trending/movie/week', { page: String(page) });
    if (live && Array.isArray(live.results) && live.results.length > 0) {
      return {
        results: live.results.map((m: any) => this.formatMovie(m, 'trending')),
        page: live.page || 1,
        total_pages: live.total_pages || 1,
        total_results: live.total_results || live.results.length,
      };
    }

    return {
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    };
  }

  async getNowPlaying(page = 1): Promise<{ results: TMDbMovie[]; page: number; total_pages: number }> {
    const live = await this.fetchTMDb<any>('/movie/now_playing', { page: String(page) });
    if (live && Array.isArray(live.results) && live.results.length > 0) {
      return {
        results: live.results.map((m: any) => this.formatMovie(m, 'now_playing')),
        page: live.page || 1,
        total_pages: live.total_pages || 1,
      };
    }

    return {
      results: [],
      page: 1,
      total_pages: 0,
    };
  }

  async getPopular(page = 1): Promise<{ results: TMDbMovie[]; page: number; total_pages: number }> {
    const live = await this.fetchTMDb<any>('/movie/popular', { page: String(page) });
    if (live && Array.isArray(live.results) && live.results.length > 0) {
      return {
        results: live.results.map((m: any) => this.formatMovie(m, 'popular')),
        page: live.page || 1,
        total_pages: live.total_pages || 1,
      };
    }

    return {
      results: [],
      page: 1,
      total_pages: 0,
    };
  }

  async getTopRated(page = 1): Promise<{ results: TMDbMovie[]; page: number; total_pages: number }> {
    const live = await this.fetchTMDb<any>('/movie/top_rated', { page: String(page) });
    if (live && Array.isArray(live.results) && live.results.length > 0) {
      return {
        results: live.results.map((m: any) => this.formatMovie(m, 'top_rated')),
        page: live.page || 1,
        total_pages: live.total_pages || 1,
      };
    }

    return {
      results: [],
      page: 1,
      total_pages: 0,
    };
  }

  async getUpcoming(page = 1): Promise<{ results: TMDbMovie[]; page: number; total_pages: number }> {
    const live = await this.fetchTMDb<any>('/movie/upcoming', { page: String(page) });
    if (live && Array.isArray(live.results) && live.results.length > 0) {
      return {
        results: live.results.map((m: any) => this.formatMovie(m, 'upcoming')),
        page: live.page || 1,
        total_pages: live.total_pages || 1,
      };
    }

    return {
      results: [],
      page: 1,
      total_pages: 0,
    };
  }

  async getGenres(): Promise<{ genres: { id: number; name: string }[] }> {
    const live = await this.fetchTMDb<any>('/genre/movie/list');
    if (live && Array.isArray(live.genres) && live.genres.length > 0) {
      return live;
    }
    return { genres: TMDB_GENRES };
  }

  async discover(options: {
    language?: string;
    isTv?: boolean;
    genreId?: number;
    page?: number;
  }): Promise<{ results: TMDbMovie[]; page: number; total_pages: number; total_results: number }> {
    const pageNum = options.page ? Number(options.page) : 1;
    const endpoint = options.isTv ? '/discover/tv' : '/discover/movie';
    const params: Record<string, string> = {
      sort_by: 'popularity.desc',
      page: String(pageNum),
    };

    if (options.language && options.language !== 'all') {
      params.with_original_language = options.language;
    }

    if (options.genreId) {
      params.with_genres = String(options.genreId);
    }

    const live = await this.fetchTMDb<any>(endpoint, params);
    if (live && Array.isArray(live.results) && live.results.length > 0) {
      return {
        results: live.results.map((m: any) => this.formatMovie(m, 'popular')),
        page: live.page || pageNum,
        total_pages: live.total_pages || 1,
        total_results: live.total_results || live.results.length,
      };
    }

    return {
      results: [],
      page: pageNum,
      total_pages: 0,
      total_results: 0,
    };
  }

  async search(
    query: string,
    genreId?: number,
    page = 1,
    language?: string,
  ): Promise<{ results: TMDbMovie[]; page: number; total_results: number }> {
    const qClean = (query || '').trim();

    if (qClean.length > 0) {
      // Use multi search to support both movies and TV shows
      const live = await this.fetchTMDb<any>('/search/multi', {
        query: qClean,
        page: String(page),
      });

      if (live && Array.isArray(live.results) && live.results.length > 0) {
        let results = live.results
          .filter((m: any) => m.media_type === 'movie' || m.media_type === 'tv' || !m.media_type)
          .map((m: any) => this.formatMovie(m));
        if (language && language !== 'all') {
          results = results.filter((m: any) => m.original_language === language);
        }
        if (genreId) {
          results = results.filter((m: any) => m.genre_ids?.includes(Number(genreId)));
        }
        return {
          results,
          page: live.page || 1,
          total_results: live.total_results || results.length,
        };
      }
    } else if (genreId || (language && language !== 'all')) {
      // If query is empty but genreId or language is provided, use discover endpoint
      return this.discover({ language, genreId, page });
    }

    return {
      results: [],
      page: 1,
      total_results: 0,
    };
  }

  /**
   * Resolves TMDb ID for any TV show or movie by IMDb ID or title query.
   * Utilizes the backend's public DNS agent to bypass ISP blocking.
   */
  async findTmdb(
    imdbId?: string,
    query?: string,
    isTv?: boolean,
  ): Promise<{ tmdbId: number | null; mediaType?: 'movie' | 'tv'; title?: string }> {
    // 1. Try finding by IMDb ID (/find/{external_id})
    if (imdbId) {
      const cleanImdb = imdbId.trim();
      const findRes = await this.fetchTMDb<any>(`/find/${cleanImdb}`, {
        external_source: 'imdb_id',
      });
      if (findRes) {
        if (isTv !== false && Array.isArray(findRes.tv_results) && findRes.tv_results.length > 0) {
          return {
            tmdbId: findRes.tv_results[0].id,
            mediaType: 'tv',
            title: findRes.tv_results[0].name || findRes.tv_results[0].title,
          };
        }
        if (Array.isArray(findRes.movie_results) && findRes.movie_results.length > 0) {
          return {
            tmdbId: findRes.movie_results[0].id,
            mediaType: 'movie',
            title: findRes.movie_results[0].title || findRes.movie_results[0].name,
          };
        }
        if (Array.isArray(findRes.tv_results) && findRes.tv_results.length > 0) {
          return {
            tmdbId: findRes.tv_results[0].id,
            mediaType: 'tv',
            title: findRes.tv_results[0].name || findRes.tv_results[0].title,
          };
        }
      }
    }

    // 2. Try searching by title query
    if (query) {
      const qClean = query.trim();
      const searchEndpoint = isTv ? '/search/tv' : '/search/multi';
      const searchRes = await this.fetchTMDb<any>(searchEndpoint, {
        query: qClean,
      });
      if (searchRes && Array.isArray(searchRes.results) && searchRes.results.length > 0) {
        const first = searchRes.results[0];
        return {
          tmdbId: first.id,
          mediaType: first.media_type || (isTv ? 'tv' : 'movie'),
          title: first.name || first.title,
        };
      }
    }

    return { tmdbId: null };
  }

  async getMovieDetails(id: number | string): Promise<TMDbMovie> {
    const numId = Number(id);

    // Try fetching movie first with credits and videos appended
    let live = await this.fetchTMDb<any>(`/movie/${numId}`, {
      append_to_response: 'credits,videos,recommendations',
    });

    // If not found, check if it is a TV series on TMDb
    if (!live || !live.id) {
      live = await this.fetchTMDb<any>(`/tv/${numId}`, {
        append_to_response: 'credits,videos,recommendations',
      });
    }

    if (live && live.id) {
      const movie = this.formatMovie(live);
      movie.runtime =
        live.runtime ||
        (Array.isArray(live.episode_run_time) && live.episode_run_time.length > 0
          ? live.episode_run_time[0]
          : undefined);
      movie.tagline = live.tagline;
      movie.genres = live.genres;

      // Extract director / creator and cast
      if (live.credits) {
        const dir =
          live.credits.crew?.find((c: any) => c.job === 'Director') ||
          (live.created_by && live.created_by.length > 0 ? { name: live.created_by[0].name } : undefined);
        if (dir) movie.director = dir.name;
        if (Array.isArray(live.credits.cast)) {
          movie.cast = live.credits.cast.slice(0, 10).map((c: any) => ({
            id: c.id,
            name: c.name,
            character: c.character || 'Cast',
            profile_path: c.profile_path
              ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
              : '',
          }));
        }
      }

      // Extract official trailer key
      if (live.videos && Array.isArray(live.videos.results)) {
        const trailer =
          live.videos.results.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube') ||
          live.videos.results[0];
        if (trailer?.key) {
          movie.trailer_key = trailer.key;
        }
      }

      return movie;
    }

    throw new NotFoundException(`Movie or TV title with ID ${id} not found on TMDb`);
  }

  async getCredits(id: number | string) {
    const movie = await this.getMovieDetails(id);
    return {
      id: movie.id,
      cast: movie.cast || [],
      director: movie.director,
    };
  }

  async getVideos(id: number | string) {
    const movie = await this.getMovieDetails(id);
    return {
      id: movie.id,
      results: movie.trailer_key
        ? [
            {
              id: `trailer-${movie.id}`,
              key: movie.trailer_key,
              name: `${movie.title} - Official Trailer`,
              site: 'YouTube',
              type: 'Trailer',
            },
          ]
        : [],
    };
  }

  async getRecommendations(id: number | string): Promise<{ results: TMDbMovie[] }> {
    const numId = Number(id);
    const live = await this.fetchTMDb<any>(`/movie/${numId}/recommendations`);
    if (live && Array.isArray(live.results) && live.results.length > 0) {
      return {
        results: live.results.slice(0, 10).map((m: any) => this.formatMovie(m)),
      };
    }
    return {
      results: [],
    };
  }

  // --- Watchlist Persistence ---
  async getWatchlist(userId?: string): Promise<MovieBookmark[]> {
    if (this.bookmarkRepo) {
      try {
        const whereClause: any = {};
        if (userId) {
          whereClause.userId = userId;
        }
        return await this.bookmarkRepo.find({
          where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
          order: { createdAt: 'DESC' },
        });
      } catch (err) {
        this.logger.warn('Failed to query bookmarkRepo, using in-memory list');
      }
    }
    const all = Array.from(this.inMemoryBookmarks.values());
    return userId ? all.filter((b) => b.userId === userId) : all;
  }

  async addToWatchlist(dto: BookmarkMovieDto): Promise<MovieBookmark> {
    const tid = Number(dto.tmdbId);
    const isTvBool = Boolean(dto.isTv);

    if (this.bookmarkRepo) {
      try {
        const whereClause: any = { tmdbId: tid, isTv: isTvBool };
        if (dto.userId) {
          whereClause.userId = dto.userId;
        }
        let existing = await this.bookmarkRepo.findOne({ where: whereClause });
        if (existing) {
          existing.isWatched = dto.isWatched ?? existing.isWatched;
          existing.isTv = isTvBool;
          return await this.bookmarkRepo.save(existing);
        }

        const newBookmark = this.bookmarkRepo.create({
          userId: dto.userId || null,
          tmdbId: tid,
          title: dto.title,
          overview: dto.overview || '',
          posterPath: dto.posterPath || '',
          backdropPath: dto.backdropPath || '',
          voteAverage: dto.voteAverage || 0,
          releaseDate: dto.releaseDate || '',
          genres: dto.genres || [],
          runtime: dto.runtime || 0,
          isWatched: Boolean(dto.isWatched),
          isTv: isTvBool,
        });

        const saved = await this.bookmarkRepo.save(newBookmark);
        const memKey = `${dto.userId || 'anon'}-${tid}-${isTvBool ? 1 : 0}`;
        this.inMemoryBookmarks.set(memKey as any, saved);
        return saved;
      } catch (err) {
        this.logger.warn('Database save failed, saving to in-memory store');
      }
    }

    const memoryItem: any = {
      id: `mem-${tid}-${Date.now()}`,
      userId: dto.userId || null,
      tmdbId: tid,
      title: dto.title,
      overview: dto.overview || '',
      posterPath: dto.posterPath || '',
      backdropPath: dto.backdropPath || '',
      voteAverage: dto.voteAverage || 0,
      releaseDate: dto.releaseDate || '',
      genres: dto.genres || [],
      runtime: dto.runtime || 0,
      isWatched: Boolean(dto.isWatched),
      isTv: isTvBool,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const memKey = `${dto.userId || 'anon'}-${tid}-${isTvBool ? 1 : 0}`;
    this.inMemoryBookmarks.set(memKey as any, memoryItem);
    return memoryItem;
  }

  async removeFromWatchlist(tmdbId: number | string, userId?: string, isTv?: boolean): Promise<{ success: boolean }> {
    const tid = Number(tmdbId);
    if (this.inMemoryBookmarks) {
      for (const [k, v] of this.inMemoryBookmarks.entries()) {
        if (v.tmdbId === tid && (!userId || v.userId === userId)) {
          this.inMemoryBookmarks.delete(k);
        }
      }
    }

    if (this.bookmarkRepo) {
      try {
        const whereClause: any = { tmdbId: tid };
        if (userId) whereClause.userId = userId;
        if (isTv !== undefined) whereClause.isTv = Boolean(isTv);
        await this.bookmarkRepo.delete(whereClause);
      } catch (err) {
        this.logger.warn(`Failed to delete bookmark ${tid} from database: ${err}`);
      }
    }
    return { success: true };
  }

  async toggleWatched(tmdbId: number | string, isWatched?: boolean, userId?: string, isTv?: boolean): Promise<any> {
    const tid = Number(tmdbId);

    if (this.bookmarkRepo) {
      try {
        const whereClause: any = { tmdbId: tid };
        if (userId) whereClause.userId = userId;
        if (isTv !== undefined) whereClause.isTv = Boolean(isTv);
        const bookmark = await this.bookmarkRepo.findOne({ where: whereClause });
        if (bookmark) {
          bookmark.isWatched = isWatched !== undefined ? isWatched : !bookmark.isWatched;
          const saved = await this.bookmarkRepo.save(bookmark);
          for (const [k, v] of this.inMemoryBookmarks.entries()) {
            if (v.tmdbId === tid && (isTv === undefined || v.isTv === isTv)) {
              this.inMemoryBookmarks.set(k, saved);
            }
          }
          return saved;
        }
      } catch (err) {
        this.logger.warn('Failed to update watched status in DB');
      }
    }

    for (const [k, mem] of this.inMemoryBookmarks.entries()) {
      if (
        mem.tmdbId === tid &&
        (!userId || mem.userId === userId) &&
        (isTv === undefined || mem.isTv === isTv)
      ) {
        mem.isWatched = isWatched !== undefined ? isWatched : !mem.isWatched;
        this.inMemoryBookmarks.set(k, mem);
        return mem;
      }
    }

    return { tmdbId: tid, isWatched: Boolean(isWatched), isTv };
  }


  // --- TVmaze Public API (TV Series, Schedules, Episodes) ---
  private async fetchTVMaze<T>(endpoint: string, params?: Record<string, string>): Promise<T | null> {
    try {
      const url = new URL(`https://api.tvmaze.com${endpoint}`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  async getTVMazeShows(page = 0, language?: string) {
    const live = await this.fetchTVMaze<any[]>('/shows', { page: String(page) });
    if (Array.isArray(live) && live.length > 0) {
      if (language && language !== 'all') {
        const langLower = language.toLowerCase();
        const codeMap: Record<string, string> = {
          hi: 'hindi',
          en: 'english',
          ja: 'japanese',
          ko: 'korean',
          es: 'spanish',
          fr: 'french',
          de: 'german',
          ta: 'tamil',
          te: 'telugu',
          ml: 'malayalam',
          kn: 'kannada',
          bn: 'bengali',
          pa: 'punjabi',
          mr: 'marathi',
        };
        const targetLang = codeMap[langLower] || langLower;
        const filtered = live.filter(
          (show) => show.language && show.language.toLowerCase().includes(targetLang),
        );
        return filtered.length > 0 ? filtered : live;
      }
      return live;
    }
    return [];
  }

  async getTVMazeSchedule(country = 'US', date?: string) {
    const live = await this.fetchTVMaze<any[]>('/schedule', {
      country,
      date: date || new Date().toISOString().slice(0, 10),
    });
    if (Array.isArray(live) && live.length > 0) {
      return live;
    }
    return [];
  }

  async getTVMazeEpisodes(showId: string | number) {
    const live = await this.fetchTVMaze<any[]>(`/shows/${showId}/episodes`);
    if (Array.isArray(live) && live.length > 0) {
      return live;
    }
    return [];
  }

  async getTVMazeSeasons(showId: string | number) {
    const live = await this.fetchTVMaze<any[]>(`/shows/${showId}/seasons`);
    if (Array.isArray(live) && live.length > 0) {
      return live;
    }
    return [];
  }

  async searchTVMazeShows(query: string) {
    const live = await this.fetchTVMaze<any[]>('/search/shows', { q: query });
    if (Array.isArray(live) && live.length > 0) {
      return live;
    }
    return [];
  }

  async getTVMazeCast(showId: string | number) {
    const live = await this.fetchTVMaze<any[]>(`/shows/${showId}/cast`);
    if (Array.isArray(live) && live.length > 0) {
      return live;
    }
    return [];
  }
}

