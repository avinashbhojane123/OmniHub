export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path?: string | null;
  order?: number;
  known_for_department?: string;
  original_name?: string;
}

export interface Genre {
  id: number;
  name: string;
}

export const ALL_GENRES: readonly Genre[] = [
  // TMDB Movie & Universal Genres
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
  // TMDB TV Specific Genres
  { id: 10759, name: 'Action & Adventure' },
  { id: 10762, name: 'Kids' },
  { id: 10763, name: 'News' },
  { id: 10764, name: 'Reality' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
  { id: 10766, name: 'Soap' },
  { id: 10767, name: 'Talk' },
  { id: 10768, name: 'War & Politics' },
] as const;

export interface VideoTrailer {
  id: string;
  key: string;
  name: string;
  site: 'YouTube' | 'Vimeo' | string;
  type:
    | 'Trailer'
    | 'Teaser'
    | 'Clip'
    | 'Featurette'
    | 'Behind the Scenes'
    | 'Bloopers'
    | string;
  official?: boolean;
  published_at?: string;
  size?: number;
  iso_639_1?: string;
}

export type MovieMediaCategory =
  | 'trending'
  | 'now_playing'
  | 'popular'
  | 'top_rated'
  | 'upcoming';

export interface Movie {
  id: number;
  title: string;
  original_title?: string;
  original_language?: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  vote_average: number;
  vote_count?: number;
  release_date: string;
  genre_ids: number[];
  genres?: Genre[];
  runtime?: number;
  tagline?: string;
  trailer_key?: string;
  director?: string;
  cast?: CastMember[];
  category?: MovieMediaCategory;
  // TV / Series Specific Metrics
  is_tv?: boolean;
  first_air_date?: string;
  last_air_date?: string;
  tvmaze_id?: number;
  network?: string;
  schedule_time?: string;
  schedule_days?: string[];
  status?: string;
  total_seasons?: number;
  total_episodes?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  tmdb_id?: number;
  thetvdb_id?: number;
  imdb_id?: string;
  media_type?: 'movie' | 'tv' | 'person';
  popularity?: number;
  adult?: boolean;
  budget?: number;
  revenue?: number;
}

export interface MovieBookmark {
  id: string;
  tmdbId: number;
  userId?: string | null;
  title: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  voteAverage: number;
  releaseDate?: string;
  genres: string[];
  runtime?: number;
  isWatched: boolean;
  savedAt: string;
  isTv?: boolean;
}

export interface CreateMovieBookmarkDTO {
  id?: string;
  tmdbId: number;
  userId?: string | null;
  title: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  voteAverage?: number;
  releaseDate?: string;
  genres?: string[];
  runtime?: number;
  isWatched?: boolean;
  savedAt?: string;
  isTv?: boolean;
}

export interface UpdateMovieBookmarkDTO {
  title?: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  voteAverage?: number;
  releaseDate?: string;
  genres?: string[];
  runtime?: number;
  isWatched?: boolean;
  isTv?: boolean;
}

export interface StreamEpisode {
  episodeNumber: number;
  title: string;
  duration: string;
  streamId: string;
}

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
  episodes?: StreamEpisode[];
  tmdbId?: number;
}

export interface StreamingServer {
  id: string;
  name: string;
  label: string;
  badge: string;
}

export interface StreamLanguage {
  code: string;
  label: string;
  flag: string;
}

export interface ActiveStreamState {
  title: string;
  tmdbId?: number | string;
  imdbId?: string;
  isTv: boolean;
  season: number;
  episode: number;
  serverId: string;
  directUrl?: string;
  quality?: string;
  isHls?: boolean;
  headers?: Record<string, string>;
  totalSeasons?: number;
  episodesInSeason?: number;
}

export interface DownloadItemState {
  title: string;
  posterUrl?: string;
  quality?: string;
  downloadUrl?: string;
  isResolving: boolean;
  error?: string;
  movie?: any;
  isTv?: boolean;
  season?: number;
  episode?: number;
}

export interface WorkspaceLanguage {
  code: string;
  name: string;
  flag: string;
}

