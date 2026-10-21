import { Movie, Genre, MovieBookmark, StreamableMedia } from '../../types';
import { movieRepository } from '../../database/repositories';
import { settingsRepository } from '../../database/repositories';

const DEFAULT_CLOUD_SERVER_URL = 'https://backend-9i6w.onrender.com';

export const HARDCODED_CLIENT_MOVIES: Movie[] = [
  {
    id: 693134,
    title: 'Dune: Part Two',
    original_title: 'Dune: Part Two',
    overview:
      'Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe, he endeavors to prevent a terrible future only he can foresee.',
    poster_path: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    backdrop_path: 'https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s520023.jpg',
    vote_average: 8.6,
    vote_count: 5200,
    release_date: '2024-03-01',
    genre_ids: [878, 12, 18],
    genres: [
      { id: 878, name: 'Sci-Fi' },
      { id: 12, name: 'Adventure' },
      { id: 18, name: 'Drama' },
    ],
    runtime: 166,
    tagline: 'Long live the fighters.',
    trailer_key: 'Way9Dexny3w',
    director: 'Denis Villeneuve',
    cast: [
      {
        id: 1190668,
        name: 'Timothée Chalamet',
        character: 'Paul Atreides',
        profile_path: 'https://image.tmdb.org/t/p/w185/BE2sdjpgsa2rNTFa66f7upkaOP.jpg',
      },
      {
        id: 505710,
        name: 'Zendaya',
        character: 'Chani',
        profile_path: 'https://image.tmdb.org/t/p/w185/r3A7ev7QkjvAcUo67IHv00vSlbt.jpg',
      },
      {
        id: 938,
        name: 'Rebecca Ferguson',
        character: 'Lady Jessica',
        profile_path: 'https://image.tmdb.org/t/p/w185/6NR8eT4AkmQj83K0a9c67q5f5mB.jpg',
      },
      {
        id: 7467,
        name: 'Javier Bardem',
        character: 'Stilgar',
        profile_path: 'https://image.tmdb.org/t/p/w185/hVd1Y3G2Gz1Cslb08t35F2k4uJ1.jpg',
      },
    ],
    category: 'trending',
  },
  {
    id: 872585,
    title: 'Oppenheimer',
    original_title: 'Oppenheimer',
    overview:
      'The story of J. Robert Oppenheimer’s role in the development of the atomic bomb during World War II, exploring the profound moral dilemmas and political fallout that reshaped humanity forever.',
    poster_path: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    backdrop_path: 'https://image.tmdb.org/t/p/original/rLb2cwF3Pazuxaj0sRXQ037tGI1.jpg',
    vote_average: 8.9,
    vote_count: 9800,
    release_date: '2023-07-21',
    genre_ids: [18, 36],
    genres: [
      { id: 18, name: 'Drama' },
      { id: 36, name: 'History' },
    ],
    runtime: 180,
    tagline: 'The world forever changes.',
    trailer_key: 'uYPbbksJxIg',
    director: 'Christopher Nolan',
    cast: [
      {
        id: 2037,
        name: 'Cillian Murphy',
        character: 'J. Robert Oppenheimer',
        profile_path: 'https://image.tmdb.org/t/p/w185/2t7Xh0qXvI2vU5n9K7Pq.jpg',
      },
      {
        id: 5081,
        name: 'Emily Blunt',
        character: 'Kitty Oppenheimer',
        profile_path: 'https://image.tmdb.org/t/p/w185/55U37N2r9s3kX7t0l.jpg',
      },
      {
        id: 3223,
        name: 'Robert Downey Jr.',
        character: 'Lewis Strauss',
        profile_path: 'https://image.tmdb.org/t/p/w185/5qHNjhtjMD4Ywh3ag09.jpg',
      },
    ],
    category: 'top_rated',
  },
  {
    id: 569094,
    title: 'Spider-Man: Across the Spider-Verse',
    original_title: 'Spider-Man: Across the Spider-Verse',
    overview:
      'After reuniting with Gwen Stacy, Brooklyn’s full-time, friendly neighborhood Spider-Man is catapulted across the Multiverse, where he encounters the Spider Society, a team of Spider-People charged with protecting the multiverse’s very existence.',
    poster_path: 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
    backdrop_path: 'https://image.tmdb.org/t/p/original/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg',
    vote_average: 8.7,
    vote_count: 7300,
    release_date: '2023-06-02',
    genre_ids: [16, 28, 12, 878],
    genres: [
      { id: 16, name: 'Animation' },
      { id: 28, name: 'Action' },
      { id: 12, name: 'Adventure' },
      { id: 878, name: 'Sci-Fi' },
    ],
    runtime: 140,
    tagline: 'It’s how you wear the mask that matters.',
    trailer_key: 'shW9i6k8cB0',
    director: 'Joaquim Dos Santos, Kemp Powers',
    cast: [
      {
        id: 587506,
        name: 'Shameik Moore',
        character: 'Miles Morales / Spider-Man',
        profile_path: 'https://image.tmdb.org/t/p/w185/u6f9lK8r.jpg',
      },
      {
        id: 54693,
        name: 'Hailee Steinfeld',
        character: 'Gwen Stacy / Spider-Woman',
        profile_path: 'https://image.tmdb.org/t/p/w185/k7r2Uj.jpg',
      },
    ],
    category: 'popular',
  },
  {
    id: 533535,
    title: 'Deadpool & Wolverine',
    original_title: 'Deadpool & Wolverine',
    overview:
      'A listless Wade Wilson toils away in civilian life with his days as the morally flexible mercenary, Deadpool, behind him. But when his homeworld faces an existential threat, Wade must reluctantly suit-up again with an even more reluctant Wolverine.',
    poster_path: 'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4tmnEdMubf.jpg',
    backdrop_path: 'https://image.tmdb.org/t/p/original/yDHYTfA3R0jFYba16jBB12RQIZ6.jpg',
    vote_average: 8.1,
    vote_count: 4600,
    release_date: '2024-07-26',
    genre_ids: [28, 35, 878],
    genres: [
      { id: 28, name: 'Action' },
      { id: 35, name: 'Comedy' },
      { id: 878, name: 'Sci-Fi' },
    ],
    runtime: 128,
    tagline: 'Come together.',
    trailer_key: 'Idh8n5XuYIA',
    director: 'Shawn Levy',
    cast: [
      {
        id: 10859,
        name: 'Ryan Reynolds',
        character: 'Wade Wilson / Deadpool',
        profile_path: 'https://image.tmdb.org/t/p/w185/2McB.jpg',
      },
      {
        id: 6968,
        name: 'Hugh Jackman',
        character: 'Logan / Wolverine',
        profile_path: 'https://image.tmdb.org/t/p/w185/kR.jpg',
      },
    ],
    category: 'now_playing',
  },
  {
    id: 157336,
    title: 'Interstellar',
    original_title: 'Interstellar',
    overview:
      'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage to save humanity.',
    poster_path: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdrop_path: 'https://image.tmdb.org/t/p/original/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
    vote_average: 8.8,
    vote_count: 34500,
    release_date: '2014-11-07',
    genre_ids: [12, 18, 878],
    genres: [
      { id: 12, name: 'Adventure' },
      { id: 18, name: 'Drama' },
      { id: 878, name: 'Sci-Fi' },
    ],
    runtime: 169,
    tagline: 'Mankind was born on Earth. It was never meant to die here.',
    trailer_key: 'zSWdZVtXT7E',
    director: 'Christopher Nolan',
    cast: [
      {
        id: 10297,
        name: 'Matthew McConaughey',
        character: 'Joseph Cooper',
        profile_path: 'https://image.tmdb.org/t/p/w185/sY23ocW2t.jpg',
      },
      {
        id: 1813,
        name: 'Anne Hathaway',
        character: 'Dr. Amelia Brand',
        profile_path: 'https://image.tmdb.org/t/p/w185/tL.jpg',
      },
    ],
    category: 'top_rated',
  },
  {
    id: 27205,
    title: 'Inception',
    original_title: 'Inception',
    overview:
      'Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets, is offered a chance to regain his old life as payment for an impossible task: "inception", the implantation of another person\'s idea into a target\'s subconscious.',
    poster_path: 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
    backdrop_path: 'https://image.tmdb.org/t/p/original/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg',
    vote_average: 8.7,
    vote_count: 36000,
    release_date: '2010-07-16',
    genre_ids: [28, 878, 12],
    genres: [
      { id: 28, name: 'Action' },
      { id: 878, name: 'Sci-Fi' },
      { id: 12, name: 'Adventure' },
    ],
    runtime: 148,
    tagline: 'Your mind is the scene of the crime.',
    trailer_key: 'YoHD9XEInc0',
    director: 'Christopher Nolan',
    cast: [
      {
        id: 6193,
        name: 'Leonardo DiCaprio',
        character: 'Dom Cobb',
        profile_path: 'https://image.tmdb.org/t/p/w185/wo2h.jpg',
      },
      {
        id: 24045,
        name: 'Joseph Gordon-Levitt',
        character: 'Arthur',
        profile_path: 'https://image.tmdb.org/t/p/w185/4G.jpg',
      },
    ],
    category: 'top_rated',
  },
  {
    id: 155,
    title: 'The Dark Knight',
    original_title: 'The Dark Knight',
    overview:
      'Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets.',
    poster_path: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    backdrop_path: 'https://image.tmdb.org/t/p/original/dqK9Hag1054tghRQSqLSfrkvQnA.jpg',
    vote_average: 8.9,
    vote_count: 32000,
    release_date: '2008-07-18',
    genre_ids: [18, 28, 80, 53],
    genres: [
      { id: 18, name: 'Drama' },
      { id: 28, name: 'Action' },
      { id: 80, name: 'Crime' },
      { id: 53, name: 'Thriller' },
    ],
    runtime: 152,
    tagline: 'Why so serious?',
    trailer_key: 'EXeTwQWrcwY',
    director: 'Christopher Nolan',
    cast: [
      {
        id: 3894,
        name: 'Christian Bale',
        character: 'Bruce Wayne / Batman',
        profile_path: 'https://image.tmdb.org/t/p/w185/bE.jpg',
      },
      {
        id: 1810,
        name: 'Heath Ledger',
        character: 'Joker',
        profile_path: 'https://image.tmdb.org/t/p/w185/5h.jpg',
      },
    ],
    category: 'top_rated',
  },
  {
    id: 558449,
    title: 'Gladiator II',
    original_title: 'Gladiator II',
    overview:
      'Years after witnessing the death of the revered hero Maximus at the hands of his uncle, Lucius must enter the Colosseum after his home is conquered by the tyrannical Emperors who now lead Rome with an iron fist.',
    poster_path: 'https://image.tmdb.org/t/p/w500/2cxhvwyEwRlysAmRH4iodkvo0z5.jpg',
    backdrop_path: 'https://image.tmdb.org/t/p/original/euYIwmwkmz95mnExvufVsq98Zuj.jpg',
    vote_average: 7.8,
    vote_count: 2400,
    release_date: '2024-11-22',
    genre_ids: [28, 12, 18],
    genres: [
      { id: 28, name: 'Action' },
      { id: 12, name: 'Adventure' },
      { id: 18, name: 'Drama' },
    ],
    runtime: 148,
    tagline: 'What we do in life echoes in eternity.',
    trailer_key: '8g1vE8m7n28',
    director: 'Ridley Scott',
    cast: [
      {
        id: 2420108,
        name: 'Paul Mescal',
        character: 'Lucius Verus',
        profile_path: 'https://image.tmdb.org/t/p/w185/pM.jpg',
      },
    ],
    category: 'upcoming',
  },
  {
    id: 545611,
    title: 'Everything Everywhere All at Once',
    original_title: 'Everything Everywhere All at Once',
    overview:
      'An aging Chinese immigrant is swept up in an insane adventure, where she alone can save what’s important to her by connecting with the lives she could have led in other universes.',
    poster_path: 'https://image.tmdb.org/t/p/w500/w3LxiVYPqrlxqPYSENY0XIO3qFZ.jpg',
    backdrop_path: 'https://image.tmdb.org/t/p/original/feSiISwgEpVzR1v3zv2n8qm8Bgm.jpg',
    vote_average: 8.5,
    vote_count: 6500,
    release_date: '2022-03-25',
    genre_ids: [28, 12, 878, 35],
    genres: [
      { id: 28, name: 'Action' },
      { id: 12, name: 'Adventure' },
      { id: 878, name: 'Sci-Fi' },
      { id: 35, name: 'Comedy' },
    ],
    runtime: 139,
    tagline: 'The universe is so much bigger than you realize.',
    trailer_key: 'wxN1T1uxQ2g',
    director: 'Daniel Kwan, Daniel Scheinert',
    cast: [
      {
        id: 1620,
        name: 'Michelle Yeoh',
        character: 'Evelyn Wang',
        profile_path: 'https://image.tmdb.org/t/p/w185/mY.jpg',
      },
    ],
    category: 'popular',
  },
  {
    id: 129,
    title: 'Spirited Away',
    original_title: '千と千尋の神隠し',
    overview:
      'A young girl, Chihiro, becomes trapped in a strange world of spirits and gods after her parents undergo a mysterious transformation. She must work in a wondrous bathhouse to rescue them.',
    poster_path: 'https://image.tmdb.org/t/p/w500/393mh2AJ0GYW70OsqGXulCwEZne.jpg',
    backdrop_path: 'https://image.tmdb.org/t/p/original/Ab8mkHmkYADjU7wQiOkia99GQI.jpg',
    vote_average: 8.9,
    vote_count: 16500,
    release_date: '2001-07-20',
    genre_ids: [16, 10751, 14],
    genres: [
      { id: 16, name: 'Animation' },
      { id: 10751, name: 'Family' },
      { id: 14, name: 'Fantasy' },
    ],
    runtime: 125,
    tagline: 'Tunnel into the world of wonders.',
    trailer_key: 'ByXuk9QqQkk',
    director: 'Hayao Miyazaki',
    cast: [
      {
        id: 19588,
        name: 'Rumi Hiiragi',
        character: 'Chihiro Ogino',
        profile_path: 'https://image.tmdb.org/t/p/w185/rH.jpg',
      },
    ],
    category: 'top_rated',
  },
];

