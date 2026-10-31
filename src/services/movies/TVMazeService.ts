import {
  Movie,
  TVMazeEpisode,
  TVMazeScheduleItem,
  TVMazeSeason,
  TVMazeShow,
  CastMember,
  tvMazeShowToMovie,
} from '../../types';
import { movieService } from './MovieService';

const TVMAZE_API_URL = 'https://api.tvmaze.com';

// Well-known TVmaze show ID to TMDb TV series ID mapping for instant resolution
export const TVMAZE_TO_TMDB_MAP: Record<number, number> = {
  169: 1396, // Breaking Bad (TVmaze ID 169 -> TMDb 1396)
  1371: 63247, // Westworld (TVmaze ID 1371 -> TMDb 63247)
  2993: 66732, // Stranger Things
  82: 1399, // Game of Thrones
  43031: 100088, // The Last of Us
  431: 60059, // Better Call Saul
  15299: 76479, // The Boys
  216: 60625, // Rick and Morty
  44778: 94997, // House of the Dragon
  50462: 106379, // Fallout
  43527: 93405, // Severance
  67362: 126308, // Shōgun
  33352: 76331, // Succession
  38963: 82856, // The Mandalorian
  73: 1418, // The Big Bang Theory
  1871: 46952, // The Blacklist
  66: 1400, // Seinfeld
  305: 1668, // Friends
  179: 1100, // How I Met Your Mother
  31: 1424, // Marvel's Agents of S.H.I.E.L.D.
  526: 1416, // Grey's Anatomy
  118: 1412, // Arrow
};

export class TVMazeService {
  private static instance: TVMazeService;
  private dynamicTmdbCache: Map<number, number> = new Map();

  public static getInstance(): TVMazeService {
    if (!TVMazeService.instance) {
      TVMazeService.instance = new TVMazeService();
    }
    return TVMazeService.instance;
  }

  /**
   * Resolves TMDb TV Show ID for any TVmaze show dynamically via IMDB external ID or title search.
   */
  public async ensureTmdbId(showId: number, showName?: string, imdbId?: string): Promise<number | undefined> {
    if (this.dynamicTmdbCache.has(showId)) {
      return this.dynamicTmdbCache.get(showId);
    }
    if (TVMAZE_TO_TMDB_MAP[showId]) {
      const id = TVMAZE_TO_TMDB_MAP[showId];
      this.dynamicTmdbCache.set(showId, id);
      return id;
    }

    // Resolve dynamically via backend proxy (with public DNS agent bypassing ISP blocks)
    const resolved = await movieService.resolveTmdbId({
      imdbId,
      query: showName,
      isTv: true,
    });
    if (resolved) {
      this.dynamicTmdbCache.set(showId, resolved);
      return resolved;
    }

    return undefined;
  }

  /**
   * Safe fetch with abort timeout against public TVmaze API endpoints.
   * Free & no API key required.
   */
  private async requestTVMaze<T>(
    endpoint: string,
    params?: Record<string, string>,
  ): Promise<T | null> {
    try {
      const url = new URL(`${TVMAZE_API_URL}${endpoint}`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            url.searchParams.set(k, v);
          }
        });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      clearTimeout(timeout);

      if (!res.ok) {
        return null;
      }

      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  /**
   * Converts a TVmaze Show object to unified CineVerse Movie structure
   */
  public showToMovie(show: TVMazeShow): Movie {
    const poster = show.image?.original || show.image?.medium || '';
    const backdrop = show.image?.original || show.image?.medium || '';

    // Strip HTML tags from TVmaze summary
    const cleanOverview = show.summary
      ? show.summary.replace(/<[^>]+>/g, '').trim()
      : 'No series synopsis available.';

    const networkName = show.network?.name || show.webChannel?.name || 'Broadcast TV';
    const releaseYear = show.premiered ? show.premiered.slice(0, 4) : '2024';

    // Generate numeric genre IDs matching CineVerse genre map where applicable
    const genreIds: number[] = [];
    const lowerGenres = (show.genres || []).map((g) => g.toLowerCase());
    if (lowerGenres.some((g) => g.includes('action'))) genreIds.push(28);
    if (lowerGenres.some((g) => g.includes('adventure'))) genreIds.push(12);
    if (lowerGenres.some((g) => g.includes('animation'))) genreIds.push(16);
    if (lowerGenres.some((g) => g.includes('comedy'))) genreIds.push(35);
    if (lowerGenres.some((g) => g.includes('crime'))) genreIds.push(80);
    if (lowerGenres.some((g) => g.includes('drama'))) genreIds.push(18);
    if (lowerGenres.some((g) => g.includes('fantasy'))) genreIds.push(14);
    if (lowerGenres.some((g) => g.includes('sci-fi') || g.includes('science-fiction')))
      genreIds.push(878);
    if (lowerGenres.some((g) => g.includes('thriller'))) genreIds.push(53);

    const mappedTmdbId =
      this.dynamicTmdbCache.get(show.id) || TVMAZE_TO_TMDB_MAP[show.id];

    // Auto-resolve TMDb ID in background if not known
    if (!mappedTmdbId && (show.name || show.externals?.imdb)) {
      this.ensureTmdbId(show.id, show.name, show.externals?.imdb).catch(() => {});
    }

    return {
      id: show.id,
      title: show.name,
      original_title: show.name,
      overview: cleanOverview,
      poster_path: poster,
      backdrop_path: backdrop,
      vote_average: show.rating?.average ? Number(show.rating.average.toFixed(1)) : 8.5,
      vote_count: show.weight ? show.weight * 50 : 1800,
      release_date: show.premiered || `${releaseYear}-01-01`,
      genre_ids: genreIds.length > 0 ? genreIds : [18],
      genres: (show.genres || ['Drama']).map((name, idx) => ({ id: idx + 1, name })),
      runtime: show.averageRuntime || show.runtime || 50,
      tagline: `${networkName} Original Series`,
      category: 'trending',
      original_language: show.language ? show.language.toLowerCase() : undefined,
      // TVmaze specific fields
      is_tv: true,
      tvmaze_id: show.id,
      tmdb_id: mappedTmdbId,
      imdb_id: show.externals?.imdb,
      thetvdb_id: show.externals?.thetvdb,
      network: networkName,
      status: show.status || 'Running',
      schedule_time: show.schedule?.time,
      schedule_days: show.schedule?.days,
      total_seasons: show._embedded?.seasons?.length,
      total_episodes: show._embedded?.episodes?.length,
    };
  }