export const WORKSPACE_LANGUAGES: readonly WorkspaceLanguage[] = [
  { code: 'all', name: 'All Languages', flag: '🌐' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ta', name: 'Tamil', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', flag: '🇮🇳' },
  { code: 'ml', name: 'Malayalam', flag: '🇮🇳' },
  { code: 'kn', name: 'Kannada', flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', flag: '🇮🇳' },
  { code: 'pa', name: 'Punjabi', flag: '🇮🇳' },
  { code: 'ko', name: 'Korean (K-Drama)', flag: '🇰🇷' },
  { code: 'ja', name: 'Japanese (Anime)', flag: '🇯🇵' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
] as const;

export interface TVMazeImage {
  medium?: string;
  original?: string;
}

export interface TVMazeNetwork {
  id?: number;
  name: string;
  country?: {
    name: string;
    code: string;
    timezone: string;
  } | null;
  officialSite?: string | null;
}

export interface TVMazeEpisode {
  id: number;
  url?: string;
  name: string;
  season: number;
  number: number;
  type?: string;
  airdate?: string;
  airtime?: string;
  airstamp?: string;
  runtime?: number;
  rating?: {
    average?: number;
  };
  image?: TVMazeImage | null;
  summary?: string;
}

export interface TVMazeSeason {
  id: number;
  url?: string;
  number: number;
  name?: string;
  episodeOrder?: number;
  premiereDate?: string;
  endDate?: string;
  network?: TVMazeNetwork | null;
  image?: TVMazeImage | null;
  summary?: string;
}

export interface TVMazeCast {
  person: {
    id: number;
    name: string;
    image?: TVMazeImage | null;
  };
  character: {
    id: number;
    name: string;
    image?: TVMazeImage | null;
  };
}

export interface TVMazeShow {
  id: number;
  url?: string;
  name: string;
  type?: string;
  language?: string;
  genres: string[];
  status?: string;
  runtime?: number;
  averageRuntime?: number;
  premiered?: string;
  ended?: string;
  officialSite?: string;
  schedule?: {
    time: string;
    days: string[];
  };
  rating?: {
    average?: number;
  };
  weight?: number;
  network?: TVMazeNetwork | null;
  webChannel?: TVMazeNetwork | null;
  image?: TVMazeImage | null;
  summary?: string;
  externals?: {
    tvrage?: number;
    thetvdb?: number;
    imdb?: string;
  };
  _embedded?: {
    episodes?: TVMazeEpisode[];
    seasons?: TVMazeSeason[];
    cast?: TVMazeCast[];
  };
}

export interface TVMazeScheduleItem {
  id: number;
  url?: string;
  name: string;
  season: number;
  number: number;
  type?: string;
  airdate?: string;
  airtime?: string;
  airstamp?: string;
  runtime?: number;
  image?: TVMazeImage | null;
  summary?: string;
  show: TVMazeShow;
}

export type MovieCategoryTab =
  | 'trending'
  | 'tv_shows'
  | 'watchlist';

export const MOVIE_CATEGORY_TABS: readonly MovieCategoryTab[] = [
  'trending',
  'tv_shows',
  'watchlist',
] as const;

export interface MovieFilterOptions {
  query?: string;
  genreId?: number;
  language?: string;
  page?: number;
  isTv?: boolean;
}

// Genre Resolution Utilities

export function getGenreNameById(id: number): string {
  const g = ALL_GENRES.find((item) => item.id === id);
  return g ? g.name : 'Unknown';
}

export function getGenreIdByName(name: string): number | undefined {
  if (!name || typeof name !== 'string') return undefined;
  const normalized = name.trim().toLowerCase();
  if (normalized === 'science fiction' || normalized === 'scifi' || normalized === 'sci fi') {
    return 878;
  }
  if (normalized === 'action and adventure' || normalized === 'action & adventure') {
    return 10759;
  }
  if (normalized === 'sci-fi & fantasy' || normalized === 'sci fi and fantasy' || normalized === 'scifi and fantasy') {
    return 10765;
  }
  if (normalized === 'war & politics' || normalized === 'war and politics') {
    return 10768;
  }
  const g = ALL_GENRES.find((item) => item.name.toLowerCase() === normalized);
  return g?.id;
}

export function getGenresByIds(ids: number[]): Genre[] {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id) => ALL_GENRES.find((g) => g.id === id))
    .filter((g): g is Genre => g !== undefined);
}

