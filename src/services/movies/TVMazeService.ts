import {
  Movie,
  TVMazeEpisode,
  TVMazeScheduleItem,
  TVMazeSeason,
  TVMazeShow,
} from '../../types';

const TVMAZE_API_URL = 'https://api.tvmaze.com';

// Well-known TVmaze show ID to TMDb TV series ID mapping for seamless universal streaming
export const TVMAZE_TO_TMDB_MAP: Record<number, number> = {
  1371: 1396, // Breaking Bad
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
  169: 1402, // The Walking Dead
  73: 1418, // The Big Bang Theory
  1871: 46952, // The Blacklist
  66: 1400, // Seinfeld
  305: 1668, // Friends
  179: 1100, // How I Met Your Mother
  31: 1424, // Marvel's Agents of S.H.I.E.L.D.
  526: 1416, // Grey's Anatomy
  118: 1412, // Arrow
};

// Curated high-fidelity television series dataset (ensures instant load & offline resilience)
export const FALLBACK_TVMAZE_SHOWS: TVMazeShow[] = [
  {
    id: 1371,
    name: 'Breaking Bad',
    type: 'Scripted',
    language: 'English',
    genres: ['Drama', 'Crime', 'Thriller'],
    status: 'Ended',
    runtime: 60,
    premiered: '2008-01-20',
    ended: '2013-09-29',
    officialSite: 'http://www.amc.com/shows/breaking-bad',
    schedule: { time: '21:00', days: ['Sunday'] },
    rating: { average: 9.5 },
    weight: 98,
    network: { name: 'AMC' },
    image: {
      medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/0/2400.jpg',
      original: 'https://static.tvmaze.com/uploads/images/original_untouched/0/2400.jpg',
    },
    summary:
      'A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine in order to secure his family’s future.',
    externals: { imdb: 'tt0903747', thetvdb: 81189 },
  },
  {
    id: 2993,
    name: 'Stranger Things',
    type: 'Scripted',
    language: 'English',
    genres: ['Drama', 'Fantasy', 'Science-Fiction'],
    status: 'Running',
    runtime: 60,
    premiered: '2016-07-15',
    schedule: { time: '00:00', days: ['Friday'] },
    rating: { average: 8.8 },
    weight: 99,
    webChannel: { name: 'Netflix' },
    image: {
      medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/394/986186.jpg',
      original: 'https://static.tvmaze.com/uploads/images/original_untouched/394/986186.jpg',
    },
    summary:
      'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.',
    externals: { imdb: 'tt4574334', thetvdb: 305288 },
  },
  {
    id: 82,
    name: 'Game of Thrones',
    type: 'Scripted',
    language: 'English',
    genres: ['Drama', 'Action', 'Fantasy'],
    status: 'Ended',
    runtime: 60,
    premiered: '2011-04-17',
    ended: '2019-05-19',
    officialSite: 'http://www.hbo.com/game-of-thrones',
    schedule: { time: '21:00', days: ['Sunday'] },
    rating: { average: 9.2 },
    weight: 97,
    network: { name: 'HBO' },
    image: {
      medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/190/476117.jpg',
      original: 'https://static.tvmaze.com/uploads/images/original_untouched/190/476117.jpg',
    },
    summary:
      'Nine noble families fight for control over the lands of Westeros, while an ancient enemy returns after being dormant for millennia.',
    externals: { imdb: 'tt0944947', thetvdb: 121361 },
  },
  {
    id: 43031,
    name: 'The Last of Us',
    type: 'Scripted',
    language: 'English',
    genres: ['Drama', 'Action', 'Science-Fiction'],
    status: 'Running',
    runtime: 60,
    premiered: '2023-01-15',
    schedule: { time: '21:00', days: ['Sunday'] },
    rating: { average: 8.9 },
    weight: 98,
    network: { name: 'HBO' },
    image: {
      medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/444/1110024.jpg',
      original: 'https://static.tvmaze.com/uploads/images/original_untouched/444/1110024.jpg',
    },
    summary:
      'Twenty years after modern civilization has been destroyed, Joel is hired to smuggle Ellie out of an oppressive quarantine zone.',
    externals: { imdb: 'tt3581920', thetvdb: 392256 },
  },
  {
    id: 44778,
    name: 'House of the Dragon',
    type: 'Scripted',
    language: 'English',
    genres: ['Drama', 'Action', 'Fantasy'],
    status: 'Running',
    runtime: 65,
    premiered: '2022-08-21',
    schedule: { time: '21:00', days: ['Sunday'] },
    rating: { average: 8.6 },
    weight: 96,
    network: { name: 'HBO' },
    image: {
      medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/417/1043372.jpg',
      original: 'https://static.tvmaze.com/uploads/images/original_untouched/417/1043372.jpg',
    },
    summary:
      'An internal succession war within House Targaryen at the height of its power, 172 years before the birth of Daenerys Targaryen.',
    externals: { imdb: 'tt11198330', thetvdb: 371572 },
  },
  {
    id: 50462,
    name: 'Fallout',
    type: 'Scripted',
    language: 'English',
    genres: ['Action', 'Adventure', 'Science-Fiction'],
    status: 'Running',
    runtime: 55,
    premiered: '2024-04-10',
    schedule: { time: '00:00', days: ['Wednesday'] },
    rating: { average: 8.7 },
    weight: 96,
    webChannel: { name: 'Prime Video' },
    image: {
      medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/504/1262335.jpg',
      original: 'https://static.tvmaze.com/uploads/images/original_untouched/504/1262335.jpg',
    },
    summary:
      'In a future post-apocalyptic Los Angeles, citizens must live in underground bunkers to protect themselves from radiation, mutants and bandits.',
    externals: { imdb: 'tt12637874', thetvdb: 384848 },
  },
  {
    id: 43527,
    name: 'Severance',
    type: 'Scripted',
    language: 'English',
    genres: ['Drama', 'Science-Fiction', 'Thriller'],
    status: 'Running',
    runtime: 55,
    premiered: '2022-02-18',
    schedule: { time: '00:00', days: ['Friday'] },
    rating: { average: 8.7 },
    weight: 95,
    webChannel: { name: 'Apple TV+' },
    image: {
      medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/400/1000673.jpg',
      original: 'https://static.tvmaze.com/uploads/images/original_untouched/400/1000673.jpg',
    },
    summary:
      'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.',
    externals: { imdb: 'tt11280740', thetvdb: 371980 },
  },
  {
    id: 67362,
    name: 'Shōgun',
    type: 'Scripted',
    language: 'English',
    genres: ['Drama', 'History', 'War'],
    status: 'Running',
    runtime: 60,
    premiered: '2024-02-27',
    schedule: { time: '22:00', days: ['Tuesday'] },
    rating: { average: 9.0 },
    weight: 97,
    network: { name: 'FX' },
    image: {
      medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/500/1251912.jpg',
      original: 'https://static.tvmaze.com/uploads/images/original_untouched/500/1251912.jpg',
    },
    summary:
      'When a mysterious European ship is found marooned in a nearby fishing village, Lord Yoshii Toranaga discovers secrets that could tip the scales of power in feudal Japan.',
    externals: { imdb: 'tt2788316', thetvdb: 351187 },
  },
];