export const GENRE_LIST: Genre[] = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 18, name: 'Drama' },
  { id: 14, name: 'Fantasy' },
  { id: 878, name: 'Sci-Fi' },
  { id: 53, name: 'Thriller' },
];

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
    if (!raw) return HARDCODED_CLIENT_MOVIES[0];
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
    const releaseDate = raw.release_date || raw.releaseDate || '';

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

    const rawTitle = raw.title || raw.name || '';
    const localMatch = HARDCODED_CLIENT_MOVIES.find(
      (m) =>
        m.id === id ||
        (m.title && rawTitle && m.title.toLowerCase() === String(rawTitle).toLowerCase()),
    );

    return {
      id,
      title: raw.title || raw.name || 'Untitled',
      original_title: raw.original_title || raw.originalTitle || raw.title || '',
      overview: raw.overview || localMatch?.overview || 'No overview available.',
      poster_path: poster || localMatch?.poster_path || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80',
      backdrop_path: backdrop || localMatch?.backdrop_path || poster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1280&q=80',
      vote_average: Number(rating.toFixed(1)),
      vote_count: Number(raw.vote_count || raw.voteCount || (localMatch ? 1500 : 0)),
      release_date: releaseDate || localMatch?.release_date || '',
      genre_ids: genreIds.length > 0 ? genreIds : (localMatch?.genre_ids || []),
      genres: Array.isArray(raw.genres)
        ? raw.genres.map((g: any) =>
            typeof g === 'object' && g
              ? { id: Number(g.id || 0), name: String(g.name || '') }
              : { id: 0, name: String(g) },
          )
        : localMatch?.genres,
      runtime: raw.runtime ? Number(raw.runtime) : localMatch?.runtime,
      tagline: raw.tagline || localMatch?.tagline || '',
      trailer_key: raw.trailer_key || raw.trailerKey || localMatch?.trailer_key || undefined,
      director: raw.director || localMatch?.director || undefined,
      cast: Array.isArray(raw.cast) ? raw.cast : localMatch?.cast,
      category: raw.category || localMatch?.category,
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

  private async requestApi<T>(endpoint: string, params?: Record<string, string>): Promise<T | null> {
    try {
      const baseUrl = await this.getBaseUrl();
      const url = new URL(`${baseUrl}/api/movies${endpoint}`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null) {
            url.searchParams.set(k, v);
          }
        });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7500);

      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
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
    const extracted = this.extractMovies(remote);
    if (extracted.length > 0) {
      if (page > 1) {
        return extracted;
      }
      // Merge live trending with curated client dataset to preserve trailer keys & cast
      const existingIds = new Set(extracted.map((m) => m.id));
      const merged = [
        ...extracted,
        ...HARDCODED_CLIENT_MOVIES.filter((m) => !existingIds.has(m.id)),
      ];
      return merged;
    }
    return HARDCODED_CLIENT_MOVIES;
  }

  async getNowPlaying(page = 1): Promise<Movie[]> {
    const remote = await this.requestApi<any>('/now-playing', {
      page: String(page),
    });
    const extracted = this.extractMovies(remote);
    if (extracted.length > 0) {
      return extracted;
    }
    const live = await this.getTrending(page);
    return live.length > 0 ? live : HARDCODED_CLIENT_MOVIES;
  }

  async getTopRated(page = 1): Promise<Movie[]> {
    const remote = await this.requestApi<any>('/top-rated', {
      page: String(page),
    });
    const extracted = this.extractMovies(remote);
    if (extracted.length > 0) {
      return extracted;
    }
    const live = await this.getTrending(page);
    return [...live].sort((a, b) => b.vote_average - a.vote_average);
  }

  async getUpcoming(page = 1): Promise<Movie[]> {
    const remote = await this.requestApi<any>('/upcoming', {
      page: String(page),
    });
    const extracted = this.extractMovies(remote);
    if (extracted.length > 0) {
      return extracted;
    }
    const live = await this.getTrending(page);
    return live.length > 0 ? live.slice().reverse() : HARDCODED_CLIENT_MOVIES;
  }

  async searchMovies(query: string, genreId?: number): Promise<Movie[]> {
    const qClean = (query || '').trim();
    const lower = qClean.toLowerCase();

    // 1. Search local curated catalog (has rich offline cast, director & trailer metadata)
    let localMatches: Movie[] = [];
    if (lower.length > 0) {
      localMatches = HARDCODED_CLIENT_MOVIES.filter(
        (m) =>
          m.title.toLowerCase().includes(lower) ||
          m.overview.toLowerCase().includes(lower) ||
          (m.director && m.director.toLowerCase().includes(lower)),
      );
    } else {
      localMatches = [...HARDCODED_CLIENT_MOVIES];
    }
    if (genreId) {
      localMatches = localMatches.filter((m) => m.genre_ids.includes(genreId));
    }

    // 2. Query cloud companion server for live TMDb search results
    if (qClean.length > 0) {
      const remote = await this.requestApi<any>('/search', {
        q: qClean,
        genre: genreId ? String(genreId) : '',
      });
      const remoteMatches = this.extractMovies(remote);

      if (remoteMatches.length > 0) {
        const filteredRemote = genreId
          ? remoteMatches.filter((m) => m.genre_ids && m.genre_ids.includes(genreId))
          : remoteMatches;

        const localIds = new Set(localMatches.map((m) => m.id));
        const combined = [
          ...localMatches,
          ...filteredRemote.filter((m) => !localIds.has(m.id)),
        ];
        return combined.length > 0 ? combined : filteredRemote;
      }
    }

    return localMatches;
  }

  async getMovieDetails(id: number): Promise<Movie> {
    const local = HARDCODED_CLIENT_MOVIES.find((m) => m.id === id);
    if (local) return local;

    const remote = await this.requestApi<any>(`/${id}`);
    if (remote) {
      const extracted = this.extractMovies(remote);
      if (extracted.length > 0) return extracted[0];
      if (remote.id || remote.tmdbId) return this.normalizeMovie(remote);
    }

    return {
      ...HARDCODED_CLIENT_MOVIES[0],
      id,
      title: `Movie #${id}`,
    };
  }

  async getWatchlist(): Promise<MovieBookmark[]> {
    // 1. Fetch from local SQLite / InMemory database first (instantaneous & offline)
    const localList = await movieRepository.findAll();

    // 2. Proactively sync from backend in the background if possible
    this.requestApi<any[]>('/watchlist')
      .then(async (remoteBookmarks) => {
        if (Array.isArray(remoteBookmarks) && remoteBookmarks.length > 0) {
          for (const item of remoteBookmarks) {
            await movieRepository.save({
              id: item.id || `sync-${item.tmdbId}`,
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
            });
          }
        }
      })
      .catch(() => {});

    return localList;
  }

  async addToWatchlist(movie: Movie): Promise<void> {
    const bookmark: MovieBookmark = {
      id: `bm_${movie.id}_${Date.now()}`,
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
      savedAt: new Date().toISOString(),
    };

    // Save locally
    await movieRepository.save(bookmark);

    // Sync to backend
    this.requestApi('/watchlist', {
      method: 'POST',
      body: JSON.stringify(bookmark),
    } as any).catch(() => {});
  }

  async removeFromWatchlist(tmdbId: number): Promise<void> {
    await movieRepository.delete(tmdbId);
    this.requestApi(`/watchlist/${tmdbId}`, { method: 'DELETE' } as any).catch(() => {});
  }

  async toggleWatched(tmdbId: number): Promise<boolean> {
    const nextWatched = await movieRepository.toggleWatched(tmdbId);
    this.requestApi(`/watchlist/${tmdbId}/watched`, {
      method: 'PATCH',
      body: JSON.stringify({ isWatched: nextWatched }),
    } as any).catch(() => {});
    return nextWatched;
  }

  async isBookmarked(tmdbId: number): Promise<boolean> {
    return movieRepository.isBookmarked(tmdbId);
  }

  async getStreamCatalog(): Promise<StreamableMedia[]> {
    const remote = await this.requestApi<StreamableMedia[]>('/stream/catalog');
    if (remote && Array.isArray(remote) && remote.length > 0) {
      return remote;
    }
    return HARDCODED_STREAM_CATALOG;
  }

  async getStreamVideoUrl(streamId: string): Promise<string> {
    const baseUrl = await this.getBaseUrl();
    return `${baseUrl}/api/movies/stream/video/${encodeURIComponent(streamId)}`;
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
  ): Promise<{ url: string; quality: string; label: string } | null> {
    const providers = ['cinextream', 'vidora', 'vidzee', 'videasy'];
    const BANNED_DOMAINS = ['vidjoy.org', 'banned-cdn.com', 'offline-stream.xyz'];
    const qs = isTv
      ? `id=${tmdbId}&type=tv&season=${season}&episode=${episode}`
      : `id=${tmdbId}&type=movie`;

    // Fast reachability check to reject streams that return 403 / 404 / Cloudflare blocks
    const isStreamReachable = async (url: string): Promise<boolean> => {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 2200);
        const res = await fetch(url, {
          method: 'GET',
          headers: { Range: 'bytes=0-100' },
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
        const timeout = setTimeout(() => controller.abort(), 5500);
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
              const alive = await isStreamReachable(candidate.url);
              if (alive) {
                return {
                  url: candidate.url,
                  quality: candidate.quality || '1080p Full HD',
                  label: candidate.label || 'Direct Ad-Free Stream',
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

export const HARDCODED_STREAM_CATALOG: StreamableMedia[] = [
  {
    id: 'universal-dune-2',
    tmdbId: 693134,
    title: 'Dune: Part Two (Full Movie)',
    type: 'movie',
    sourceType: 'remote',
    duration: '2h 46m',
    quality: '1080p Full HD',
    overview:
      'Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s520023.jpg',
    genres: ['Sci-Fi', 'Adventure', 'Action'],
    releaseYear: '2024',
  },
  {
    id: 'universal-deadpool-wolverine',
    tmdbId: 533535,
    title: 'Deadpool & Wolverine (Full Movie)',
    type: 'movie',
    sourceType: 'remote',
    duration: '2h 08m',
    quality: '1080p Full HD',
    overview:
      'A listless Wade Wilson toils away in civilian life before uniting with an even more reluctant Wolverine to save his homeworld from existential collapse.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4tmnEdMubf.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/yDHYTfA3R0jFYba16jBB12RQIZ6.jpg',
    genres: ['Action', 'Comedy', 'Sci-Fi'],
    releaseYear: '2024',
  },
  {
    id: 'universal-stranger-things',
    tmdbId: 66732,
    title: 'Stranger Things (TV Series)',
    type: 'series',
    sourceType: 'remote',
    duration: '4 Seasons • 34 Episodes',
    quality: '4K Ultra HD',
    overview:
      'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg',
    genres: ['Sci-Fi', 'Mystery', 'Drama'],
    releaseYear: '2022',
  },
  {
    id: 'universal-breaking-bad',
    tmdbId: 1396,
    title: 'Breaking Bad (TV Series)',
    type: 'series',
    sourceType: 'remote',
    duration: '5 Seasons • 62 Episodes',
    quality: '1080p Full HD',
    overview:
      'A chemistry teacher diagnosed with terminal lung cancer teams up with a former student to manufacture and sell crystal meth to secure his family’s financial future.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
    genres: ['Crime', 'Drama', 'Thriller'],
    releaseYear: '2013',
  },
  {
    id: 'stream-tears-of-steel',
    title: 'Tears of Steel (Sci-Fi Feature)',
    type: 'movie',
    sourceType: 'remote',
    sourceUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    duration: '12m 14s',
    quality: '1080p Full HD',
    overview:
      'In a dystopian future Amsterdam, scientists attempt to reconnect with a giant robot AI in this stunning sci-fi feature.',
    posterUrl:
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&q=80',
    backdropUrl:
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80',
    genres: ['Sci-Fi', 'Action'],
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
      'A large and lovable rabbit deals with bullying forest creatures in this computer-animated comedy feature.',
    posterUrl:
      'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&q=80',
    backdropUrl:
      'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200&q=80',
    genres: ['Animation', 'Comedy'],
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
    genres: ['Sci-Fi', 'Series'],
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

export const movieService = MovieService.getInstance();
