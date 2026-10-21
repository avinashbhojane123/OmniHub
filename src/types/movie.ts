export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string;
}

export interface Genre {
  id: number;
  name: string;
}

export interface VideoTrailer {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
}

export interface Movie {
  id: number;
  title: string;
  original_title?: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
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
  category?: 'trending' | 'now_playing' | 'popular' | 'top_rated' | 'upcoming';
  // Trakt metrics
  trakt_id?: number;
  trakt_rating?: number;
  trakt_votes?: number;
  trakt_watchers?: number;
  trakt_plays?: number;
  trakt_scrobbles?: number;
  trakt_list_count?: number;
  // TVmaze metrics & TV broadcast series fields
  is_tv?: boolean;
  tvmaze_id?: number;
  network?: string;
  schedule_time?: string;
  schedule_days?: string[];
  status?: string;
  total_seasons?: number;
  total_episodes?: number;
  tmdb_id?: number;
  thetvdb_id?: number;
  imdb_id?: string;
}


export interface TraktMovieIds {
  trakt: number;
  slug: string;
  imdb?: string;
  tmdb?: number;
}

export interface TraktMovieItem {
  watchers?: number;
  play_count?: number;
  watcher_count?: number;
  list_count?: number;
  movie: {
    title: string;
    year?: number;
    ids: TraktMovieIds;
    tagline?: string;
    overview?: string;
    released?: string;
    runtime?: number;
    rating?: number;
    votes?: number;
    genres?: string[];
  };
}

export interface TraktComment {
  id: number;
  comment: string;
  spoiler: boolean;
  review: boolean;
  created_at: string;
  likes: number;
  user_rating?: number;
  user: {
    username: string;
    name?: string;
    vip?: boolean;
    images?: {
      avatar?: {
        full?: string;
      };
    };
  };
}

export interface TraktMovieStats {
  watchers: number;
  plays: number;
  collectors: number;
  comments: number;
  lists: number;
  votes: number;
}

export interface TraktRatingDistribution {
  rating: number;
  votes: number;
  distribution: Record<string, number>;
}

export interface TraktUserProfile {
  username: string;
  name?: string;
  vip?: boolean;
  joined_at?: string;
  location?: string;
  about?: string;
  avatar?: string;
  stats?: {
    movies?: {
      plays?: number;
      watched?: number;
      minutes?: number;
      collected?: number;
      ratings?: number;
      comments?: number;
    };
  };
}

export interface TraktHistoryItem {
  id: number;
  watched_at: string;
  action: 'watch' | 'scrobble' | 'checkin';
  movie: {
    title: string;
    year?: number;
    ids: TraktMovieIds;
    rating?: number;
    overview?: string;
  };
}

export interface TraktSyncResult {
  syncedWatchlist: number;
  importedHistory: number;
  pushedToTrakt: number;
  status: 'success' | 'partial' | 'error';
  message: string;
}

export interface MovieBookmark {
  id: string;
  tmdbId: number;
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
  traktId?: number;
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
  };
  officialSite?: string;
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
  | 'trakt_social'
  | 'tv_shows'
  | 'streams'
  | 'now_playing'
  | 'top_rated'
  | 'upcoming'
  | 'watchlist';

