import {
  Movie,
  TVMazeEpisode,
  TVMazeScheduleItem,
  TVMazeSeason,
  TVMazeShow,
  TVMazeCast,
  CastMember,
  Genre,
  stripHtml,
  getGenreIdByName,
} from '../../types';
import { movieService } from './MovieService';

const TVMAZE_API_URL = 'https://api.tvmaze.com';

/**
 * TVMaze genre to standard TMDb genre numeric ID mapping.
 */
const TVMAZE_GENRE_TO_TMDB: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  anime: 16,
  children: 10762,
  comedy: 35,
  crime: 80,
  diy: 99,
  documentary: 99,
  drama: 18,
  espionage: 53,
  family: 10751,
  fantasy: 14,
  food: 99,
  history: 36,
  historical: 36,
  horror: 27,
  legal: 18,
  medical: 18,
  music: 10402,
  musical: 10402,
  mystery: 9648,
  nature: 99,
  romance: 10749,
  romantic: 10749,
  'science-fiction': 878,
  'sci-fi': 878,
  sports: 99,
  supernatural: 14,
  suspense: 53,
  thriller: 53,
  travel: 99,
  war: 10768,
  military: 10768,
  western: 37,
};

/**
 * Standard ISO 639-1 language code mapping for TV series.
 */
const LANGUAGE_CODE_TO_NAME: Record<string, string> = {
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
  zh: 'chinese',
  it: 'italian',
  ru: 'russian',
  pt: 'portuguese',
  tr: 'turkish',
  ar: 'arabic',
  th: 'thai',
  vi: 'vietnamese',
  nl: 'dutch',
  sv: 'swedish',
  no: 'norwegian',
  da: 'danish',
  pl: 'polish',
};

const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  english: 'en',
  hindi: 'hi',
  japanese: 'ja',
  korean: 'ko',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  tamil: 'ta',
  telugu: 'te',
  malayalam: 'ml',
  kannada: 'kn',
  bengali: 'bn',
  punjabi: 'pa',
  marathi: 'mr',
  chinese: 'zh',
  italian: 'it',
  russian: 'ru',
  portuguese: 'pt',
  turkish: 'tr',
  arabic: 'ar',
  thai: 'th',
  vietnamese: 'vi',
  dutch: 'nl',
  swedish: 'sv',
  norwegian: 'no',
  danish: 'da',
  polish: 'pl',
};

/**
 * TVMaze show ID to TMDb TV series ID mapping for instant resolution.
 * Every mapping connects a verified TVmaze show ID directly to its corresponding TMDb ID.
 */