// Media URL & String Formatters

export type TmdbImageSize =
  | 'w92'
  | 'w154'
  | 'w185'
  | 'w342'
  | 'w500'
  | 'w780'
  | 'w1280'
  | 'original';

export function getTmdbImageUrl(
  path?: string | null,
  size: TmdbImageSize = 'w500'
): string | null {
  if (!path || path.trim().length === 0) return null;
  const cleanPath = path.trim();
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
    return cleanPath;
  }
  if (cleanPath.startsWith('//')) {
    return `https:${cleanPath}`;
  }
  const prefix = cleanPath.startsWith('/') ? '' : '/';
  return `https://image.tmdb.org/t/p/${size}${prefix}${cleanPath}`;
}

export function formatMovieDuration(runtimeMinutes?: number | string | null): string {
  const num = typeof runtimeMinutes === 'string' ? parseFloat(runtimeMinutes) : runtimeMinutes;
  if (!num || num <= 0 || Number.isNaN(num)) {
    return 'N/A';
  }
  const totalMins = Math.round(num);
  const hours = Math.floor(totalMins / 60);
  const minutes = totalMins % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

export function formatMovieReleaseYear(releaseDate?: string | null): string {
  if (!releaseDate) return 'N/A';
  const match = releaseDate.match(/^(\d{4})/);
  return match ? match[1] : 'N/A';
}

export function formatMovieRating(voteAverage?: number | string | null): string {
  const num = typeof voteAverage === 'string' ? parseFloat(voteAverage) : voteAverage;
  if (num === undefined || num === null || Number.isNaN(num)) {
    return '0.0';
  }
  const clamped = Math.max(0, Math.min(10, num));
  return clamped.toFixed(1);
}

export function getTrailerEmbedUrl(trailer: VideoTrailer | string | null | undefined): string {
  if (!trailer) return '';
  const rawKey = typeof trailer === 'string' ? trailer : trailer.key;
  if (!rawKey || typeof rawKey !== 'string') return '';
  const key = rawKey.trim();
  if (!key) return '';

  // Extract 11-char YouTube ID if provided as full URL
  const ytMatch = key.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&controls=1&rel=0`;
  }

  // Handle direct Vimeo URLs or embeds
  if (key.includes('vimeo.com')) {
    const vimeoMatch = key.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }
    return key;
  }

  if (key.startsWith('http://') || key.startsWith('https://')) {
    return key;
  }

  return `https://www.youtube.com/embed/${encodeURIComponent(key)}?autoplay=1&controls=1&rel=0`;
}

export function stripHtml(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-fA-F0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

// Domain Object Factory & Converters

export function createEmptyMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: overrides.id || 0,
    title: overrides.title || '',
    original_title: overrides.original_title || overrides.title || '',
    original_language: overrides.original_language,
    overview: overrides.overview || '',
    poster_path: overrides.poster_path,
    backdrop_path: overrides.backdrop_path,
    vote_average: overrides.vote_average || 0,
    vote_count: overrides.vote_count || 0,
    release_date: overrides.release_date || '',
    first_air_date: overrides.first_air_date,
    genre_ids: Array.isArray(overrides.genre_ids) ? [...overrides.genre_ids] : [],
    genres: Array.isArray(overrides.genres) ? [...overrides.genres] : [],
    runtime: overrides.runtime,
    tagline: overrides.tagline,
    trailer_key: overrides.trailer_key,
    director: overrides.director,
    cast: Array.isArray(overrides.cast) ? [...overrides.cast] : undefined,
    category: overrides.category,
    is_tv: Boolean(overrides.is_tv),
    tvmaze_id: overrides.tvmaze_id,
    network: overrides.network,
    status: overrides.status,
    total_seasons: overrides.total_seasons,
    total_episodes: overrides.total_episodes,
    tmdb_id: overrides.tmdb_id || overrides.id || undefined,
    imdb_id: overrides.imdb_id,
  };
}

export function getMovieBookmarkKey(tmdbId: number, isTv = false): string {
  return `${tmdbId}-${Boolean(isTv)}`;
}

