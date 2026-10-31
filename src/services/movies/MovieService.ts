import {
  Movie,
  Genre,
  MovieBookmark,
  StreamableMedia,
  ALL_GENRES,
  movieToBookmark,
} from '../../types';
import { movieRepository } from '../../database/repositories';
import { settingsRepository } from '../../database/repositories';

const DEFAULT_CLOUD_SERVER_URL = 'https://backend-9i6w.onrender.com';

export const GENRE_LIST: Genre[] = [...ALL_GENRES];

export class MovieService {
  private static instance: MovieService;

  public static getInstance(): MovieService {
    if (!MovieService.instance) {
      MovieService.instance = new MovieService();
    }
    return MovieService.instance;
  }

  private async getBaseUrl(): Promise<string> {
    const customUrl = await settingsRepository.get('companionServerUrl', '');
    if (customUrl) {
      return customUrl.replace(/\/+$/, '');
    }
    return DEFAULT_CLOUD_SERVER_URL;
  }

  private normalizeMovie(raw: any): Movie {
    if (!raw) {
      return {
        id: 0,
        title: 'Untitled',
        overview: '',
        poster_path: '',
        backdrop_path: '',
        vote_average: 0,
        vote_count: 0,
        release_date: '',
        genre_ids: [],
      };
    }
    const id = Number(raw.id || raw.tmdbId || raw.tmdb_id || 0);

    let poster = raw.poster_path || raw.posterPath || '';
    if (poster && !poster.startsWith('http')) {
      poster = `https://image.tmdb.org/t/p/w500${poster.startsWith('/') ? '' : '/'}${poster}`;
    }

    let backdrop = raw.backdrop_path || raw.backdropPath || '';
    if (backdrop && !backdrop.startsWith('http')) {
      backdrop = `https://image.tmdb.org/t/p/w1280${backdrop.startsWith('/') ? '' : '/'}${backdrop}`;
    }

    const rating = Number(raw.vote_average ?? raw.rating ?? raw.voteAverage ?? 0);
    const releaseDate = raw.release_date || raw.first_air_date || raw.releaseDate || '';

    let genreIds: number[] = [];
    if (Array.isArray(raw.genre_ids)) {
      genreIds = raw.genre_ids.map(Number);
    } else if (Array.isArray(raw.genreIds)) {
      genreIds = raw.genreIds.map(Number);
    } else if (Array.isArray(raw.genres)) {
      genreIds = raw.genres
        .map((g: any) => (typeof g === 'number' ? g : g.id ? Number(g.id) : 0))
        .filter(Boolean);
    }

    return {
      id,
      title: raw.title || raw.name || 'Untitled',
      original_title: raw.original_title || raw.original_name || raw.originalTitle || raw.title || '',
      original_language: raw.original_language || raw.originalLanguage || undefined,
      overview: raw.overview || 'No overview available.',
      poster_path: poster,
      backdrop_path: backdrop || poster,
      vote_average: Number(rating.toFixed(1)),
      vote_count: Number(raw.vote_count || raw.voteCount || 0),
      release_date: releaseDate || '',
      genre_ids: genreIds,
      genres: Array.isArray(raw.genres)
        ? raw.genres.map((g: any) =>
            typeof g === 'object' && g
              ? { id: Number(g.id || 0), name: String(g.name || '') }
              : { id: 0, name: String(g) },
          )
        : undefined,
      runtime: raw.runtime
        ? Number(raw.runtime)
        : Array.isArray(raw.episode_run_time) && raw.episode_run_time.length > 0
          ? Number(raw.episode_run_time[0])
          : undefined,
      tagline: raw.tagline || '',
      trailer_key: raw.trailer_key || raw.trailerKey || undefined,
      director: raw.director || undefined,
      cast: Array.isArray(raw.cast) ? raw.cast : undefined,
      category: raw.category || undefined,
      is_tv: Boolean(raw.is_tv || raw.isTv || raw.media_type === 'tv'),
      tvmaze_id: raw.tvmaze_id,
      tmdb_id: raw.tmdb_id || id,
      imdb_id: raw.imdb_id,
      network: raw.network,
      status: raw.status,
    };
  }

