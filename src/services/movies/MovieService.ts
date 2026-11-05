import {
  Movie,
  Genre,
  MovieBookmark,
  StreamableMedia,
  CastMember,
  ALL_GENRES,
  movieToBookmark,
  getGenresByIds,
} from '../../types';
import { movieRepository } from '../../database/repositories';
import { settingsRepository } from '../../database/repositories';

const DEFAULT_CLOUD_SERVER_URL = 'https://backend-9i6w.onrender.com';

export const GENRE_LIST: Genre[] = [...ALL_GENRES];

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class MovieService {
  private static instance: MovieService;
  private responseCache: Map<string, CacheEntry<any>> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
  private lastWatchlistSync = 0;

  public static getInstance(): MovieService {
    if (!MovieService.instance) {
      MovieService.instance = new MovieService();
    }
    return MovieService.instance;
  }

  private async getBaseUrl(): Promise<string> {
    const rawUrl = await settingsRepository.get('companionServerUrl', '');
    const customUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (customUrl && (customUrl.startsWith('http://') || customUrl.startsWith('https://'))) {
      return customUrl.replace(/\/+$/, '');
    }
    return DEFAULT_CLOUD_SERVER_URL;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.responseCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.responseCache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setInCache<T>(key: string, data: T): void {
    if (this.responseCache.has(key)) {
      this.responseCache.delete(key);
    } else if (this.responseCache.size >= 200) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey) this.responseCache.delete(oldestKey);
    }
    this.responseCache.set(key, { data, timestamp: Date.now() });
  }

  public clearCache(): void {
    this.responseCache.clear();
  }

  private normalizeMovie(raw: any, overrideIsTv?: boolean): Movie {
    if (!raw) {
      return {
        id: 0,
        title: '',
        overview: '',
        poster_path: undefined,
        backdrop_path: undefined,
        vote_average: 0,
        vote_count: 0,
        release_date: '',
        genre_ids: [],
        genres: [],
      };
    }
    const id = Number(raw.id || raw.tmdbId || raw.tmdb_id || 0);

    let poster = raw.poster_path || raw.posterPath || '';
    if (poster && typeof poster === 'string') {
      const cleanPoster = poster.trim();
      if (!cleanPoster || cleanPoster === 'null' || cleanPoster === '/null') {
        poster = '';
      } else if (cleanPoster.startsWith('http://')) {
        poster = cleanPoster.replace(/^http:\/\//i, 'https://');
      } else if (cleanPoster.startsWith('//')) {
        poster = `https:${cleanPoster}`;
      } else if (!cleanPoster.startsWith('http')) {
        poster = `https://image.tmdb.org/t/p/w500${cleanPoster.startsWith('/') ? '' : '/'}${cleanPoster}`;
      } else {
        poster = cleanPoster;
      }
    } else {
      poster = '';
    }

    let backdrop = raw.backdrop_path || raw.backdropPath || '';
    if (backdrop && typeof backdrop === 'string') {
      const cleanBackdrop = backdrop.trim();
      if (!cleanBackdrop || cleanBackdrop === 'null' || cleanBackdrop === '/null') {
        backdrop = '';
      } else if (cleanBackdrop.startsWith('http://')) {
        backdrop = cleanBackdrop.replace(/^http:\/\//i, 'https://');
      } else if (cleanBackdrop.startsWith('//')) {
        backdrop = `https:${cleanBackdrop}`;
      } else if (!cleanBackdrop.startsWith('http')) {
        backdrop = `https://image.tmdb.org/t/p/w1280${cleanBackdrop.startsWith('/') ? '' : '/'}${cleanBackdrop}`;
      } else {
        backdrop = cleanBackdrop;
      }
    } else {
      backdrop = '';
    }

    const rawRating = Number(raw.vote_average ?? raw.rating ?? raw.voteAverage ?? 0);
    const voteAverage = Number.isFinite(rawRating) ? Number(rawRating.toFixed(1)) : 0;
    const rawVotes = Number(raw.vote_count ?? raw.voteCount ?? 0);
    const voteCount = Number.isFinite(rawVotes) ? Math.round(rawVotes) : 0;

    const releaseDate = raw.release_date || raw.first_air_date || raw.releaseDate || '';

    let genreIds: number[] = [];
    if (Array.isArray(raw.genre_ids)) {
      genreIds = raw.genre_ids.map(Number).filter((n: number) => Number.isFinite(n) && n > 0);
    } else if (Array.isArray(raw.genreIds)) {
      genreIds = raw.genreIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0);
    } else if (Array.isArray(raw.genres)) {
      genreIds = raw.genres
        .map((g: any) => (typeof g === 'number' ? g : g.id ? Number(g.id) : 0))
        .filter((n: number) => Number.isFinite(n) && n > 0);
    }

    let genres: Genre[] | undefined = undefined;
    if (Array.isArray(raw.genres) && raw.genres.length > 0) {
      genres = raw.genres
        .filter((g: any) => g && (typeof g === 'object' ? g.name : typeof g === 'string'))
        .map((g: any): Genre =>
          typeof g === 'object' && g
            ? { id: Number(g.id || 0), name: String(g.name || '').trim() }
            : { id: 0, name: String(g).trim() },
        )
        .filter((g: Genre) => g.name.length > 0);
    } else if (genreIds.length > 0) {
      genres = getGenresByIds(genreIds);
    }

    // Extract director or creator from raw, credits.crew, or created_by (TV series)
    let director = raw.director || raw.directorName || undefined;
    if (!director && Array.isArray(raw.credits?.crew)) {
      const dir = raw.credits.crew.find(
        (c: any) => c && (c.job === 'Director' || c.job === 'Executive Producer'),
      );
      if (dir && dir.name) {
        director = String(dir.name).trim();
      }
    }
    if (!director && Array.isArray(raw.created_by) && raw.created_by.length > 0) {
      const creator = raw.created_by.find((c: any) => c && c.name);
      if (creator && creator.name) {
        director = String(creator.name).trim();
      }
    }

    // Extract trailer key from raw or videos.results (prioritize official trailer)
    let trailerKey = raw.trailer_key || raw.trailerKey || undefined;
    if (!trailerKey && Array.isArray(raw.videos?.results)) {
      const officialTrailer = raw.videos.results.find(
        (v: any) => v && v.site === 'YouTube' && v.type === 'Trailer' && v.official,
      );
      const anyTrailer = raw.videos.results.find(
        (v: any) => v && v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'),
      );
      const chosen = officialTrailer || anyTrailer;
      if (chosen && chosen.key) {
        trailerKey = String(chosen.key).trim();
      }
    }

    // Extract cast from raw.cast or credits.cast
    let cast: CastMember[] | undefined = undefined;
    const rawCastList = Array.isArray(raw.cast)
      ? raw.cast
      : Array.isArray(raw.credits?.cast)
        ? raw.credits.cast
        : undefined;

    if (rawCastList && rawCastList.length > 0) {
      cast = rawCastList
        .filter((c: any) => c && (c.id || c.person?.id) && (c.name || c.person?.name))
        .slice(0, 20)
        .map((c: any, idx: number) => {
          const rawImg =
            c.profile_path || c.profilePath || c.person?.image?.medium || c.person?.image?.original;
          let profilePath: string | null = null;
          if (rawImg && typeof rawImg === 'string') {
            const cleanImg = rawImg.trim();
            if (!cleanImg || cleanImg === 'null' || cleanImg === '/null') {
              profilePath = null;
            } else if (cleanImg.startsWith('http://')) {
              profilePath = cleanImg.replace(/^http:\/\//i, 'https://');
            } else if (cleanImg.startsWith('//')) {
              profilePath = `https:${cleanImg}`;
            } else if (cleanImg.startsWith('/')) {
              profilePath = `https://image.tmdb.org/t/p/w185${cleanImg}`;
            } else {
              profilePath = cleanImg;
            }
          }
          const personId = Number(c.id || c.person?.id);
          return {
            id: personId,
            name: String(c.name || c.person?.name || '').trim(),
            character: String(c.character || c.character?.name || '').trim(),
            profile_path: profilePath,
            order: typeof c.order === 'number' ? c.order : idx,
          };
        });
    }

    const isTv =
      overrideIsTv !== undefined
        ? Boolean(overrideIsTv)
        : Boolean(raw.is_tv || raw.isTv || raw.media_type === 'tv');

    const cleanOverview = raw.overview ? String(raw.overview).trim() : '';

    let network: string | undefined = undefined;
    if (typeof raw.network === 'string' && raw.network.trim()) {
      network = raw.network.trim();
    } else if (raw.network && typeof raw.network === 'object' && raw.network.name) {
      network = String(raw.network.name).trim();
    } else if (Array.isArray(raw.networks) && raw.networks.length > 0 && raw.networks[0]?.name) {
      network = String(raw.networks[0].name).trim();
    } else if (raw.webChannel && typeof raw.webChannel === 'object' && raw.webChannel.name) {
      network = String(raw.webChannel.name).trim();
    }

    let imdbId: string | undefined = undefined;
    if (raw.imdb_id || raw.imdbId) {
      imdbId = String(raw.imdb_id || raw.imdbId).trim();
    } else if (raw.external_ids?.imdb_id) {
      imdbId = String(raw.external_ids.imdb_id).trim();
    } else if (raw.externals?.imdb) {
      imdbId = String(raw.externals.imdb).trim();
    }
    if (imdbId === '' || imdbId === 'null') {
      imdbId = undefined;
    }

    const status = typeof raw.status === 'string' && raw.status.trim() ? raw.status.trim() : undefined;
    const category = typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : undefined;

    return {
      id,
      title: raw.title || raw.name || '',
      original_title: raw.original_title || raw.original_name || raw.originalTitle || raw.title || '',
      original_language: raw.original_language || raw.originalLanguage || undefined,
      overview: cleanOverview,
      poster_path: poster || undefined,
      backdrop_path: backdrop || poster || undefined,
      vote_average: voteAverage,
      vote_count: voteCount,
      release_date: releaseDate || '',
      first_air_date: raw.first_air_date || (isTv ? releaseDate : undefined),
      genre_ids: genreIds,
      genres,
      runtime: raw.runtime
        ? Number(raw.runtime)
        : Array.isArray(raw.episode_run_time) && raw.episode_run_time.length > 0
          ? Number(raw.episode_run_time[0])
          : undefined,
      tagline: raw.tagline ? String(raw.tagline).trim() : undefined,
      trailer_key: trailerKey,
      director,
      cast,
      category,
      is_tv: isTv,
      media_type: isTv ? 'tv' : 'movie',
      tvmaze_id: raw.tvmaze_id ? Number(raw.tvmaze_id) : undefined,
      tmdb_id: raw.tmdb_id ? Number(raw.tmdb_id) : id > 0 ? id : undefined,
      imdb_id: imdbId,
      network,
      status,
    };
  }

  private extractMovies(response: any, overrideIsTv?: boolean): Movie[] {
    if (!response) return [];
    let rawList: any[] = [];
    if (Array.isArray(response)) {
      rawList = response;
    } else if (Array.isArray(response.items)) {
      rawList = response.items;
    } else if (Array.isArray(response.results)) {
      rawList = response.results;
    } else if (Array.isArray(response.data)) {
      rawList = response.data;
    } else if (Array.isArray(response.movies)) {
      rawList = response.movies;
    } else if (Array.isArray(response.shows)) {
      rawList = response.shows;
    }
    return rawList
      .filter((item) => item && item.media_type !== 'person')
      .map((item) => this.normalizeMovie(item, overrideIsTv))
      .filter((m) => m.id > 0);
  }

  /**
   * Direct TMDb fallback fetcher when companion backend server is cold-starting or offline.
   * Ensures reliable uptime for movies & discovery.
   */
  public async fetchDirectTMDb<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const userApiKey = await settingsRepository.get('tmdbApiKey', '');
      const apiKey =
        userApiKey && typeof userApiKey === 'string' && userApiKey.trim()
          ? userApiKey.trim()
          : '4e44d9029b1270a757cddc766a1bcb63';

      const cleanEndpoint = endpoint.replace(/^\/?(3\/)?/, '/');
      const url = new URL(`https://api.themoviedb.org/3${cleanEndpoint}`);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('language', 'en-US');

      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, v);
        }
      });

      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestApi<T>(
    endpoint: string,
    options?:
      | {
          method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
          body?: any;
          params?: Record<string, string>;
        }
      | Record<string, string>,
  ): Promise<T | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const baseUrl = await this.getBaseUrl();
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const normalizedPath = cleanEndpoint.startsWith('/api/movies')
        ? cleanEndpoint
        : `/api/movies${cleanEndpoint}`;
      const url = new URL(`${baseUrl}${normalizedPath}`);

      let method = 'GET';
      let bodyData: any = undefined;
      let queryParams: Record<string, string> | undefined = undefined;

      if (options && ('method' in options || 'body' in options || (typeof (options as any).params === 'object'))) {
        const opt = options as {
          method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
          body?: any;
          params?: Record<string, string>;
        };
        method = opt.method || 'GET';
        bodyData = opt.body;
        queryParams = opt.params;
      } else if (options) {
        queryParams = options as Record<string, string>;
      }

      if (queryParams) {
        Object.entries(queryParams).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            url.searchParams.set(k, v);
          }
        });
      }

      const userId = await settingsRepository.get('deviceId', 'omnihub-user');
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'x-user-id': userId,
      };
      if (bodyData !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      const res = await fetch(url.toString(), {
        method,
        signal: controller.signal,
        headers,
        body:
          bodyData !== undefined
            ? typeof bodyData === 'string'
              ? bodyData
              : JSON.stringify(bodyData)
            : undefined,
      });

      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getTrending(page = 1, isTv = false): Promise<Movie[]> {
    const validPage = Math.max(1, Math.floor(Number(page) || 1));
    const cacheKey = `trending_${Boolean(isTv)}_${validPage}`;
    const cached = this.getFromCache<Movie[]>(cacheKey);
    if (cached) return cached;

    const remote = await this.requestApi<any>('/trending', {
      page: String(validPage),
      isTv: isTv ? 'true' : 'false',
    });
    const movies = this.extractMovies(remote, isTv);
    if (movies.length > 0) {
      this.setInCache(cacheKey, movies);
      return movies;
    }

    // Fallback to direct TMDb API
    const directEndpoint = isTv ? '/trending/tv/week' : '/trending/movie/week';
    const direct = await this.fetchDirectTMDb<any>(directEndpoint, { page: String(validPage) });
    const directMovies = this.extractMovies(direct, isTv);
    if (directMovies.length > 0) {
      this.setInCache(cacheKey, directMovies);
      return directMovies;
    }

    return [];
  }

  async getNowPlaying(page = 1, isTv = false): Promise<Movie[]> {
    const validPage = Math.max(1, Math.floor(Number(page) || 1));
    const cacheKey = `now_playing_${Boolean(isTv)}_${validPage}`;
    const cached = this.getFromCache<Movie[]>(cacheKey);
    if (cached) return cached;

    const remote = await this.requestApi<any>('/now-playing', {
      page: String(validPage),
      isTv: isTv ? 'true' : 'false',
    });
    const movies = this.extractMovies(remote, isTv);
    if (movies.length > 0) {
      this.setInCache(cacheKey, movies);
      return movies;
    }

    const directEndpoint = isTv ? '/tv/on_the_air' : '/movie/now_playing';
    const direct = await this.fetchDirectTMDb<any>(directEndpoint, { page: String(validPage) });
    const directMovies = this.extractMovies(direct, isTv);
    if (directMovies.length > 0) {
      this.setInCache(cacheKey, directMovies);
      return directMovies;
    }

    return [];
  }

  async getTopRated(page = 1, isTv = false): Promise<Movie[]> {
    const validPage = Math.max(1, Math.floor(Number(page) || 1));
    const cacheKey = `top_rated_${Boolean(isTv)}_${validPage}`;
    const cached = this.getFromCache<Movie[]>(cacheKey);
    if (cached) return cached;

    const remote = await this.requestApi<any>('/top-rated', {
      page: String(validPage),
      isTv: isTv ? 'true' : 'false',
    });
    const movies = this.extractMovies(remote, isTv);
    if (movies.length > 0) {
      this.setInCache(cacheKey, movies);
      return movies;
    }

    const directEndpoint = isTv ? '/tv/top_rated' : '/movie/top_rated';
    const direct = await this.fetchDirectTMDb<any>(directEndpoint, { page: String(validPage) });
    const directMovies = this.extractMovies(direct, isTv);
    if (directMovies.length > 0) {
      this.setInCache(cacheKey, directMovies);
      return directMovies;
    }

    return [];
  }

  async getUpcoming(page = 1, isTv = false): Promise<Movie[]> {
    const validPage = Math.max(1, Math.floor(Number(page) || 1));
    const cacheKey = `upcoming_${Boolean(isTv)}_${validPage}`;
    const cached = this.getFromCache<Movie[]>(cacheKey);
    if (cached) return cached;

    const remote = await this.requestApi<any>('/upcoming', {
      page: String(validPage),
      isTv: isTv ? 'true' : 'false',
    });
    const movies = this.extractMovies(remote, isTv);
    if (movies.length > 0) {
      this.setInCache(cacheKey, movies);
      return movies;
    }

    const directEndpoint = isTv ? '/tv/airing_today' : '/movie/upcoming';
    const direct = await this.fetchDirectTMDb<any>(directEndpoint, { page: String(validPage) });
    const directMovies = this.extractMovies(direct, isTv);
    if (directMovies.length > 0) {
      this.setInCache(cacheKey, directMovies);
      return directMovies;
    }

    return [];
  }

  async getByLanguage(
    languageCode: string,
    isTv = false,
    page = 1,
    genreId?: number,
  ): Promise<Movie[]> {
    if (!languageCode || languageCode === 'all') {
      return this.getTrending(page, isTv);
    }

    const validPage = Math.max(1, Math.floor(Number(page) || 1));
    const langKey = languageCode.trim().toLowerCase();
    const cacheKey = `lang_${langKey}_${Boolean(isTv)}_${validPage}_${genreId || 0}`;
    const cached = this.getFromCache<Movie[]>(cacheKey);
    if (cached) return cached;

    // 1. Try companion backend proxy first
    const remote = await this.requestApi<any>('/discover', {
      language: langKey,
      isTv: isTv ? 'true' : 'false',
      genre: genreId ? String(genreId) : '',
      page: String(validPage),
    });
    const remoteMovies = this.extractMovies(remote, isTv);
    if (remoteMovies.length > 0) {
      this.setInCache(cacheKey, remoteMovies);
      return remoteMovies;
    }

    // 2. Direct TMDb fallback
    const endpoint = isTv ? '/discover/tv' : '/discover/movie';
    const params: Record<string, string> = {
      with_original_language: langKey,
      sort_by: 'popularity.desc',
      page: String(validPage),
    };
    if (genreId) {
      params.with_genres = String(genreId);
    }
    const direct = await this.fetchDirectTMDb<any>(endpoint, params);
    const directMovies = this.extractMovies(direct, isTv);
    if (directMovies.length > 0) {
      this.setInCache(cacheKey, directMovies);
      return directMovies;
    }

    return [];
  }

  async searchMovies(
    query: string,
    genreId?: number,
    language?: string,
    page = 1,
  ): Promise<Movie[]> {
    const qClean = (query || '').trim();
    const validPage = Math.max(1, Math.floor(Number(page) || 1));
    const langKey = language && language !== 'all' ? language.trim().toLowerCase() : '';
    const cacheKey = `search_${qClean.toLowerCase()}_${genreId || 0}_${langKey}_${validPage}`;
    const cached = this.getFromCache<Movie[]>(cacheKey);
    if (cached) return cached;

    if (qClean.length > 0 || genreId || langKey) {
      const remote = await this.requestApi<any>('/search', {
        q: qClean,
        genre: genreId ? String(genreId) : '',
        language: langKey,
        page: String(validPage),
      });
      const remoteMatches = this.extractMovies(remote);

      if (remoteMatches.length > 0) {
        let filtered = remoteMatches;
        if (genreId) {
          filtered = filtered.filter((m) => m.genre_ids && m.genre_ids.includes(genreId));
        }
        if (langKey) {
          filtered = filtered.filter((m) => m.original_language?.toLowerCase() === langKey);
        }
        this.setInCache(cacheKey, filtered);
        return filtered;
      }

      // Direct TMDb fallback
      if (qClean.length > 0) {
        const direct = await this.fetchDirectTMDb<any>('/search/multi', {
          query: qClean,
          page: String(validPage),
        });
        let matches = this.extractMovies(direct);
        if (genreId) {
          matches = matches.filter((m) => m.genre_ids && m.genre_ids.includes(genreId));
        }
        if (langKey) {
          matches = matches.filter((m) => m.original_language?.toLowerCase() === langKey);
        }
        this.setInCache(cacheKey, matches);
        return matches;
      } else if (langKey) {
        return this.getByLanguage(langKey, false, validPage, genreId);
      } else if (genreId) {
        const direct = await this.fetchDirectTMDb<any>('/discover/movie', {
          with_genres: String(genreId),
          sort_by: 'popularity.desc',
          page: String(validPage),
        });
        const matches = this.extractMovies(direct);
        this.setInCache(cacheKey, matches);
        return matches;
      }
    } else {
      return this.getTrending(validPage);
    }

    return [];
  }

  async getMovieDetails(id: number, isTv?: boolean): Promise<Movie> {
    if (!id || !Number.isFinite(id) || id <= 0) {
      throw new Error(`Invalid media ID: ${id}`);
    }

    const cacheKey = `details_${id}_${isTv !== undefined ? Boolean(isTv) : 'auto'}`;
    const cached = this.getFromCache<Movie>(cacheKey);
    if (cached) return cached;

    const remote = await this.requestApi<any>(
      `/${id}`,
      isTv !== undefined ? { isTv: String(isTv) } : undefined,
    );
    if (remote) {
      const extracted = this.extractMovies(remote, isTv);
      if (extracted.length > 0) {
        this.setInCache(cacheKey, extracted[0]);
        return extracted[0];
      }
      if (remote.id || remote.tmdbId) {
        const norm = this.normalizeMovie(remote, isTv);
        this.setInCache(cacheKey, norm);
        return norm;
      }
    }

    // Direct TMDb fallback: prioritize based on isTv flag
    if (isTv === true) {
      const directTv = await this.fetchDirectTMDb<any>(`/tv/${id}`, {
        append_to_response: 'credits,videos,external_ids',
      });
      if (directTv && directTv.id) {
        const norm = this.normalizeMovie({ ...directTv, is_tv: true });
        this.setInCache(cacheKey, norm);
        return norm;
      }
      const directMovie = await this.fetchDirectTMDb<any>(`/movie/${id}`, {
        append_to_response: 'credits,videos,external_ids',
      });
      if (directMovie && directMovie.id) {
        const norm = this.normalizeMovie({ ...directMovie, is_tv: false });
        this.setInCache(cacheKey, norm);
        return norm;
      }
    } else {
      const directMovie = await this.fetchDirectTMDb<any>(`/movie/${id}`, {
        append_to_response: 'credits,videos,external_ids',
      });
      if (directMovie && directMovie.id) {
        const norm = this.normalizeMovie({ ...directMovie, is_tv: false });
        this.setInCache(cacheKey, norm);
        return norm;
      }
      const directTv = await this.fetchDirectTMDb<any>(`/tv/${id}`, {
        append_to_response: 'credits,videos,external_ids',
      });
      if (directTv && directTv.id) {
        const norm = this.normalizeMovie({ ...directTv, is_tv: true });
        this.setInCache(cacheKey, norm);
        return norm;
      }
    }

    throw new Error(`Media with ID ${id} could not be loaded.`);
  }

  async getWatchlist(): Promise<MovieBookmark[]> {
    // 1. Fetch from local SQLite / InMemory database first (instantaneous & offline)
    const localList = await movieRepository.findAll();

    // 2. If local database is empty, await cloud sync so bookmarks load immediately on first run
    if (localList.length === 0) {
      try {
        const remoteBookmarks = await this.requestApi<any[]>('/watchlist');
        if (Array.isArray(remoteBookmarks) && remoteBookmarks.length > 0) {
          for (const item of remoteBookmarks) {
            const tmdbId = Number(item?.tmdbId);
            if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
            await movieRepository.save({
              id: item.id || `sync-${tmdbId}-${Boolean(item.isTv)}`,
              tmdbId,
              title: String(item.title || ''),
              overview: item.overview ? String(item.overview) : '',
              posterPath: item.posterPath,
              backdropPath: item.backdropPath,
              voteAverage: Number(item.voteAverage || 0),
              releaseDate: item.releaseDate,
              genres: Array.isArray(item.genres) ? item.genres : [],
              runtime: Number(item.runtime || 0),
              isWatched: Boolean(item.isWatched),
              savedAt: item.savedAt || new Date().toISOString(),
              isTv: Boolean(item.isTv),
            });
          }
          this.lastWatchlistSync = Date.now();
          return await movieRepository.findAll();
        }
      } catch {}
      return [];
    }

    // 3. Proactively sync from backend in the background if throttled window passed (60 seconds)
    const now = Date.now();
    if (now - this.lastWatchlistSync > 60000) {
      this.lastWatchlistSync = now;
      this.requestApi<any[]>('/watchlist')
        .then(async (remoteBookmarks) => {
          if (Array.isArray(remoteBookmarks) && remoteBookmarks.length > 0) {
            for (const item of remoteBookmarks) {
              const tmdbId = Number(item?.tmdbId);
              if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
              await movieRepository.save({
                id: item.id || `sync-${tmdbId}-${Boolean(item.isTv)}`,
                tmdbId,
                title: String(item.title || ''),
                overview: item.overview ? String(item.overview) : '',
                posterPath: item.posterPath,
                backdropPath: item.backdropPath,
                voteAverage: Number(item.voteAverage || 0),
                releaseDate: item.releaseDate,
                genres: Array.isArray(item.genres) ? item.genres : [],
                runtime: Number(item.runtime || 0),
                isWatched: Boolean(item.isWatched),
                savedAt: item.savedAt || new Date().toISOString(),
                isTv: Boolean(item.isTv),
              });
            }
          }
        })
        .catch(() => {});
    }

    return localList;
  }

  async addToWatchlist(movie: Movie): Promise<void> {
    if (!movie || (!movie.id && !movie.tmdb_id)) return;
    const bookmark = movieToBookmark(movie);

    // Save locally
    await movieRepository.save(bookmark);

    // Sync to backend with true TMDb ID
    const tmdbId = movie.tmdb_id || movie.id;
    if (tmdbId > 0) {
      this.requestApi('/watchlist', {
        method: 'POST',
        body: {
          tmdbId,
          title: movie.title || '',
          overview: movie.overview || '',
          posterPath: movie.poster_path || null,
          backdropPath: movie.backdrop_path || null,
          voteAverage: Number(movie.vote_average || 0),
          releaseDate: movie.release_date || '',
          genres: movie.genres ? movie.genres.map((g) => g.name) : [],
          runtime: Number(movie.runtime || 0),
          isWatched: false,
          isTv: Boolean(movie.is_tv),
        },
      }).catch(() => {});
    }
  }

  async removeFromWatchlist(tmdbId: number, isTv?: boolean): Promise<void> {
    if (!tmdbId || !Number.isFinite(tmdbId) || tmdbId <= 0) return;
    await movieRepository.delete(tmdbId, isTv);
    const qs = isTv !== undefined ? `?isTv=${Boolean(isTv)}` : '';
    this.requestApi(`/watchlist/${tmdbId}${qs}`, { method: 'DELETE' }).catch(() => {});
  }

  async toggleWatched(tmdbId: number, isTv?: boolean): Promise<boolean> {
    if (!tmdbId || !Number.isFinite(tmdbId) || tmdbId <= 0) return false;
    const nextWatched = await movieRepository.toggleWatched(tmdbId, isTv);
    this.requestApi(`/watchlist/${tmdbId}/watched`, {
      method: 'PATCH',
      body: { isWatched: nextWatched, isTv },
    }).catch(() => {});
    return nextWatched;
  }

  async isBookmarked(tmdbId: number, isTv?: boolean): Promise<boolean> {
    if (!tmdbId || !Number.isFinite(tmdbId) || tmdbId <= 0) return false;
    return movieRepository.isBookmarked(tmdbId, isTv);
  }

  async getStreamCatalog(): Promise<StreamableMedia[]> {
    const cacheKey = 'stream_catalog';
    const cached = this.getFromCache<StreamableMedia[]>(cacheKey);
    if (cached) return cached;

    const remote = await this.requestApi<StreamableMedia[]>('/stream/catalog');
    if (remote && Array.isArray(remote) && remote.length > 0) {
      this.setInCache(cacheKey, remote);
      return remote;
    }
    return [];
  }

  async getStreamVideoUrl(streamId: string): Promise<string> {
    if (!streamId || typeof streamId !== 'string' || !streamId.trim()) {
      return '';
    }
    const baseUrl = await this.getBaseUrl();
    return `${baseUrl}/api/movies/stream/video/${encodeURIComponent(streamId.trim())}`;
  }

  /**
   * Resolves TMDb ID for any TV show or movie by IMDb ID or query string.
   * Calls companion backend first (with public DNS agent bypassing ISP blocks),
   * then falls back to direct TMDb /find if available.
   */
  async resolveTmdbId(params: {
    imdbId?: string;
    query?: string;
    isTv?: boolean;
  }): Promise<number | null> {
    const { imdbId, query, isTv } = params;
    const cleanImdb = imdbId ? imdbId.trim() : '';
    const cleanQuery = query ? query.trim() : '';
    const cacheKey = `resolve_tmdb_${cleanImdb}_${cleanQuery.toLowerCase()}_${isTv !== undefined ? Boolean(isTv) : 'auto'}`;
    const cached = this.getFromCache<number>(cacheKey);
    if (cached) return cached;

    const queryParams: Record<string, string> = {};
    if (cleanImdb) queryParams.imdbId = cleanImdb;
    if (cleanQuery) queryParams.q = cleanQuery;
    if (isTv !== undefined) queryParams.isTv = String(isTv);

    const qs = new URLSearchParams(queryParams).toString();
    try {
      const backendRes = await this.requestApi<{ tmdbId: number | null }>(
        `/find-tmdb?${qs}`,
      );
      if (backendRes && typeof backendRes.tmdbId === 'number' && backendRes.tmdbId > 0) {
        this.setInCache(cacheKey, backendRes.tmdbId);
        return backendRes.tmdbId;
      }
    } catch {}

    // Fallback directly to TMDb /find if backend is offline
    if (cleanImdb) {
      try {
        const encodedImdb = encodeURIComponent(cleanImdb);
        const direct = await this.fetchDirectTMDb<any>(`/find/${encodedImdb}`, {
          external_source: 'imdb_id',
        });
        if (isTv) {
          if (direct?.tv_results?.length > 0 && direct.tv_results[0]?.id) {
            const foundId = Number(direct.tv_results[0].id);
            this.setInCache(cacheKey, foundId);
            return foundId;
          }
          if (direct?.movie_results?.length > 0 && direct.movie_results[0]?.id) {
            const foundId = Number(direct.movie_results[0].id);
            this.setInCache(cacheKey, foundId);
            return foundId;
          }
        } else {
          if (direct?.movie_results?.length > 0 && direct.movie_results[0]?.id) {
            const foundId = Number(direct.movie_results[0].id);
            this.setInCache(cacheKey, foundId);
            return foundId;
          }
          if (direct?.tv_results?.length > 0 && direct.tv_results[0]?.id) {
            const foundId = Number(direct.tv_results[0].id);
            this.setInCache(cacheKey, foundId);
            return foundId;
          }
        }
      } catch {}
    }

    if (cleanQuery) {
      try {
        const directSearch = await this.fetchDirectTMDb<any>(
          isTv ? '/search/tv' : '/search/movie',
          { query: cleanQuery },
        );
        if (directSearch?.results?.length > 0 && directSearch.results[0]?.id) {
          const foundId = Number(directSearch.results[0].id);
          this.setInCache(cacheKey, foundId);
          return foundId;
        }
      } catch {}
    }

    return null;
  }

  /**
   * Resolves direct, ad-free HLS (.m3u8) video stream manifests for any TMDb Movie or TV Show.
   * Connects directly to multi-source video servers to bypass third-party iframe embed websites entirely.
   */
  async resolveDirectStream(
    tmdbId: number,
    isTv = false,
    season = 1,
    episode = 1,
  ): Promise<{ url: string; quality: string; label: string; headers?: Record<string, string> } | null> {
    if (!tmdbId || !Number.isFinite(tmdbId) || tmdbId <= 0) return null;

    const validSeason = Math.max(1, Math.floor(Number(season) || 1));
    const validEpisode = Math.max(1, Math.floor(Number(episode) || 1));
    const providers = ['cinextream', 'vidora', 'vidzee', 'videasy'];
    const BANNED_DOMAINS = ['vidjoy.org', 'banned-cdn.com', 'offline-stream.xyz'];
    const qs = isTv
      ? `id=${tmdbId}&type=tv&season=${validSeason}&episode=${validEpisode}`
      : `id=${tmdbId}&type=movie`;

    // Fast reachability check to reject streams that return 403 / 404 / Cloudflare blocks
    const isStreamReachable = async (url: string, reqHeaders?: Record<string, string>): Promise<boolean> => {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 2600);
      try {
        const headers: Record<string, string> = { Range: 'bytes=0-100', ...(reqHeaders || {}) };
        const res = await fetch(url, {
          method: 'GET',
          headers,
          signal: c.signal,
        });
        return res.status >= 200 && res.status < 400;
      } catch {
        return false;
      } finally {
        clearTimeout(t);
      }
    };

    for (const p of providers) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2200);

      try {
        const res = await fetch(
          `https://vidrack.created.app/api/sources/${p}?${qs}`,
          { signal: controller.signal },
        );

        if (res.ok) {
          const data = (await res.json()) as any;
          if (data && data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
            // 1. Filter out banned or seized domains
            const cleanSources = data.sources.filter((s: any) => {
              if (!s || !s.url || typeof s.url !== 'string') return false;
              return !BANNED_DOMAINS.some((banned) => s.url.includes(banned));
            });

            // 2. Validate reachability on clean sources to ensure HTTP 200
            for (const candidate of cleanSources) {
              let streamUrl = candidate.url.trim();
              if (streamUrl.startsWith('//')) {
                streamUrl = `https:${streamUrl}`;
              }
              const alive = await isStreamReachable(streamUrl, candidate.headers);
              if (alive) {
                return {
                  url: streamUrl,
                  quality: candidate.quality || 'Auto',
                  label: candidate.label || `${p.toUpperCase()} Stream`,
                  headers: candidate.headers,
                };
              }
            }
          }
        }
      } catch {
        // try next provider
      } finally {
        clearTimeout(timeout);
      }
    }
    return null;
  }
}

export const movieService = MovieService.getInstance();