export function movieToBookmark(
  movie: Movie,
  isWatched = false,
  userId?: string | null
): MovieBookmark {
  const genres = Array.isArray(movie.genres) && movie.genres.length > 0
    ? movie.genres.map((g) => g.name)
    : Array.isArray(movie.genre_ids) && movie.genre_ids.length > 0
      ? movie.genre_ids.map(getGenreNameById).filter((name) => name !== 'Unknown')
      : [];

  const randomSuffix = Math.random().toString(36).slice(2, 7);
  return {
    id: `bm_${movie.id}_${Boolean(movie.is_tv)}_${Date.now()}_${randomSuffix}`,
    tmdbId: movie.id,
    userId: userId ?? null,
    title: movie.title,
    overview: movie.overview && movie.overview.trim().length > 0 ? movie.overview : undefined,
    posterPath: movie.poster_path && movie.poster_path.trim().length > 0 ? movie.poster_path : undefined,
    backdropPath: movie.backdrop_path && movie.backdrop_path.trim().length > 0 ? movie.backdrop_path : undefined,
    voteAverage: movie.vote_average || 0,
    releaseDate: movie.release_date || movie.first_air_date || undefined,
    genres,
    runtime: movie.runtime || 0,
    isWatched,
    savedAt: new Date().toISOString(),
    isTv: Boolean(movie.is_tv),
  };
}

export function bookmarkToMovie(bookmark: MovieBookmark): Movie {
  const genres: Genre[] = (bookmark.genres || []).map((name) => ({
    id: getGenreIdByName(name) || 0,
    name,
  }));
  const genre_ids = genres.map((g) => g.id).filter((id) => id > 0);

  return {
    id: bookmark.tmdbId,
    title: bookmark.title,
    overview: bookmark.overview || '',
    poster_path: bookmark.posterPath || undefined,
    backdrop_path: bookmark.backdropPath || bookmark.posterPath || undefined,
    vote_average: bookmark.voteAverage || 0,
    release_date: bookmark.releaseDate || '',
    first_air_date: bookmark.isTv ? bookmark.releaseDate || '' : undefined,
    genre_ids,
    genres,
    runtime: bookmark.runtime || undefined,
    is_tv: Boolean(bookmark.isTv),
    tmdb_id: bookmark.tmdbId,
  };
}

export function tvMazeShowToMovie(show: TVMazeShow, tmdbIdOverride?: number): Movie {
  const poster = show.image?.original || show.image?.medium || '';
  const backdrop = show.image?.original || show.image?.medium || '';
  const cleanOverview = stripHtml(show.summary) || 'No series synopsis available.';
  const networkName = show.network?.name || show.webChannel?.name || 'Broadcast TV';
  const releaseYear = show.premiered ? show.premiered.slice(0, 4) : '';

  const genreIds: number[] = [];
  const genres: Genre[] = [];

  if (Array.isArray(show.genres)) {
    for (const gName of show.genres) {
      const gId = getGenreIdByName(gName);
      if (gId) {
        if (!genreIds.includes(gId)) {
          genreIds.push(gId);
        }
        genres.push({ id: gId, name: gName });
      } else {
        genres.push({ id: 0, name: gName });
      }
    }
  }

  const ratingAvg =
    typeof show.rating?.average === 'number' && !Number.isNaN(show.rating.average)
      ? Number(show.rating.average)
      : 0;
  const tmdbId = tmdbIdOverride || show.externals?.thetvdb || undefined;

  return {
    id: show.id,
    title: show.name,
    original_title: show.name,
    original_language: show.language ? show.language.slice(0, 2).toLowerCase() : undefined,
    overview: cleanOverview,
    poster_path: poster || undefined,
    backdrop_path: backdrop || undefined,
    vote_average: ratingAvg,
    vote_count: typeof show.weight === 'number' && !Number.isNaN(show.weight) ? show.weight : 0,
    release_date: show.premiered || releaseYear,
    first_air_date: show.premiered,
    genre_ids: genreIds,
    genres,
    runtime: show.averageRuntime || show.runtime || undefined,
    status: show.status,
    network: networkName,
    schedule_time: show.schedule?.time,
    schedule_days: show.schedule?.days,
    total_seasons: show._embedded?.seasons?.length,
    total_episodes: show._embedded?.episodes?.length,
    is_tv: true,
    tvmaze_id: show.id,
    thetvdb_id: show.externals?.thetvdb || undefined,
    imdb_id: show.externals?.imdb || undefined,
    tmdb_id: tmdbId,
  };
}