export const FALLBACK_EPISODES: TVMazeEpisode[] = [
  {
    id: 1001,
    name: 'Pilot',
    season: 1,
    number: 1,
    airdate: '2008-01-20',
    airtime: '21:00',
    runtime: 58,
    rating: { average: 9.0 },
    image: {
      medium: 'https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?w=500&q=80',
    },
    summary:
      'Diagnosed with terminal lung cancer, a chemistry teacher teams up with a former student to cook crystal meth.',
  },
  {
    id: 1002,
    name: "Cat's in the Bag...",
    season: 1,
    number: 2,
    airdate: '2008-01-27',
    airtime: '21:00',
    runtime: 48,
    rating: { average: 8.7 },
    image: {
      medium: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=500&q=80',
    },
    summary:
      'Walt and Jesse attempt to dispose of two bodies, which becomes complicated when one turns out to still be alive.',
  },
  {
    id: 1003,
    name: '...And the Bag’s in the River',
    season: 1,
    number: 3,
    airdate: '2008-02-10',
    airtime: '21:00',
    runtime: 48,
    rating: { average: 8.8 },
    image: {
      medium: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80',
    },
    summary:
      'Walt wrestles with a moral dilemma regarding their surviving captive Krazy-8 in Jesse’s basement.',
  },
  {
    id: 1004,
    name: 'Cancer Man',
    season: 1,
    number: 4,
    airdate: '2008-02-17',
    airtime: '21:00',
    runtime: 48,
    rating: { average: 8.3 },
    image: {
      medium: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80',
    },
    summary:
      'Walt tells his family about his cancer diagnosis at a barbecue. Jesse visits his parents and brother.',
  },
  {
    id: 1005,
    name: 'Gray Matter',
    season: 1,
    number: 5,
    airdate: '2008-02-24',
    airtime: '21:00',
    runtime: 48,
    rating: { average: 8.4 },
    image: {
      medium: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=500&q=80',
    },
    summary:
      'Walt attends a birthday party of an affluent former colleague who offers to pay for his medical treatment.',
  },
];

export class TVMazeService {
  private static instance: TVMazeService;