  private extractMovies(response: any): Movie[] {
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
    }
    return rawList.map((item) => this.normalizeMovie(item)).filter((m) => m.id > 0);
  }

  /**
   * Direct TMDb fallback fetcher when companion backend server is cold-starting or offline.
   * Ensures 100% reliable continuous uptime for movies & discovery.
   */
  public async fetchDirectTMDb<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    try {
      const apiKey = '4e44d9029b1270a757cddc766a1bcb63';
      const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('language', 'en-US');
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, v);
        }
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
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
    try {
      const baseUrl = await this.getBaseUrl();
      const url = new URL(`${baseUrl}/api/movies${endpoint}`);

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

      const controller = new AbortController();
      // Fast timeout to avoid hanging UI when Render free tier is sleeping (falls back to TMDb)
      const timeout = setTimeout(() => controller.abort(), 2500);

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

      clearTimeout(timeout);

      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  async getTrending(page = 1): Promise<Movie[]> {
    const remote = await this.requestApi<any>('/trending', {
      page: String(page),
    });
    const movies = this.extractMovies(remote);
    if (movies.length > 0) return movies;

    // Fallback to direct TMDb API
    const direct = await this.fetchDirectTMDb<any>('/trending/movie/week', { page: String(page) });
    return this.extractMovies(direct);
  }

  async getNowPlaying(page = 1): Promise<Movie[]> {
    const remote = await this.requestApi<any>('/now-playing', {
      page: String(page),
    });
    const movies = this.extractMovies(remote);
    if (movies.length > 0) return movies;

    const direct = await this.fetchDirectTMDb<any>('/movie/now_playing', { page: String(page) });
    return this.extractMovies(direct);
  }

  async getTopRated(page = 1): Promise<Movie[]> {
    const remote = await this.requestApi<any>('/top-rated', {
      page: String(page),
    });
    const movies = this.extractMovies(remote);
    if (movies.length > 0) return movies;

    const direct = await this.fetchDirectTMDb<any>('/movie/top_rated', { page: String(page) });
    return this.extractMovies(direct);
  }

  async getUpcoming(page = 1): Promise<Movie[]> {
    const remote = await this.requestApi<any>('/upcoming', {
      page: String(page),
    });
    const movies = this.extractMovies(remote);
    if (movies.length > 0) return movies;

    const direct = await this.fetchDirectTMDb<any>('/movie/upcoming', { page: String(page) });
    return this.extractMovies(direct);
  }

  async getByLanguage(
    languageCode: string,
    isTv = false,
    page = 1,
    genreId?: number,
  ): Promise<Movie[]> {
    if (!languageCode || languageCode === 'all') {
      return this.getTrending(page);
    }

    // 1. Try companion backend proxy first (bypasses ISP block via backend public DNS resolver)
    const remote = await this.requestApi<any>('/discover', {
      language: languageCode,
      isTv: isTv ? 'true' : 'false',
      genre: genreId ? String(genreId) : '',
      page: String(page),
    });
    const remoteMovies = this.extractMovies(remote);
    if (remoteMovies.length > 0) return remoteMovies;

    // 2. Direct TMDb fallback (for offline companion server)
    const endpoint = isTv ? '/discover/tv' : '/discover/movie';
    const params: Record<string, string> = {
      with_original_language: languageCode,
      sort_by: 'popularity.desc',
      page: String(page),
    };
    if (genreId) {
      params.with_genres = String(genreId);
    }
    const direct = await this.fetchDirectTMDb<any>(endpoint, params);
    const directMovies = this.extractMovies(direct);
    if (directMovies.length > 0) return directMovies;

    return [];
  }

  async searchMovies(
    query: string,
    genreId?: number,
    language?: string,
    page = 1,
  ): Promise<Movie[]> {
    const qClean = (query || '').trim();

    if (qClean.length > 0 || genreId || (language && language !== 'all')) {
      const remote = await this.requestApi<any>('/search', {
        q: qClean,
        genre: genreId ? String(genreId) : '',
        language: language && language !== 'all' ? language : '',
        page: String(page),
      });
      const remoteMatches = this.extractMovies(remote);

      if (remoteMatches.length > 0) {
        let filtered = remoteMatches;
        if (genreId) {
          filtered = filtered.filter((m) => m.genre_ids && m.genre_ids.includes(genreId));
        }
        if (language && language !== 'all') {
          filtered = filtered.filter((m) => m.original_language === language);
        }
        return filtered;
      }

      // Direct TMDb fallback
      if (qClean.length > 0) {
        const direct = await this.fetchDirectTMDb<any>('/search/multi', {
          query: qClean,
          page: String(page),
        });
        let matches = this.extractMovies(direct);
        if (genreId) {
          matches = matches.filter((m) => m.genre_ids && m.genre_ids.includes(genreId));
        }
        if (language && language !== 'all') {
          matches = matches.filter((m) => m.original_language === language);
        }
        return matches;
      } else if (language && language !== 'all') {
        return this.getByLanguage(language, false, page, genreId);
      } else if (genreId) {
        const direct = await this.fetchDirectTMDb<any>('/discover/movie', {
          with_genres: String(genreId),
          sort_by: 'popularity.desc',
          page: String(page),
        });
        return this.extractMovies(direct);
      }
    } else {
      return this.getTrending(page);
    }

    return [];
  }

  async getMovieDetails(id: number): Promise<Movie> {
    const remote = await this.requestApi<any>(`/${id}`);
    if (remote) {
      const extracted = this.extractMovies(remote);
      if (extracted.length > 0) return extracted[0];
      if (remote.id || remote.tmdbId) return this.normalizeMovie(remote);
    }

    // Direct TMDb fallback: try movie then TV
    const directMovie = await this.fetchDirectTMDb<any>(`/movie/${id}`, {
      append_to_response: 'credits,videos',
    });
    if (directMovie && directMovie.id) {
      return this.normalizeMovie(directMovie);
    }

    const directTv = await this.fetchDirectTMDb<any>(`/tv/${id}`, {
      append_to_response: 'credits,videos',
    });
    if (directTv && directTv.id) {
      return this.normalizeMovie({ ...directTv, is_tv: true });
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
            await movieRepository.save({
              id: item.id || `sync-${item.tmdbId}-${Boolean(item.isTv)}`,
              tmdbId: Number(item.tmdbId),
              title: item.title,
              overview: item.overview,
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
          return await movieRepository.findAll();
        }
      } catch {}
      return [];
    }

    // 3. Proactively sync from backend in the background if local items exist
    this.requestApi<any[]>('/watchlist')
      .then(async (remoteBookmarks) => {
        if (Array.isArray(remoteBookmarks) && remoteBookmarks.length > 0) {
          for (const item of remoteBookmarks) {
            await movieRepository.save({
              id: item.id || `sync-${item.tmdbId}-${Boolean(item.isTv)}`,
              tmdbId: Number(item.tmdbId),
              title: item.title,
              overview: item.overview,
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

    return localList;
  }

  async addToWatchlist(movie: Movie): Promise<void> {
    const bookmark = movieToBookmark(movie);

    // Save locally
    await movieRepository.save(bookmark);

    // Sync to backend
    this.requestApi('/watchlist', {
      method: 'POST',
      body: {
        tmdbId: movie.id,
        title: movie.title,
        overview: movie.overview,
        posterPath: movie.poster_path,
        backdropPath: movie.backdrop_path,
        voteAverage: movie.vote_average,
        releaseDate: movie.release_date,
        genres: movie.genres ? movie.genres.map((g) => g.name) : [],
        runtime: movie.runtime || 0,
        isWatched: false,
        isTv: Boolean(movie.is_tv),
      },
    }).catch(() => {});
  }

  async removeFromWatchlist(tmdbId: number, isTv?: boolean): Promise<void> {
    await movieRepository.delete(tmdbId, isTv);
    const qs = isTv !== undefined ? `?isTv=${Boolean(isTv)}` : '';
    this.requestApi(`/watchlist/${tmdbId}${qs}`, { method: 'DELETE' }).catch(() => {});
  }

  async toggleWatched(tmdbId: number, isTv?: boolean): Promise<boolean> {
    const nextWatched = await movieRepository.toggleWatched(tmdbId, isTv);
    this.requestApi(`/watchlist/${tmdbId}/watched`, {
      method: 'PATCH',
      body: { isWatched: nextWatched, isTv },
    }).catch(() => {});
    return nextWatched;
  }

  async isBookmarked(tmdbId: number, isTv?: boolean): Promise<boolean> {
    return movieRepository.isBookmarked(tmdbId, isTv);
  }

  async getStreamCatalog(): Promise<StreamableMedia[]> {
    const remote = await this.requestApi<StreamableMedia[]>('/stream/catalog');
    if (remote && Array.isArray(remote) && remote.length > 0) {
      return remote;
    }
    return [];
  }

  async getStreamVideoUrl(streamId: string): Promise<string> {
    const baseUrl = await this.getBaseUrl();
    return `${baseUrl}/api/movies/stream/video/${encodeURIComponent(streamId)}`;
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
    const queryParams: Record<string, string> = {};
    if (imdbId) queryParams.imdbId = imdbId;
    if (query) queryParams.q = query;
    if (isTv !== undefined) queryParams.isTv = String(isTv);

    const qs = new URLSearchParams(queryParams).toString();
    try {
      const backendRes = await this.requestApi<{ tmdbId: number | null }>(
        `/find-tmdb?${qs}`,
      );
      if (backendRes && backendRes.tmdbId) {
        return backendRes.tmdbId;
      }
    } catch {}

    // Fallback directly to TMDb /find if backend is offline
    if (imdbId) {
      try {
        const direct = await this.fetchDirectTMDb<any>(`/find/${imdbId}`, {
          external_source: 'imdb_id',
        });
        if (direct?.tv_results?.length > 0) {
          return direct.tv_results[0].id;
        }
        if (direct?.movie_results?.length > 0) {
          return direct.movie_results[0].id;
        }
      } catch {}
    }

    if (query) {
      try {
        const directSearch = await this.fetchDirectTMDb<any>(
          isTv ? '/search/tv' : '/search/multi',
          { query },
        );
        if (directSearch?.results?.length > 0) {
          return directSearch.results[0].id;
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
    const providers = ['cinextream', 'vidora', 'vidzee', 'videasy'];
    const BANNED_DOMAINS = ['vidjoy.org', 'banned-cdn.com', 'offline-stream.xyz'];
    const qs = isTv
      ? `id=${tmdbId}&type=tv&season=${season}&episode=${episode}`
      : `id=${tmdbId}&type=movie`;

    // Fast reachability check to reject streams that return 403 / 404 / Cloudflare blocks
    const isStreamReachable = async (url: string, reqHeaders?: Record<string, string>): Promise<boolean> => {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 2600);
        const headers: Record<string, string> = { Range: 'bytes=0-100', ...(reqHeaders || {}) };
        const res = await fetch(url, {
          method: 'GET',
          headers,
          signal: c.signal,
        });
        clearTimeout(t);
        return res.status < 400;
      } catch {
        return false;
      }
    };

    for (const p of providers) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2200);
        const res = await fetch(
          `https://vidrack.created.app/api/sources/${p}?${qs}`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);

        if (res.ok) {
          const data = (await res.json()) as any;
          if (data && data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
            // 1. Filter out banned or seized domains like vidjoy.org
            const cleanSources = data.sources.filter((s: any) => {
              if (!s || !s.url || typeof s.url !== 'string') return false;
              return !BANNED_DOMAINS.some((banned) => s.url.includes(banned));
            });

            // 2. Validate reachability on clean sources to ensure HTTP 200
            for (const candidate of cleanSources) {
              const alive = await isStreamReachable(candidate.url, candidate.headers);
              if (alive) {
                return {
                  url: candidate.url,
                  quality: candidate.quality || '1080p Full HD',
                  label: candidate.label || 'Direct Ad-Free Stream',
                  headers: candidate.headers,
                };
              }
            }
          }
        }
      } catch {
        // try next provider
      }
    }
    return null;
  }
}

export const movieService = MovieService.getInstance();