// In-Memory Sorting & Filtering Helpers

export function sortMovies(
  movies: Movie[],
  sortBy: 'rating' | 'release_date' | 'title' | 'popularity' = 'rating',
  order: 'asc' | 'desc' = 'desc'
): Movie[] {
  if (!Array.isArray(movies)) return [];
  const factor = order === 'asc' ? 1 : -1;
  return [...movies].sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    switch (sortBy) {
      case 'rating': {
        const ratingA = typeof a.vote_average === 'number' && !Number.isNaN(a.vote_average) ? a.vote_average : 0;
        const ratingB = typeof b.vote_average === 'number' && !Number.isNaN(b.vote_average) ? b.vote_average : 0;
        return (ratingA - ratingB) * factor;
      }
      case 'release_date': {
        const dateA = a.release_date || a.first_air_date || '';
        const dateB = b.release_date || b.first_air_date || '';
        if (!dateA && dateB) return 1;
        if (dateA && !dateB) return -1;
        return dateA.localeCompare(dateB) * factor;
      }
      case 'title':
        return (a.title || '').localeCompare(b.title || '') * factor;
      case 'popularity': {
        const popA = typeof a.popularity === 'number' && !Number.isNaN(a.popularity) ? a.popularity : a.vote_count || 0;
        const popB = typeof b.popularity === 'number' && !Number.isNaN(b.popularity) ? b.popularity : b.vote_count || 0;
        return (popA - popB) * factor;
      }
      default:
        return 0;
    }
  });
}

export function filterMoviesByGenre(movies: Movie[], genreId: number): Movie[] {
  if (!Array.isArray(movies)) return [];
  if (!genreId || typeof genreId !== 'number' || Number.isNaN(genreId)) return [...movies];
  return movies.filter(
    (m) =>
      Boolean(m) &&
      ((Array.isArray(m.genre_ids) && m.genre_ids.includes(genreId)) ||
        (Array.isArray(m.genres) && m.genres.some((g) => g.id === genreId)))
  );
}

export function filterMoviesByLanguage(movies: Movie[], languageCode: string): Movie[] {
  if (!Array.isArray(movies)) return [];
  if (!languageCode || typeof languageCode !== 'string' || languageCode.trim().toLowerCase() === 'all') {
    return [...movies];
  }
  const lang = languageCode.trim().toLowerCase();
  return movies.filter((m) => Boolean(m) && m.original_language?.toLowerCase() === lang);
}

export function searchMoviesInMemory(movies: Movie[], query: string): Movie[] {
  if (!Array.isArray(movies)) return [];
  if (!query || typeof query !== 'string') return [...movies];
  const q = query.trim().toLowerCase();
  if (!q) return [...movies];
  return movies.filter((m) => {
    if (!m) return false;
    const inTitle = typeof m.title === 'string' && m.title.toLowerCase().includes(q);
    const inOrig = typeof m.original_title === 'string' && m.original_title.toLowerCase().includes(q);
    const inOverview = typeof m.overview === 'string' && m.overview.toLowerCase().includes(q);
    const inCast = Array.isArray(m.cast)
      ? m.cast.some(
          (c) =>
            (typeof c.name === 'string' && c.name.toLowerCase().includes(q)) ||
            (typeof c.character === 'string' && c.character.toLowerCase().includes(q))
        )
      : false;
    const inDirector = typeof m.director === 'string' && m.director.toLowerCase().includes(q);
    const inGenres = Array.isArray(m.genres)
      ? m.genres.some((g) => typeof g.name === 'string' && g.name.toLowerCase().includes(q))
      : false;
    const inGenreIds = Array.isArray(m.genre_ids)
      ? m.genre_ids.some((id) => getGenreNameById(id).toLowerCase().includes(q))
      : false;
    const inNetwork = typeof m.network === 'string' && m.network.toLowerCase().includes(q);
    return inTitle || inOrig || inOverview || inCast || inDirector || inGenres || inGenreIds || inNetwork;
  });
}