  public static getInstance(): TVMazeService {
    if (!TVMazeService.instance) {
      TVMazeService.instance = new TVMazeService();
    }
    return TVMazeService.instance;
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
      const timeout = setTimeout(() => controller.abort(), 6500);

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
    const poster =
      show.image?.original ||
      show.image?.medium ||
      'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=500&q=80';

    const backdrop =
      show.image?.original ||
      'https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?w=1280&q=80';

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

    const mappedTmdbId = TVMAZE_TO_TMDB_MAP[show.id];

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
   * Fetches popular television series directory.
   */
  async getPopularShows(page = 0): Promise<Movie[]> {
    const live = await this.requestTVMaze<TVMazeShow[]>('/shows', {
      page: String(page),
    });

    if (Array.isArray(live) && live.length > 0) {
      // Sort by rating average & weight
      const sorted = [...live].sort((a, b) => {
        const rA = a.rating?.average || 0;
        const rB = b.rating?.average || 0;
        return rB - rA;
      });
      return sorted.slice(0, 30).map((show) => this.showToMovie(show));
    }

    return FALLBACK_TVMAZE_SHOWS.map((show) => this.showToMovie(show));
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

    // Curated broadcast schedule fallback
    return FALLBACK_TVMAZE_SHOWS.map((show, idx) => ({
      id: 2000 + idx,
      name: `${show.name} - Broadcast`,
      season: 1,
      number: idx + 1,
      type: 'regular',
      airdate: today,
      airtime: show.schedule?.time || '21:00',
      runtime: show.runtime || 60,
      image: show.image,
      summary: `<p>Broadcast of ${show.name} on ${
        show.network?.name || show.webChannel?.name || 'Network'
      }.</p>`,
      show,
    }));
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
    if (showId === 1371) {
      return FALLBACK_EPISODES;
    }
    const show = FALLBACK_TVMAZE_SHOWS.find((s) => s.id === showId);
    return [
      {
        id: showId * 10 + 1,
        name: 'Pilot / Chapter 1',
        season: 1,
        number: 1,
        airdate: show?.premiered || '2024-01-01',
        airtime: show?.schedule?.time || '21:00',
        runtime: show?.runtime || 60,
        rating: { average: show?.rating?.average || 8.5 },
        image: show?.image,
        summary: show?.summary || 'Season premiere broadcast.',
      },
    ];
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
    if (showId === 1371) {
      return [
        { id: 1, number: 1, name: 'Season 1', episodeOrder: 7, premiereDate: '2008-01-20' },
        { id: 2, number: 2, name: 'Season 2', episodeOrder: 13, premiereDate: '2009-03-08' },
        { id: 3, number: 3, name: 'Season 3', episodeOrder: 13, premiereDate: '2010-03-21' },
        { id: 4, number: 4, name: 'Season 4', episodeOrder: 13, premiereDate: '2011-07-17' },
        { id: 5, number: 5, name: 'Season 5', episodeOrder: 16, premiereDate: '2012-07-15' },
      ];
    }
    if (showId === 2993) {
      return [
        { id: 1, number: 1, name: 'Season 1', episodeOrder: 8, premiereDate: '2016-07-15' },
        { id: 2, number: 2, name: 'Season 2', episodeOrder: 9, premiereDate: '2017-10-27' },
        { id: 3, number: 3, name: 'Season 3', episodeOrder: 8, premiereDate: '2019-07-04' },
        { id: 4, number: 4, name: 'Season 4', episodeOrder: 9, premiereDate: '2022-05-27' },
      ];
    }
    if (showId === 44778) {
      return [
        { id: 1, number: 1, name: 'Season 1', episodeOrder: 10, premiereDate: '2022-08-21' },
        { id: 2, number: 2, name: 'Season 2', episodeOrder: 8, premiereDate: '2024-06-16' },
      ];
    }
    const show = FALLBACK_TVMAZE_SHOWS.find((s) => s.id === showId);
    return [
      { id: 1, number: 1, name: 'Season 1', episodeOrder: 10, premiereDate: show?.premiered || '2024-01-01' },
    ];
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
    const found = FALLBACK_TVMAZE_SHOWS.find((s) => s.id === showId);
    return found || FALLBACK_TVMAZE_SHOWS[0];
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

    // Local filter fallback
    const lower = qClean.toLowerCase();
    const matches = FALLBACK_TVMAZE_SHOWS.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.genres.some((g) => g.toLowerCase().includes(lower)) ||
        (s.network?.name && s.network.name.toLowerCase().includes(lower)),
    );

    return matches.map((s) => this.showToMovie(s));
  }
}

export const tvMazeService = TVMazeService.getInstance();