  /**
   * TVmaze: GET /shows?page={page}
   * Fetches television series directory with optional language filtering.
   */
  async getPopularShows(page = 0, language?: string): Promise<Movie[]> {
    const live = await this.requestTVMaze<TVMazeShow[]>('/shows', {
      page: String(page),
    });

    if (Array.isArray(live) && live.length > 0) {
      let filtered = live;
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
        const matches = live.filter(
          (s) => s.language && s.language.toLowerCase().includes(targetLang),
        );
        if (matches.length > 0) {
          filtered = matches;
        }
      }

      // Sort by rating average & weight
      const sorted = [...filtered].sort((a, b) => {
        const rA = a.rating?.average || 0;
        const rB = b.rating?.average || 0;
        return rB - rA;
      });
      return sorted.map((show) => this.showToMovie(show));
    }

    return [];
  }

  /**
   * TVmaze: GET /schedule
   * Real-time TV broadcast & streaming schedule for today.
   */
  async getScheduleToday(country = 'US', dateStr?: string): Promise<TVMazeScheduleItem[]> {
    const today = dateStr || new Date().toISOString().slice(0, 10);
    const live = await this.requestTVMaze<TVMazeScheduleItem[]>('/schedule', {
      country,
      date: today,
    });

    if (Array.isArray(live) && live.length > 0) {
      return live;
    }

    return [];
  }

  /**
   * TVmaze: GET /shows/{id}/episodes
   * Complete season & episode guide with air dates, episode titles, and summaries.
   */
  async getShowEpisodes(showId: number): Promise<TVMazeEpisode[]> {
    const live = await this.requestTVMaze<TVMazeEpisode[]>(`/shows/${showId}/episodes`);
    if (Array.isArray(live) && live.length > 0) {
      return live;
    }
    return [];
  }

  /**
   * TVmaze: GET /shows/{id}/seasons
   * Season breakdown with episode counts and premiere dates.
   */
  async getShowSeasons(showId: number): Promise<TVMazeSeason[]> {
    const live = await this.requestTVMaze<TVMazeSeason[]>(`/shows/${showId}/seasons`);
    if (Array.isArray(live) && live.length > 0) {
      return live;
    }
    return [];
  }

  /**
   * TVmaze: GET /shows/{id}
   * Full details including cast, seasons, and episodes.
   */
  async getShowDetails(showId: number): Promise<TVMazeShow | null> {
    const live = await this.requestTVMaze<TVMazeShow>(`/shows/${showId}`, {
      'embed[]': 'episodes',
    });
    if (live && live.id) {
      return live;
    }
    return null;
  }

  /**
   * TVmaze: GET /search/shows?q={query}
   * Search for television series by name or keyword.
   */
  async searchShows(query: string): Promise<Movie[]> {
    const qClean = (query || '').trim();
    if (!qClean) return this.getPopularShows(0);

    const live = await this.requestTVMaze<{ score: number; show: TVMazeShow }[]>('/search/shows', {
      q: qClean,
    });

    if (Array.isArray(live) && live.length > 0) {
      return live.map((item) => this.showToMovie(item.show));
    }

    return [];
  }

  /**
   * TVmaze: GET /shows/{id}/cast
   * Full cast members for the television series.
   */
  async getShowCast(showId: number): Promise<CastMember[]> {
    const live = await this.requestTVMaze<any[]>(`/shows/${showId}/cast`);
    if (Array.isArray(live) && live.length > 0) {
      return live.slice(0, 12).map((item) => ({
        id: item.person?.id || Math.random(),
        name: item.person?.name || 'Actor',
        character: item.character?.name || 'Cast Member',
        profile_path:
          item.person?.image?.medium ||
          item.person?.image?.original ||
          '',
      }));
    }
    return [];
  }
}

export const tvMazeService = TVMazeService.getInstance();