// Runtime Type Guards

export function isCastMember(value: unknown): value is CastMember {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'number' &&
    !Number.isNaN(c.id) &&
    typeof c.name === 'string' &&
    typeof c.character === 'string' &&
    (c.profile_path === undefined || c.profile_path === null || typeof c.profile_path === 'string') &&
    (c.order === undefined || (typeof c.order === 'number' && !Number.isNaN(c.order)))
  );
}

export function isGenre(value: unknown): value is Genre {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  return typeof g.id === 'number' && !Number.isNaN(g.id) && typeof g.name === 'string';
}

export function isVideoTrailer(value: unknown): value is VideoTrailer {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.key === 'string' &&
    typeof t.name === 'string' &&
    typeof t.site === 'string' &&
    typeof t.type === 'string'
  );
}

export function isStreamingServer(value: unknown): value is StreamingServer {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.label === 'string' &&
    typeof s.badge === 'string'
  );
}

export function isStreamEpisode(value: unknown): value is StreamEpisode {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.episodeNumber === 'number' &&
    !Number.isNaN(e.episodeNumber) &&
    typeof e.title === 'string' &&
    typeof e.duration === 'string' &&
    typeof e.streamId === 'string'
  );
}

export function isMovie(value: unknown): value is Movie {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'number' &&
    !Number.isNaN(m.id) &&
    typeof m.title === 'string' &&
    typeof m.vote_average === 'number' &&
    !Number.isNaN(m.vote_average) &&
    Array.isArray(m.genre_ids) &&
    m.genre_ids.every((id) => typeof id === 'number' && !Number.isNaN(id)) &&
    (m.overview === undefined || typeof m.overview === 'string') &&
    (m.release_date === undefined || typeof m.release_date === 'string') &&
    (m.is_tv === undefined || typeof m.is_tv === 'boolean')
  );
}

export function isMovieBookmark(value: unknown): value is MovieBookmark {
  if (typeof value !== 'object' || value === null) return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.id === 'string' &&
    typeof b.tmdbId === 'number' &&
    !Number.isNaN(b.tmdbId) &&
    typeof b.title === 'string' &&
    typeof b.voteAverage === 'number' &&
    !Number.isNaN(b.voteAverage) &&
    typeof b.isWatched === 'boolean' &&
    typeof b.savedAt === 'string' &&
    Array.isArray(b.genres) &&
    b.genres.every((g) => typeof g === 'string') &&
    (b.isTv === undefined || typeof b.isTv === 'boolean')
  );
}

export function isStreamableMedia(value: unknown): value is StreamableMedia {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.title === 'string' &&
    (s.type === 'movie' || s.type === 'series') &&
    (s.sourceType === 'local' || s.sourceType === 'remote') &&
    typeof s.quality === 'string' &&
    Array.isArray(s.genres) &&
    s.genres.every((g) => typeof g === 'string') &&
    (s.seasonNumber === undefined || (typeof s.seasonNumber === 'number' && !Number.isNaN(s.seasonNumber))) &&
    (s.episodeNumber === undefined || (typeof s.episodeNumber === 'number' && !Number.isNaN(s.episodeNumber)))
  );
}

export function isTVMazeShow(value: unknown): value is TVMazeShow {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'number' &&
    !Number.isNaN(s.id) &&
    typeof s.name === 'string' &&
    Array.isArray(s.genres) &&
    s.genres.every((g) => typeof g === 'string')
  );
}

export function isTVMazeEpisode(value: unknown): value is TVMazeEpisode {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.id === 'number' && !Number.isNaN(e.id) && typeof e.name === 'string';
}

export function isTVMazeSeason(value: unknown): value is TVMazeSeason {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'number' &&
    !Number.isNaN(s.id) &&
    typeof s.number === 'number' &&
    !Number.isNaN(s.number)
  );
}

export function isTVMazeScheduleItem(value: unknown): value is TVMazeScheduleItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'number' &&
    !Number.isNaN(item.id) &&
    typeof item.name === 'string' &&
    typeof item.season === 'number' &&
    !Number.isNaN(item.season) &&
    typeof item.number === 'number' &&
    !Number.isNaN(item.number) &&
    isTVMazeShow(item.show)
  );
}