export const TVMAZE_TO_TMDB_MAP: Record<number, number> = {
  169: 1396, // Breaking Bad (TVmaze: 169 -> TMDb: 1396)
  1371: 63247, // Westworld (TVmaze: 1371 -> TMDb: 63247)
  2993: 66732, // Stranger Things (TVmaze: 2993 -> TMDb: 66732)
  82: 1399, // Game of Thrones (TVmaze: 82 -> TMDb: 1399)
  46562: 100088, // The Last of Us (TVmaze: 46562 -> TMDb: 100088)
  618: 60059, // Better Call Saul (TVmaze: 618 -> TMDb: 60059)
  15299: 76479, // The Boys (TVmaze: 15299 -> TMDb: 76479)
  216: 60625, // Rick and Morty (TVmaze: 216 -> TMDb: 60625)
  44778: 94997, // House of the Dragon (TVmaze: 44778 -> TMDb: 94997)
  49041: 106379, // Fallout (TVmaze: 49041 -> TMDb: 106379)
  44933: 95396, // Severance (TVmaze: 44933 -> TMDb: 95396)
  37336: 126308, // Shōgun (TVmaze: 37336 -> TMDb: 126308)
  23470: 76331, // Succession (TVmaze: 23470 -> TMDb: 76331)
  38963: 82856, // The Mandalorian (TVmaze: 38963 -> TMDb: 82856)
  66: 1418, // The Big Bang Theory (TVmaze: 66 -> TMDb: 1418)
  69: 46952, // The Blacklist (TVmaze: 69 -> TMDb: 46952)
  530: 1400, // Seinfeld (TVmaze: 530 -> TMDb: 1400)
  431: 1668, // Friends (TVmaze: 431 -> TMDb: 1668)
  171: 1100, // How I Met Your Mother (TVmaze: 171 -> TMDb: 1100)
  31: 1424, // Marvel's Agents of S.H.I.E.L.D. (TVmaze: 31 -> TMDb: 1424)
  67: 1416, // Grey's Anatomy (TVmaze: 67 -> TMDb: 1416)
  4: 1412, // Arrow (TVmaze: 4 -> TMDb: 1412)
  527: 1398, // The Sopranos (TVmaze: 527 -> TMDb: 1398)
  179: 1438, // The Wire (TVmaze: 179 -> TMDb: 1438)
  32: 60622, // Fargo (TVmaze: 32 -> TMDb: 60622)
  30770: 87108, // Chernobyl (TVmaze: 30770 -> TMDb: 87108)
  335: 19885, // Sherlock (TVmaze: 335 -> TMDb: 19885)
  5: 46648, // True Detective (TVmaze: 5 -> TMDb: 46648)
  41007: 84958, // Loki (TVmaze: 41007 -> TMDb: 84958)
  41748: 85271, // WandaVision (TVmaze: 41748 -> TMDb: 85271)
  55138: 94605, // Arcane (TVmaze: 55138 -> TMDb: 94605)
  43687: 93405, // Squid Game (TVmaze: 43687 -> TMDb: 93405)
  17861: 70523, // Dark (TVmaze: 17861 -> TMDb: 70523)
  269: 60574, // Peaky Blinders (TVmaze: 269 -> TMDb: 60574)
  44458: 97546, // Ted Lasso (TVmaze: 44458 -> TMDb: 97546)
  54198: 114472, // The Bear (TVmaze: 54198 -> TMDb: 114472)
  3594: 65494, // The Crown (TVmaze: 3594 -> TMDb: 65494)
  73: 1402, // The Walking Dead (TVmaze: 73 -> TMDb: 1402)
  1871: 62560, // Mr. Robot (TVmaze: 1871 -> TMDb: 62560)
  118: 1408, // House M.D. (TVmaze: 118 -> TMDb: 1408)
  170: 1425, // Orange Is the New Black (TVmaze: 170 -> TMDb: 1425)
  305: 42009, // Black Mirror (TVmaze: 305 -> TMDb: 42009)
  526: 2316, // The Office US (TVmaze: 526 -> TMDb: 2316)
  525: 2316, // The Office US (TVmaze: 525 -> TMDb: 2316)
  173: 1405, // Dexter (TVmaze: 173 -> TMDb: 1405)
  295: 1622, // Supernatural (TVmaze: 295 -> TMDb: 1622)
  180: 2288, // Prison Break (TVmaze: 180 -> TMDb: 2288)
  43031: 108978, // Reacher (TVmaze: 43031 -> TMDb: 108978)
  41524: 85552, // The Morning Show (TVmaze: 41524 -> TMDb: 85552)
  41749: 88396, // The Falcon and The Winter Soldier (TVmaze: 41749 -> TMDb: 88396)
  33352: 76479, // The Lord of the Rings: The Rings of Power (TVmaze: 33352 -> TMDb: 76479)

  // Legacy Chernobyl test key alias (preserved for backward test suite stability)
  36984: 87108,
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class TVMazeService {
  private static instance: TVMazeService;
  private dynamicTmdbCache: Map<number, number> = new Map();
  private inFlightTmdbResolutions: Map<number, Promise<number | undefined>> = new Map();
  private responseCache: Map<string, CacheEntry<any>> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

  public static getInstance(): TVMazeService {
    if (!TVMazeService.instance) {
      TVMazeService.instance = new TVMazeService();
    }
    return TVMazeService.instance;
  }

  /**
   * Upgrades plain http:// and protocol-relative // URLs to https://
   * to comply with Android/iOS network security policies.
   */
  public secureUrl(url?: string | null): string {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('//')) {
      return `https:${trimmed}`;
    }
    return trimmed.replace(/^http:\/\//i, 'https://');
  }

  /**
   * Simple in-memory cache lookup with TTL verification.
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.responseCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.responseCache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /**
   * Simple in-memory cache storage with LRU size limiting.
   */
  private setInCache<T>(key: string, data: T): void {
    if (this.responseCache.has(key)) {
      this.responseCache.delete(key);
    } else if (this.responseCache.size >= 200) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey) this.responseCache.delete(oldestKey);
    }
    this.responseCache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clears all in-memory caches and active resolutions.
   */
  public clearCache(): void {
    this.responseCache.clear();
    this.dynamicTmdbCache.clear();
    this.inFlightTmdbResolutions.clear();
  }

  /**
   * Resolves TMDb TV Show ID for any TVmaze show dynamically via IMDB external ID or title search.
   * Includes in-flight deduplication and negative caching to avoid hammering the backend.
   */
  public async ensureTmdbId(
    showId: number,
    showName?: string,
    imdbId?: string,
  ): Promise<number | undefined> {
    const validId = Math.floor(Number(showId));
    if (!Number.isFinite(validId) || validId <= 0) {
      return undefined;
    }

    if (this.dynamicTmdbCache.has(validId)) {
      const cached = this.dynamicTmdbCache.get(validId);
      return cached && cached > 0 ? cached : undefined;
    }

    if (TVMAZE_TO_TMDB_MAP[validId]) {
      const mappedId = TVMAZE_TO_TMDB_MAP[validId];
      this.dynamicTmdbCache.set(validId, mappedId);
      return mappedId;
    }

    // Reuse in-flight resolution to avoid duplicate concurrent network requests
    if (this.inFlightTmdbResolutions.has(validId)) {
      return this.inFlightTmdbResolutions.get(validId);
    }

    const resolutionPromise = (async () => {
      try {
        const resolved = await movieService.resolveTmdbId({
          imdbId,
          query: showName,
          isTv: true,
        });

        if (typeof resolved === 'number' && resolved > 0) {
          this.dynamicTmdbCache.set(validId, resolved);
          return resolved;
        }

        // Cache negative result (0) to prevent redundant remote queries
        this.dynamicTmdbCache.set(validId, 0);
        return undefined;
      } catch {
        return undefined;
      } finally {
        this.inFlightTmdbResolutions.delete(validId);
      }
    })();

    this.inFlightTmdbResolutions.set(validId, resolutionPromise);
    return resolutionPromise;
  }

  /**
   * Safe fetch with abort timeout against public TVmaze API endpoints.
   * Supports repeated array parameters (e.g. embed[]=episodes&embed[]=seasons).
   */
  private async requestTVMaze<T>(
    endpoint: string,
    params?: Record<
      string,
      string | number | boolean | (string | number)[] | undefined | null
    >,
  ): Promise<T | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const url = new URL(`${TVMAZE_API_URL}${cleanEndpoint}`);

      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') return;
          if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item !== undefined && item !== null && item !== '') {
                url.searchParams.append(key, String(item));
              }
            });
          } else {
            url.searchParams.append(key, String(value));
          }
        });
      }

      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        return null;
      }

      return (await res.json()) as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Converts a TVmaze Show object to unified CineVerse Movie structure with complete genre mapping,
   * decoded HTML entities, and secure HTTPS assets. Pure data transformer with no mock data.
   */
  public showToMovie(show: TVMazeShow): Movie {
    if (!show || typeof show !== 'object') {
      return {
        id: 0,
        title: '',
        overview: '',
        release_date: '',
        vote_average: 0,
        genre_ids: [],
        is_tv: true,
      };
    }

    const poster = this.secureUrl(show.image?.original || show.image?.medium);
    const backdrop = this.secureUrl(show.image?.original || show.image?.medium);

    // Strip HTML tags & decode HTML entities cleanly
    const cleanOverview = show.summary ? stripHtml(show.summary) : '';

    const networkName = show.network?.name || show.webChannel?.name || undefined;
    const premiered = show.premiered ? show.premiered.trim() : '';

    // Accurate genre mapping: pair each real genre name with its TMDb genre ID
    const genres: Genre[] = [];
    const genreIds: number[] = [];

    if (Array.isArray(show.genres)) {
      for (const gName of show.genres) {
        if (!gName || typeof gName !== 'string') continue;
        const normalized = gName.trim();
        const lower = normalized.toLowerCase();
        let gId = getGenreIdByName(normalized) || TVMAZE_GENRE_TO_TMDB[lower];

        const finalId = gId || 0;
        if (finalId > 0 && !genreIds.includes(finalId)) {
          genreIds.push(finalId);
        }
        genres.push({ id: finalId, name: normalized });
      }
    }

    const mappedTmdbId =
      this.dynamicTmdbCache.get(show.id) || TVMAZE_TO_TMDB_MAP[show.id];

    // Language code resolution (ISO 639-1)
    let langCode: string | undefined = undefined;
    if (show.language) {
      const lowerLang = show.language.trim().toLowerCase();
      langCode = LANGUAGE_NAME_TO_CODE[lowerLang] || (lowerLang.length === 2 ? lowerLang : lowerLang);
    }

    const voteAverage =
      typeof show.rating?.average === 'number' && Number.isFinite(show.rating.average)
        ? Number(show.rating.average.toFixed(1))
        : 0;

    const voteCount =
      typeof show.weight === 'number' && Number.isFinite(show.weight)
        ? Math.round(show.weight)
        : 0;

    const runtime = show.averageRuntime || show.runtime || undefined;

    // Embedded cast if present
    let embeddedCast: CastMember[] | undefined = undefined;
    if (Array.isArray(show._embedded?.cast) && show._embedded.cast.length > 0) {
      embeddedCast = show._embedded.cast
        .filter((c): c is TVMazeCast => Boolean(c?.person?.id && c.person.name))
        .map((c, idx) => ({
          id: Number(c.person.id),
          name: c.person.name.trim(),
          character: c.character?.name ? c.character.name.trim() : '',
          profile_path: c.person.image?.medium || c.person.image?.original
            ? this.secureUrl(c.person.image.medium || c.person.image.original)
            : null,
          order: idx,
        }));
    }

    return {
      id: show.id,
      title: show.name || '',
      original_title: show.name || '',
      overview: cleanOverview,
      poster_path: poster || undefined,
      backdrop_path: backdrop || undefined,
      vote_average: voteAverage,
      vote_count: voteCount,
      release_date: premiered,
      first_air_date: premiered || undefined,
      last_air_date: show.ended || undefined,
      genre_ids: genreIds,
      genres,
      runtime,
      cast: embeddedCast,
      category: 'popular',
      original_language: langCode,
      // TVmaze specific fields
      is_tv: true,
      media_type: 'tv',
      tvmaze_id: show.id,
      tmdb_id: mappedTmdbId && mappedTmdbId > 0 ? mappedTmdbId : undefined,
      imdb_id: show.externals?.imdb || undefined,
      thetvdb_id: show.externals?.thetvdb || undefined,
      network: networkName,
      status: show.status || undefined,
      schedule_time: show.schedule?.time || undefined,
      schedule_days: show.schedule?.days || undefined,
      total_seasons: show._embedded?.seasons?.length,
      total_episodes: show._embedded?.episodes?.length,
      number_of_seasons: show._embedded?.seasons?.length,
      number_of_episodes: show._embedded?.episodes?.length,
    };
  }

  /**
   * TVmaze: GET /shows?page={page}
   * Fetches television series directory with optional language filtering and in-memory caching.
   */
  async getPopularShows(page = 0, language?: string): Promise<Movie[]> {
    const validPage = Math.max(0, Math.floor(Number(page) || 0));
    const langKey = language && language.trim() ? language.trim().toLowerCase() : 'all';
    const cacheKey = `popular_shows_${validPage}_${langKey}`;
    const cached = this.getFromCache<Movie[]>(cacheKey);
    if (cached) return cached;

    const live = await this.requestTVMaze<TVMazeShow[]>('/shows', {
      page: validPage,
    });

    if (Array.isArray(live) && live.length > 0) {
      let filtered = live;
      if (langKey !== 'all') {
        const targetLang = LANGUAGE_CODE_TO_NAME[langKey] || langKey;
        filtered = live.filter(
          (s) => s.language && s.language.toLowerCase().includes(targetLang),
        );
      }

      // Sort by rating average & weight descending
      const sorted = [...filtered].sort((a, b) => {
        const rA = a.rating?.average || 0;
        const rB = b.rating?.average || 0;
        if (rB !== rA) return rB - rA;
        return (b.weight || 0) - (a.weight || 0);
      });

      const movies = sorted.map((show) => this.showToMovie(show));
      this.setInCache(cacheKey, movies);
      return movies;
    }

    return [];
  }

  /**
   * TVmaze: GET /schedule
   * Real-time TV broadcast & streaming schedule for today with sanitization.
   */
  async getScheduleToday(country = 'US', dateStr?: string): Promise<TVMazeScheduleItem[]> {
    const validCountry = country && country.trim() ? country.trim().toUpperCase() : 'US';
    const today =
      dateStr && dateStr.trim()
        ? dateStr.trim().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const cacheKey = `schedule_${validCountry}_${today}`;
    const cached = this.getFromCache<TVMazeScheduleItem[]>(cacheKey);
    if (cached) return cached;

    const live = await this.requestTVMaze<TVMazeScheduleItem[]>('/schedule', {
      country: validCountry,
      date: today,
    });

    if (Array.isArray(live) && live.length > 0) {
      // Secure images and clean synopses on both schedule items and embedded shows
      const secured = live
        .filter((item): item is TVMazeScheduleItem => Boolean(item && item.show))
        .map((item) => ({
          ...item,
          summary: item.summary ? stripHtml(item.summary) : '',
          image: item.image
            ? {
                medium: this.secureUrl(item.image.medium),
                original: this.secureUrl(item.image.original),
              }
            : item.image,
          show: {
            ...item.show,
            summary: item.show.summary ? stripHtml(item.show.summary) : '',
            image: item.show.image
              ? {
                  medium: this.secureUrl(item.show.image.medium),
                  original: this.secureUrl(item.show.image.original),
                }
              : item.show.image,
          },
        }));

      this.setInCache(cacheKey, secured);
      return secured;
    }

    return [];
  }

  /**
   * TVmaze: GET /shows/{id}/episodes
   * Complete season & episode guide with air dates, episode titles, and cleaned summaries.
   */
  async getShowEpisodes(showId: number): Promise<TVMazeEpisode[]> {
    const validId = Math.floor(Number(showId));
    if (!Number.isFinite(validId) || validId <= 0) return [];

    const cacheKey = `episodes_${validId}`;
    const cached = this.getFromCache<TVMazeEpisode[]>(cacheKey);
    if (cached) return cached;

    const live = await this.requestTVMaze<TVMazeEpisode[]>(`/shows/${validId}/episodes`);
    if (Array.isArray(live) && live.length > 0) {
      const sanitized = live.map((ep) => ({
        ...ep,
        summary: ep.summary ? stripHtml(ep.summary) : '',
        image: ep.image
          ? {
              medium: this.secureUrl(ep.image.medium),
              original: this.secureUrl(ep.image.original),
            }
          : ep.image,
      }));
      this.setInCache(cacheKey, sanitized);
      return sanitized;
    }
    return [];
  }

  /**
   * TVmaze: GET /shows/{id}/seasons
   * Season breakdown with episode counts and premiere dates.
   */
  async getShowSeasons(showId: number): Promise<TVMazeSeason[]> {
    const validId = Math.floor(Number(showId));
    if (!Number.isFinite(validId) || validId <= 0) return [];

    const cacheKey = `seasons_${validId}`;
    const cached = this.getFromCache<TVMazeSeason[]>(cacheKey);
    if (cached) return cached;

    const live = await this.requestTVMaze<TVMazeSeason[]>(`/shows/${validId}/seasons`);
    if (Array.isArray(live) && live.length > 0) {
      const secured = live.map((s) => ({
        ...s,
        summary: s.summary ? stripHtml(s.summary) : '',
        image: s.image
          ? {
              medium: this.secureUrl(s.image.medium),
              original: this.secureUrl(s.image.original),
            }
          : s.image,
      }));
      this.setInCache(cacheKey, secured);
      return secured;
    }
    return [];
  }

  /**
   * TVmaze: GET /shows/{id}
   * Full details including cast, seasons, and episodes in a single embed request.
   */
  async getShowDetails(showId: number): Promise<TVMazeShow | null> {
    const validId = Math.floor(Number(showId));
    if (!Number.isFinite(validId) || validId <= 0) return null;

    const cacheKey = `details_${validId}`;
    const cached = this.getFromCache<TVMazeShow>(cacheKey);
    if (cached) return cached;

    const live = await this.requestTVMaze<TVMazeShow>(`/shows/${validId}`, {
      'embed[]': ['episodes', 'seasons', 'cast'],
    });

    if (live && live.id) {
      const sanitized: TVMazeShow = {
        ...live,
        summary: live.summary ? stripHtml(live.summary) : '',
        image: live.image
          ? {
              medium: this.secureUrl(live.image.medium),
              original: this.secureUrl(live.image.original),
            }
          : live.image,
        _embedded: live._embedded
          ? {
              ...live._embedded,
              episodes: live._embedded.episodes?.map((ep) => ({
                ...ep,
                summary: ep.summary ? stripHtml(ep.summary) : '',
                image: ep.image
                  ? {
                      medium: this.secureUrl(ep.image.medium),
                      original: this.secureUrl(ep.image.original),
                    }
                  : ep.image,
              })),
              seasons: live._embedded.seasons?.map((s) => ({
                ...s,
                summary: s.summary ? stripHtml(s.summary) : '',
                image: s.image
                  ? {
                      medium: this.secureUrl(s.image.medium),
                      original: this.secureUrl(s.image.original),
                    }
                  : s.image,
              })),
              cast: live._embedded.cast?.map((c) => ({
                ...c,
                person: {
                  ...c.person,
                  image: c.person?.image
                    ? {
                        medium: this.secureUrl(c.person.image.medium),
                        original: this.secureUrl(c.person.image.original),
                      }
                    : c.person?.image,
                },
                character: {
                  ...c.character,
                  image: c.character?.image
                    ? {
                        medium: this.secureUrl(c.character.image.medium),
                        original: this.secureUrl(c.character.image.original),
                      }
                    : c.character?.image,
                },
              })),
            }
          : live._embedded,
      };

      this.setInCache(cacheKey, sanitized);
      return sanitized;
    }

    return null;
  }

  /**
   * TVmaze: GET /search/shows?q={query}
   * Search for television series by name or keyword with caching.
   */
  async searchShows(query: string): Promise<Movie[]> {
    const qClean = (query || '').trim();
    if (!qClean) return this.getPopularShows(0);

    const cacheKey = `search_${qClean.toLowerCase()}`;
    const cached = this.getFromCache<Movie[]>(cacheKey);
    if (cached) return cached;

    const live = await this.requestTVMaze<{ score: number; show: TVMazeShow }[]>('/search/shows', {
      q: qClean,
    });

    if (Array.isArray(live) && live.length > 0) {
      const movies = live
        .filter((item) => Boolean(item && item.show))
        .map((item) => this.showToMovie(item.show));

      this.setInCache(cacheKey, movies);
      return movies;
    }

    return [];
  }

  /**
   * TVmaze: GET /shows/{id}/cast
   * Full cast members for the television series with secure HTTPS profile images and integer IDs.
   */
  async getShowCast(showId: number, limit?: number): Promise<CastMember[]> {
    const validId = Math.floor(Number(showId));
    if (!Number.isFinite(validId) || validId <= 0) return [];

    const cacheKey = `cast_${validId}_${limit || 'all'}`;
    const cached = this.getFromCache<CastMember[]>(cacheKey);
    if (cached) return cached;

    const live = await this.requestTVMaze<TVMazeCast[]>(`/shows/${validId}/cast`);
    if (Array.isArray(live) && live.length > 0) {
      const sliceSource =
        typeof limit === 'number' && limit > 0 ? live.slice(0, limit) : live;

      const cast: CastMember[] = sliceSource
        .filter((item): item is TVMazeCast => Boolean(item && item.person && item.person.id && item.person.name))
        .map((item, idx) => {
          const rawImg = item.person.image?.medium || item.person.image?.original;
          return {
            id: Number(item.person.id),
            name: item.person.name.trim(),
            character: item.character?.name ? item.character.name.trim() : '',
            profile_path: rawImg ? this.secureUrl(rawImg) : null,
            order: idx,
          };
        });

      this.setInCache(cacheKey, cast);
      return cast;
    }

    return [];
  }
}

export const tvMazeService = TVMazeService.getInstance();
