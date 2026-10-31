import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
  RefreshControl,
  Keyboard,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { movieService, GENRE_LIST } from '../services/movies/MovieService';
import { tvMazeService } from '../services/movies/TVMazeService';
import {
  Movie,
  MovieCategoryTab,
  MovieBookmark,
  Genre,
  WorkspaceLanguage,
  WORKSPACE_LANGUAGES,
  bookmarkToMovie,
  movieToBookmark,
  getMovieBookmarkKey,
} from '../types';
import {
  MovieCard,
  MovieDetailModal,
  TrailerModal,
  StreamPlayerModal,
  DownloadModal,
  DownloadItemState,
  STREAMING_SERVERS,
  StreamingServer,
  ActiveStreamState,
  TVEpisodeGuideModal,
} from '../components/movies';

export type { WorkspaceLanguage };
export { WORKSPACE_LANGUAGES };

export { STREAMING_SERVERS };
export type { StreamingServer, ActiveStreamState, DownloadItemState };


export const MovieWorkspaceScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width: windowWidth } = useWindowDimensions();

  // Responsive grid item width (subtracts horizontal padding 24 and margin for all columns)
  const cardMargin = 6;
  const numColumns = windowWidth > 600 ? 3 : 2;
  const cardWidth = Math.floor(
    (windowWidth - 24 - numColumns * (cardMargin * 2)) / numColumns,
  );

  // Navigation & Category States
  const [activeTab, setActiveTab] = useState<MovieCategoryTab>('trending');
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [watchlist, setWatchlist] = useState<MovieBookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Pagination & Refresh States
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // Modals state
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [activeTrailerKey, setActiveTrailerKey] = useState<string | null>(null);
  const [isTrailerModalOpen, setIsTrailerModalOpen] = useState(false);
  const [activeStreamItem, setActiveStreamItem] = useState<ActiveStreamState | null>(null);
  const [isStreamModalOpen, setIsStreamModalOpen] = useState(false);
  const [isPlayerBuffering, setIsPlayerBuffering] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [playerReloadKey, setPlayerReloadKey] = useState(0);

  // Download state
  const [downloadItem, setDownloadItem] = useState<DownloadItemState | null>(null);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  // TVmaze TV Series & Guide State
  const [isEpisodeGuideOpen, setIsEpisodeGuideOpen] = useState(false);
  const [selectedTvShow, setSelectedTvShow] = useState<Movie | null>(null);
  const [tvFilter, setTvFilter] = useState<'popular' | 'schedule' | 'drama' | 'scifi'>('popular');

  // Async sequence references to prevent race conditions during rapid switching (Problem 11 fix)
  const loadSeqRef = useRef<number>(0);
  const resolveSeqRef = useRef<number>(0);
  // Track failed mirrors for the current video session to avoid cyclic retries
  const failedMirrorsRef = useRef<Set<string>>(new Set());

  // Search debouncing (350ms)
  useEffect(() => {
    if (!isSearchActive || !searchQuery.trim()) {
      setDebouncedSearchQuery('');
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery, isSearchActive]);

  // Load Watchlist
  const loadWatchlist = useCallback(async () => {
    try {
      const items = await movieService.getWatchlist();
      setWatchlist(items);
    } catch {
      // Local fallback
    }
  }, []);

  // Fetch Movies / Streams according to active category or search with pagination support (Problems 5, 11, 13, 16, 17, 20)
  const loadMovies = useCallback(
    async (pageNumber = 1, isAppend = false) => {
      const seq = ++loadSeqRef.current;
      if (!isAppend) {
        setIsLoading(true);
        setLoadError(null);
      }

      try {
        // Universal search handling across all tabs (Problem 13 fix)
        if (debouncedSearchQuery.trim().length > 0) {
          const q = debouncedSearchQuery.trim().toLowerCase();

          if (activeTab === 'watchlist') {
            const allWatchlist = await movieService.getWatchlist();
            if (seq !== loadSeqRef.current) return;
            const filteredWatchlist = allWatchlist.filter(
              (w) =>
                w.title.toLowerCase().includes(q) ||
                (w.overview && w.overview.toLowerCase().includes(q)),
            );
            setWatchlist(filteredWatchlist);
            setHasMore(false);
            setIsLoading(false);
            setIsSearching(false);
            setIsRefreshing(false);
            return;
          }

          if (activeTab === 'tv_shows') {
            const results = await tvMazeService.searchShows(debouncedSearchQuery);
            if (seq !== loadSeqRef.current) return;
            let displayResults = results;
            if (selectedGenre) {
              displayResults = results.filter((m) => m.genre_ids?.includes(selectedGenre));
            }
            setMovies(displayResults);
            setHasMore(false);
            setIsLoading(false);
            setIsSearching(false);
            setIsRefreshing(false);
            return;
          }

          // Default movie search
          const results = await movieService.searchMovies(
            debouncedSearchQuery,
            selectedGenre || undefined,
            selectedLanguage !== 'all' ? selectedLanguage : undefined,
          );
          if (seq !== loadSeqRef.current) return;
          setMovies(results);
          setHasMore(false);
          setIsLoading(false);
          setIsSearching(false);
          setIsRefreshing(false);
          return;
        }

        // Standard non-search tab data loading
        if (activeTab === 'watchlist') {
          const items = await movieService.getWatchlist();
          if (seq !== loadSeqRef.current) return;
          setWatchlist(items);
          setHasMore(false);
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }

        if (activeTab === 'tv_shows') {
          let results: Movie[] = [];
          let rawShowCount = 0;
          let canPaginate = true;

          // If a language is chosen for TV series, query language-specific TV directory
          if (selectedLanguage && selectedLanguage !== 'all') {
            results = await movieService.getByLanguage(
              selectedLanguage,
              true,
              pageNumber,
              selectedGenre || undefined,
            );
            rawShowCount = results.length;
          } else if (tvFilter === 'schedule') {
            const schedule = await tvMazeService.getScheduleToday();
            results = schedule.map((item) => {
              const baseMovie = tvMazeService.showToMovie(item.show);
              const airTime = item.airtime || '21:00';
              const net = item.show.network?.name || item.show.webChannel?.name || 'Broadcasting';
              return {
                ...baseMovie,
                title: item.show.name,
                overview: `📅 Airing Today at ${airTime} on ${net} • Season ${item.season}, Episode ${item.number}: "${item.name}". ${baseMovie.overview}`,
              };
            });
            rawShowCount = results.length;
            canPaginate = false;
          } else if (tvFilter === 'drama') {
            const shows = await tvMazeService.getPopularShows(pageNumber - 1, selectedLanguage);
            rawShowCount = shows.length;
            results = shows.filter((s) =>
              s.genres?.some((g) => g.name.toLowerCase().includes('drama')),
            );
          } else if (tvFilter === 'scifi') {
            const shows = await tvMazeService.getPopularShows(pageNumber - 1, selectedLanguage);
            rawShowCount = shows.length;
            results = shows.filter((s) =>
              s.genres?.some(
                (g) =>
                  g.name.toLowerCase().includes('sci-fi') ||
                  g.name.toLowerCase().includes('fantasy') ||
                  g.name.toLowerCase().includes('action'),
              ),
            );
          } else {
            results = await tvMazeService.getPopularShows(pageNumber - 1, selectedLanguage);
            rawShowCount = results.length;
          }

          if (seq !== loadSeqRef.current) return;

          const hasMoreRaw = canPaginate && rawShowCount >= 20;
          let displayResults = results;
          if (selectedGenre && (!selectedLanguage || selectedLanguage === 'all')) {
            displayResults = results.filter((m) => m.genre_ids?.includes(selectedGenre));
          }

          setHasMore(hasMoreRaw);

          if (isAppend) {
            setMovies((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              return [...prev, ...displayResults.filter((m) => !existingIds.has(m.id))];
            });
          } else {
            setMovies(displayResults);
          }
          setIsLoading(false);
          setIsRefreshing(false);
          setIsLoadingMore(false);
          return;
        }

        // Standard TMDb tabs or Language-Filtered Discovery
        let rawResults: Movie[] = [];
        if (selectedLanguage && selectedLanguage !== 'all') {
          rawResults = await movieService.getByLanguage(
            selectedLanguage,
            false,
            pageNumber,
            selectedGenre || undefined,
          );
        } else if (activeTab === 'trending') {
          rawResults = await movieService.getTrending(pageNumber);
        }

        if (seq !== loadSeqRef.current) return;

        // Full TMDb page size is 20
        const hasMoreRaw = rawResults.length >= 20;
        let displayResults = rawResults;
        if (selectedGenre && (!selectedLanguage || selectedLanguage === 'all')) {
          displayResults = rawResults.filter((m) => m.genre_ids?.includes(selectedGenre));
        }

        setHasMore(hasMoreRaw);

        if (isAppend) {
          setMovies((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            return [...prev, ...displayResults.filter((m) => !existingIds.has(m.id))];
          });
        } else {
          setMovies(displayResults);
        }
      } catch (e: any) {
        if (seq === loadSeqRef.current && !isAppend) {
          setLoadError(e?.message || 'Could not load movies from network');
        }
      } finally {
        if (seq === loadSeqRef.current) {
          setIsLoading(false);
          setIsSearching(false);
          setIsRefreshing(false);
          setIsLoadingMore(false);
        }
      }
    },
    [activeTab, debouncedSearchQuery, selectedGenre, tvFilter, selectedLanguage],
  );

  // Initial load when tab or filter changes
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    loadMovies(1, false);
  }, [loadMovies]);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  // Pull to refresh handler
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setPage(1);
    setHasMore(true);
    loadMovies(1, false);
    loadWatchlist();
  }, [loadMovies, loadWatchlist]);

  // Infinite scroll load more handler
  const handleLoadMore = useCallback(() => {
    if (
      isLoading ||
      isLoadingMore ||
      isRefreshing ||
      !hasMore ||
      activeTab === 'watchlist' ||
      debouncedSearchQuery.length > 0
    ) {
      return;
    }
    const nextPage = page + 1;
    setIsLoadingMore(true);
    setPage(nextPage);
    loadMovies(nextPage, true);
  }, [
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasMore,
    activeTab,
    debouncedSearchQuery,
    page,
    loadMovies,
  ]);

  // Problem 21 fix: O(1) Set lookup for watchlist
  // Composite key map for O(1) bookmark lookup differentiating Movies and TV Shows
  const bookmarkedKeySet = useMemo(
    () => new Set(watchlist.map((item) => getMovieBookmarkKey(item.tmdbId, item.isTv))),
    [watchlist],
  );

  const isInWatchlist = useCallback(
    (movieId: number, isTv = false) =>
      bookmarkedKeySet.has(getMovieBookmarkKey(movieId, isTv)),
    [bookmarkedKeySet],
  );

  // Toggle watchlist with optimistic state & rollback on error (Problem 2 fix: preserve isTv)
  const handleToggleWatchlist = useCallback(
    async (movie: Movie) => {
      const isBookmarked = isInWatchlist(movie.id, Boolean(movie.is_tv));

      if (isBookmarked) {
        setWatchlist((prev) =>
          prev.filter(
            (item) =>
              !(item.tmdbId === movie.id && Boolean(item.isTv) === Boolean(movie.is_tv)),
          ),
        );
        try {
          await movieService.removeFromWatchlist(movie.id, Boolean(movie.is_tv));
        } catch {
          loadWatchlist();
          Alert.alert('Error', 'Failed to remove from watchlist');
        }
      } else {
        const newBookmark: MovieBookmark = movieToBookmark(movie);
        setWatchlist((prev) => [newBookmark, ...prev]);
        try {
          await movieService.addToWatchlist(movie);
        } catch {
          loadWatchlist();
          Alert.alert('Error', 'Failed to save to watchlist');
        }
      }
    },
    [isInWatchlist, loadWatchlist],
  );

  // Toggle watched state with optimistic state & functional rollback on error (Problem 14 fix)
  const handleToggleWatched = useCallback(
    async (tmdbId: number, isTv?: boolean) => {
      setWatchlist((prev) =>
        prev.map((item) =>
          item.tmdbId === tmdbId && (isTv === undefined || Boolean(item.isTv) === Boolean(isTv))
            ? { ...item, isWatched: !item.isWatched }
            : item,
        ),
      );
      try {
        const nextWatched = await movieService.toggleWatched(tmdbId, isTv);
        setWatchlist((prev) =>
          prev.map((item) =>
            item.tmdbId === tmdbId && (isTv === undefined || Boolean(item.isTv) === Boolean(isTv))
              ? { ...item, isWatched: nextWatched }
              : item,
          ),
        );
      } catch {
        setWatchlist((prev) =>
          prev.map((item) =>
            item.tmdbId === tmdbId && (isTv === undefined || Boolean(item.isTv) === Boolean(isTv))
              ? { ...item, isWatched: !item.isWatched }
              : item,
          ),
        );
        Alert.alert('Error', 'Failed to update watched status');
      }
    },
    [],
  );

  // Launch trailer modal
  const handlePlayTrailer = useCallback((trailerKey?: string) => {
    if (!trailerKey) {
      Alert.alert(
        'Trailer Unavailable',
        'Official trailer preview is not available for this title right now.',
      );
      return;
    }
    setActiveTrailerKey(trailerKey);
    setIsTrailerModalOpen(true);
  }, []);

  // Unified stream resolution helper (Problems 1, 3, 22)
  const resolveAndPlayStream = useCallback(
    async (options: {
      movie: Movie | { id: number; title: string; is_tv?: boolean; tmdb_id?: number };
      isTv?: boolean;
      season?: number;
      episode?: number;
      episodeTitle?: string;
      preferredServer?: StreamingServer['id'];
    }) => {
      const { movie, isTv = false, season = 1, episode = 1, episodeTitle, preferredServer } = options;
      // Dynamically resolve TMDb ID if TV show has no tmdb_id yet
      const imdbId = (movie as any).imdb_id || (movie as any).externals?.imdb;
      let resolvedTmdbId = (movie as Movie).tmdb_id;
      if (!resolvedTmdbId && isTv) {
        resolvedTmdbId = await tvMazeService.ensureTmdbId(movie.id, movie.title, imdbId);
      }
      // Prefer resolved numeric TMDb ID, then string IMDb ID (e.g. tt0944947), and finally movie.id
      const finalMediaId: number | string = resolvedTmdbId || imdbId || movie.id;

      const displayTitle = episodeTitle
        ? `${movie.title} - S${season}:E${episode} "${episodeTitle}"`
        : isTv
          ? `${movie.title} - S${season}:E${episode}`
          : movie.title;

      const serverToUse = preferredServer || 'vidsrc_sh';
      const seq = ++resolveSeqRef.current;

      setStreamError(null);
      setIsPlayerBuffering(false);
      setIsStreamModalOpen(true);
      failedMirrorsRef.current.clear();

      setActiveStreamItem({
        title: displayTitle,
        tmdbId: finalMediaId,
        imdbId,
        isTv,
        season,
        episode,
        serverId: serverToUse,
        quality: '1080p Ultra',
        directUrl: undefined,
        isHls: false,
        totalSeasons: (movie as any).total_seasons || (movie as any).seasons?.length,
        episodesInSeason: (movie as any).total_episodes,
      });

      if (serverToUse === 'direct_hls') {
        try {
          const numericTmdbId = typeof finalMediaId === 'number' ? finalMediaId : Number(finalMediaId) || 0;
          if (numericTmdbId > 0) {
            const directPromise = movieService.resolveDirectStream(numericTmdbId, isTv, season, episode);
            const timeoutPromise = new Promise<{ isTimeout: boolean }>((resolve) =>
              setTimeout(() => resolve({ isTimeout: true }), 3500),
            );

            const result: any = await Promise.race([directPromise, timeoutPromise]);
            if (seq !== resolveSeqRef.current) return;

            if (result && !result.isTimeout && result.url) {
              setActiveStreamItem((prev) =>
                prev
                  ? {
                      ...prev,
                      serverId: 'direct_hls',
                      directUrl: result.url,
                      quality: result.quality,
                      headers: result.headers,
                      isHls: true,
                    }
                  : null,
              );
              setIsPlayerBuffering(false);
              return;
            }
          }
        } catch {}

        if (seq !== resolveSeqRef.current) return;
        failedMirrorsRef.current.add('direct_hls');

        // Instant Auto-Failover to VidSrc Live mirror without long spinner wait
        setActiveStreamItem((prev) =>
          prev
            ? {
                ...prev,
                serverId: 'vidsrc_sh',
                quality: '1080p Ultra',
                isHls: false,
                directUrl: undefined,
              }
            : null,
        );
      }

      setIsPlayerBuffering(false);
    },
    [],
  );

  // Launch Instant Universal Stream for any TMDb Movie or TV Show
  const handleStreamMovie = useCallback(
    (movie: Movie, isTv = false) => {
      resolveAndPlayStream({
        movie,
        isTv: isTv || Boolean(movie.is_tv),
        season: 1,
        episode: 1,
      });
    },
    [resolveAndPlayStream],
  );

  // Select server mirror manually
  const handleSelectServer = useCallback(
    async (server: StreamingServer) => {
      if (!activeStreamItem) return;
      setStreamError(null);
      setIsPlayerBuffering(true);

      if (server.id === 'direct_hls' && activeStreamItem.tmdbId) {
        setActiveStreamItem((prev) =>
          prev ? { ...prev, serverId: 'direct_hls', directUrl: undefined } : null,
        );
        const seq = ++resolveSeqRef.current;
        const numericId = typeof activeStreamItem.tmdbId === 'number'
          ? activeStreamItem.tmdbId
          : Number(activeStreamItem.tmdbId) || 0;

        let direct: any = null;
        if (numericId > 0) {
          try {
            const directPromise = movieService.resolveDirectStream(
              numericId,
              activeStreamItem.isTv,
              activeStreamItem.season,
              activeStreamItem.episode,
            );
            const timeoutPromise = new Promise<{ isTimeout: boolean }>((resolve) =>
              setTimeout(() => resolve({ isTimeout: true }), 3500),
            );
            direct = await Promise.race([directPromise, timeoutPromise]);
          } catch {}
        }
        if (seq !== resolveSeqRef.current) return;

        if (direct && !direct.isTimeout && direct.url) {
          setActiveStreamItem((prev) =>
            prev ? { ...prev, directUrl: direct.url, quality: direct.quality, headers: direct.headers, isHls: true } : null,
          );
          setIsPlayerBuffering(false);
          return;
        } else {
          failedMirrorsRef.current.add('direct_hls');
          setActiveStreamItem((prev) =>
            prev ? { ...prev, serverId: 'vidsrc_sh', quality: '1080p Ultra', isHls: false } : null,
          );
          setIsPlayerBuffering(false);
          return;
        }
      }

      setActiveStreamItem((prev) =>
        prev ? { ...prev, serverId: server.id, directUrl: undefined, isHls: false } : null,
      );
      setIsPlayerBuffering(false);
    },
    [activeStreamItem],
  );

  // Select season for TV series with race condition guard
  const handleSelectSeason = useCallback(
    async (s: number) => {
      if (!activeStreamItem || !activeStreamItem.tmdbId) return;
      setIsPlayerBuffering(true);
      setActiveStreamItem((prev) =>
        prev ? { ...prev, season: s, episode: 1, directUrl: undefined } : null,
      );

      const seq = ++resolveSeqRef.current;
      const numericId = typeof activeStreamItem.tmdbId === 'number'
        ? activeStreamItem.tmdbId
        : Number(activeStreamItem.tmdbId) || 0;

      if (activeStreamItem.serverId === 'direct_hls' && numericId > 0) {
        try {
          const directPromise = movieService.resolveDirectStream(numericId, true, s, 1);
          const timeoutPromise = new Promise<{ isTimeout: boolean }>((resolve) =>
            setTimeout(() => resolve({ isTimeout: true }), 3500),
          );
          const direct: any = await Promise.race([directPromise, timeoutPromise]);
          if (seq !== resolveSeqRef.current) return;

          if (direct && !direct.isTimeout && direct.url) {
            setActiveStreamItem((prev) =>
              prev ? { ...prev, directUrl: direct.url, quality: direct.quality, headers: direct.headers, isHls: true } : null,
            );
          } else {
            setActiveStreamItem((prev) =>
              prev ? { ...prev, serverId: 'vidsrc_sh', quality: '1080p Ultra', isHls: false } : null,
            );
          }
        } catch {
          if (seq !== resolveSeqRef.current) return;
          setActiveStreamItem((prev) =>
            prev ? { ...prev, serverId: 'vidsrc_sh', quality: '1080p Ultra', isHls: false } : null,
          );
        }
      }
      setIsPlayerBuffering(false);
    },
    [activeStreamItem],
  );

  // Select episode for TV series with race condition guard
  const handleSelectEpisode = useCallback(
    async (e: number) => {
      if (!activeStreamItem || !activeStreamItem.tmdbId) return;
      setIsPlayerBuffering(true);
      setActiveStreamItem((prev) => (prev ? { ...prev, episode: e, directUrl: undefined } : null));

      const seq = ++resolveSeqRef.current;
      const numericId = typeof activeStreamItem.tmdbId === 'number'
        ? activeStreamItem.tmdbId
        : Number(activeStreamItem.tmdbId) || 0;

      if (activeStreamItem.serverId === 'direct_hls' && numericId > 0) {
        try {
          const directPromise = movieService.resolveDirectStream(
            numericId,
            true,
            activeStreamItem.season,
            e,
          );
          const timeoutPromise = new Promise<{ isTimeout: boolean }>((resolve) =>
            setTimeout(() => resolve({ isTimeout: true }), 3500),
          );
          const direct: any = await Promise.race([directPromise, timeoutPromise]);
          if (seq !== resolveSeqRef.current) return;

          if (direct && !direct.isTimeout && direct.url) {
            setActiveStreamItem((prev) =>
              prev ? { ...prev, directUrl: direct.url, quality: direct.quality, headers: direct.headers, isHls: true } : null,
            );
          } else {
            setActiveStreamItem((prev) =>
              prev ? { ...prev, serverId: 'vidsrc_sh', quality: '1080p Ultra', isHls: false } : null,
            );
          }
        } catch {
          if (seq !== resolveSeqRef.current) return;
          setActiveStreamItem((prev) =>
            prev ? { ...prev, serverId: 'vidsrc_sh', quality: '1080p Ultra', isHls: false } : null,
          );
        }
      }
      setIsPlayerBuffering(false);
    },
    [activeStreamItem],
  );

  // Cycle to next working streaming server, skipping previously failed ones
  const handleSwitchToNextServer = useCallback(() => {
    if (!activeStreamItem) return;
    if (activeStreamItem.serverId) {
      failedMirrorsRef.current.add(activeStreamItem.serverId);
    }

    const available = STREAMING_SERVERS.filter((s) => !failedMirrorsRef.current.has(s.id));
    if (available.length > 0) {
      handleSelectServer(available[0]);
    } else {
      failedMirrorsRef.current.clear();
      const currentIndex = STREAMING_SERVERS.findIndex(
        (s) => s.id === activeStreamItem.serverId,
      );
      const nextIndex = (currentIndex + 1) % STREAMING_SERVERS.length;
      handleSelectServer(STREAMING_SERVERS[nextIndex]);
    }
  }, [activeStreamItem, handleSelectServer]);

  // Launch Download Manager for any TMDb Movie / Series (Problems 6 & 19 fix)
  const handleDownloadMovie = useCallback(
    async (movie: Movie, isTv = false, season = 1, episode = 1) => {
      const resolvedTmdbId = movie.tmdb_id || movie.id;
      const displayTitle = isTv
        ? `${movie.title} - S${season}:E${episode}`
        : movie.title;

      setDownloadItem({
        title: displayTitle,
        posterUrl: movie.poster_path,
        isResolving: true,
        movie,
        isTv,
        season,
        episode,
      });
      setIsDownloadModalOpen(true);

      try {
        const direct = await movieService.resolveDirectStream(
          resolvedTmdbId,
          isTv,
          season,
          episode,
        );
        if (direct && direct.url) {
          setDownloadItem({
            title: displayTitle,
            posterUrl: movie.poster_path,
            downloadUrl: direct.url,
            quality: direct.quality,
            isResolving: false,
            movie,
            isTv,
            season,
            episode,
          });
        } else {
          setDownloadItem({
            title: displayTitle,
            posterUrl: movie.poster_path,
            downloadUrl: undefined,
            error:
              'Direct MP4 stream file is not available on current mirrors for offline saving. Please use Instant Universal Stream to watch directly.',
            quality: 'Stream Mirror Only',
            isResolving: false,
            movie,
            isTv,
            season,
            episode,
          });
        }
      } catch (err: any) {
        setDownloadItem((prev) =>
          prev
            ? {
                ...prev,
                isResolving: false,
                error: err?.message || 'Could not resolve direct download link.',
              }
            : null,
        );
      }
    },
    [],
  );

  // Trigger download directly from active video player
  const handleDownloadFromPlayer = useCallback(
    async (item: ActiveStreamState) => {
      const displayTitle = item.isTv
        ? `${item.title} - S${item.season}:E${item.episode}`
        : item.title;

      if (item.directUrl) {
        setDownloadItem({
          title: displayTitle,
          downloadUrl: item.directUrl,
          quality: item.quality || '1080p Full HD',
          isResolving: false,
          isTv: item.isTv,
          season: item.season,
          episode: item.episode,
        });
        setIsDownloadModalOpen(true);
      } else if (item.tmdbId) {
        handleDownloadMovie(
          { id: item.tmdbId, title: item.title } as Movie,
          item.isTv,
          item.season,
          item.episode,
        );
      } else {
        const fallbackUrl = `https://vidsrc.sh/embed/${
          item.isTv
            ? `tv/${item.tmdbId || ''}/${item.season}/${item.episode}`
            : `movie/${item.tmdbId || ''}`
        }`;
        setDownloadItem({
          title: displayTitle,
          downloadUrl: fallbackUrl,
          quality: '1080p Stream',
          isResolving: false,
          isTv: item.isTv,
          season: item.season,
          episode: item.episode,
        });
        setIsDownloadModalOpen(true);
      }
    },
    [handleDownloadMovie],
  );

  // Featured spotlight movie
  const spotlightMovie = useMemo(() => {
    if (
      (activeTab === 'trending' || activeTab === 'tv_shows') &&
      !debouncedSearchQuery &&
      !searchQuery &&
      movies.length > 0
    ) {
      return movies[0];
    }
    return null;
  }, [activeTab, debouncedSearchQuery, searchQuery, movies]);

  // List of movies to render in grid
  const gridMovies = useMemo(() => {
    if (spotlightMovie) {
      return movies.slice(1);
    }
    return movies;
  }, [movies, spotlightMovie]);

  // Memoized card press
  const handleCardPress = useCallback((movie: Movie) => {
    setSelectedMovie(movie);
    setIsDetailOpen(true);
  }, []);

  // Memoized renderItem for Movie Grid
  const renderMovieItem = useCallback(
    ({ item }: { item: Movie }) => (
      <MovieCard
        movie={item}
        cardWidth={cardWidth}
        isBookmarked={isInWatchlist(item.id, Boolean(item.is_tv))}
        onPress={handleCardPress}
        onToggleWatchlist={handleToggleWatchlist}
      />
    ),
    [cardWidth, isInWatchlist, handleCardPress, handleToggleWatchlist],
  );

  // Problem 12 & modal hierarchy fix: dismiss topmost modal first and reset search queries on back
  const handleGoBack = useCallback(() => {
    if (isDownloadModalOpen) {
      setIsDownloadModalOpen(false);
      setDownloadItem(null);
      return true;
    }
    if (isTrailerModalOpen) {
      setIsTrailerModalOpen(false);
      setActiveTrailerKey(null);
      return true;
    }
    if (isStreamModalOpen || activeStreamItem) {
      setIsStreamModalOpen(false);
      setActiveStreamItem(null);
      return true;
    }
    if (isEpisodeGuideOpen) {
      setIsEpisodeGuideOpen(false);
      setSelectedTvShow(null);
      return true;
    }
    if (isDetailOpen) {
      setIsDetailOpen(false);
      return true;
    }
    if (isSearchActive) {
      setIsSearchActive(false);
      setSearchQuery('');
      setDebouncedSearchQuery('');
      return true;
    }
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
      return true;
    } else {
      navigation.navigate('WorkspaceSelect');
      return true;
    }
  }, [
    isDownloadModalOpen,
    isTrailerModalOpen,
    isStreamModalOpen,
    activeStreamItem,
    isEpisodeGuideOpen,
    isDetailOpen,
    isSearchActive,
    navigation,
  ]);

  // Problem 15 fix: stable BackHandler listener without re-subscribing on every keystroke
  const handleGoBackRef = useRef(handleGoBack);
  handleGoBackRef.current = handleGoBack;

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        return handleGoBackRef.current();
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, []),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeftRow}>
          <View style={styles.workspacePill}>
            <Text style={styles.workspaceIcon}>🎬</Text>
            <View>
              <Text style={styles.workspaceTitle}>CineVerse</Text>
              <Text style={styles.workspaceSubtitle}>Cinema & TV Stream</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>

          <TouchableOpacity
            style={[styles.headerButton, isSearchActive && styles.headerButtonActive]}
            onPress={() => {
              setIsSearchActive((prev) => !prev);
              if (isSearchActive) {
                setSearchQuery('');
                setDebouncedSearchQuery('');
              }
            }}
          >
            <Text style={styles.headerButtonText}>🔍</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.headerButton,
              activeTab === 'watchlist' && styles.headerButtonActive,
            ]}
            onPress={() => {
              setActiveTab((prev) => (prev === 'watchlist' ? 'trending' : 'watchlist'));
              setSelectedGenre(null);
            }}
          >
            <Text style={styles.headerButtonText}>❤️</Text>
            {watchlist.length > 0 && (
              <View style={styles.watchlistBadge}>
                <Text style={styles.watchlistBadgeText}>{watchlist.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input Bar (collapsible) */}
      {isSearchActive && (
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search movies, cast, genres..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
              autoFocus
            />
            {isSearching && (
              <ActivityIndicator
                size="small"
                color="#E11D48"
                style={{ marginRight: 8 }}
              />
            )}
            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={styles.clearSearchBtn}
                onPress={() => {
                  setSearchQuery('');
                  setDebouncedSearchQuery('');
                }}
              >
                <Text style={styles.clearSearchText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Transparent Genre constraint badge during search */}
          {selectedGenre !== null && (
            <View style={styles.searchFilterBadgeRow}>
              <View style={styles.searchFilterBadge}>
                <Text style={styles.searchFilterBadgeText}>
                  Filtered by:{' '}
                  {GENRE_LIST.find((g) => g.id === selectedGenre)?.name || 'Genre'}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedGenre(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.searchFilterBadgeClose}>✕ Clear Genre</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Category Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScrollContent}
        >
          {(
            [
              { id: 'trending', label: '🔥 Trending' },
              { id: 'tv_shows', label: '📺 TV & Series' },
              { id: 'watchlist', label: `❤️ Watchlist (${watchlist.length})` },
            ] as const
          ).map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.categoryTab, isSelected && styles.categoryTabActive]}
                onPress={() => {
                  setActiveTab(tab.id);
                  setSelectedGenre(null);
                }}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    isSelected && styles.categoryTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Language Filter Bar for Movies & TV Series */}
      {activeTab !== 'watchlist' && (
        <View style={styles.languageFilterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.languageFilterScroll}
          >
            {WORKSPACE_LANGUAGES.map((lang) => {
              const isSelected = selectedLanguage === lang.code;
              return (
                <TouchableOpacity
                  key={`lang-filter-${lang.code}`}
                  style={[
                    styles.langFilterPill,
                    isSelected && styles.langFilterPillActive,
                  ]}
                  onPress={() => {
                    setSelectedLanguage(lang.code);
                  }}
                >
                  <Text
                    style={[
                      styles.langFilterPillText,
                      isSelected && styles.langFilterPillTextActive,
                    ]}
                  >
                    {lang.flag} {lang.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* TVmaze Sub-Filters when in TV & Series tab */}
      {activeTab === 'tv_shows' && (
        <View style={styles.genresContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genresScrollContent}
          >
            {(
              [
                { id: 'popular', label: '🌟 Top Rated Series' },
                { id: 'schedule', label: '📅 Airing Today (TVmaze)' },
                { id: 'drama', label: '🎭 Drama & Thriller' },
                { id: 'scifi', label: '🚀 Sci-Fi & Fantasy' },
              ] as const
            ).map((sub) => {
              const isSelected = tvFilter === sub.id;
              return (
                <TouchableOpacity
                  key={sub.id}
                  style={[
                    styles.tvSubChip,
                    isSelected && styles.tvSubChipActive,
                  ]}
                  onPress={() => setTvFilter(sub.id)}
                >
                  <Text
                    style={[
                      styles.tvSubChipText,
                      isSelected && styles.tvSubChipTextActive,
                    ]}
                  >
                    {sub.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Genre Chips */}
      {activeTab !== 'watchlist' && (
          <View style={styles.genresContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.genresScrollContent}
            >
              <TouchableOpacity
                style={[
                  styles.genreChip,
                  selectedGenre === null && styles.genreChipActive,
                ]}
                onPress={() => setSelectedGenre(null)}
              >
                <Text
                  style={[
                    styles.genreChipText,
                    selectedGenre === null && styles.genreChipTextActive,
                  ]}
                >
                  All Genres
                </Text>
              </TouchableOpacity>

              {GENRE_LIST.map((genre: Genre) => {
                const isSelected = selectedGenre === genre.id;
                return (
                  <TouchableOpacity
                    key={genre.id}
                    style={[styles.genreChip, isSelected && styles.genreChipActive]}
                    onPress={() => setSelectedGenre(isSelected ? null : genre.id)}
                  >
                    <Text
                      style={[
                        styles.genreChipText,
                        isSelected && styles.genreChipTextActive,
                      ]}
                    >
                      {genre.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}


      {/* Main Content Area */}
      {loadError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Connection Notice</Text>
          <Text style={styles.errorSubtitle}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
            <Text style={styles.retryBtnText}>🔄 Retry Connection</Text>
          </TouchableOpacity>
        </View>
      ) : isLoading && movies.length === 0 && !isRefreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E11D48" />
          <Text style={styles.loadingText}>Connecting to Cinema Streamer...</Text>
        </View>
      ) : activeTab === 'watchlist' ? (
        <FlatList
          data={watchlist}
          keyExtractor={(item, index) => `${item.tmdbId}-${index}`}
          contentContainerStyle={[
            styles.listContainer,
            { paddingBottom: insets.bottom + 40 },
          ]}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#E11D48"
              colors={['#E11D48']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🍿</Text>
              <Text style={styles.emptyTitle}>Your Watchlist is Empty</Text>
              <Text style={styles.emptySubtitle}>
                Tap the heart on any movie to bookmark it here for later.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.watchlistRow}
              activeOpacity={0.88}
              onPress={() => {
                setSelectedMovie(bookmarkToMovie(item));
                setIsDetailOpen(true);
              }}
            >
              {item.posterPath ? (
                <Image
                  source={{ uri: item.posterPath }}
                  style={styles.watchlistPoster}
                />
              ) : (
                <View style={[styles.watchlistPoster, styles.fallbackWatchlistPoster]}>
                  <Text style={styles.fallbackWatchlistPosterIcon}>
                    {item.isTv ? '📺' : '🎬'}
                  </Text>
                </View>
              )}
              <View style={styles.watchlistInfo}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.watchlistTitle, { flex: 1 }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {Boolean(item.isTv) && (
                      <View style={styles.watchlistTvBadge}>
                        <Text style={styles.watchlistTvBadgeText}>TV</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.watchlistMetaRow}>
                    <Text style={styles.ratingText}>★ {item.voteAverage}</Text>
                    <Text style={styles.watchlistYear}>
                      {item.releaseDate ? item.releaseDate.slice(0, 4) : ''}
                    </Text>
                    {item.genres && item.genres[0] && (
                      <Text style={styles.watchlistGenre}>{item.genres[0]}</Text>
                    )}
                  </View>
                  <Text style={styles.watchlistOverview} numberOfLines={2}>
                    {item.overview}
                  </Text>
                </View>

                <View style={styles.watchlistActionRow}>
                  <TouchableOpacity
                    style={styles.watchlistStreamBtn}
                    onPress={() =>
                      handleStreamMovie(
                        {
                          id: item.tmdbId,
                          title: item.title,
                          overview: item.overview || '',
                          poster_path: item.posterPath || '',
                          backdrop_path: item.backdropPath || '',
                          vote_average: item.voteAverage,
                          release_date: item.releaseDate || '',
                          genre_ids: [],
                          is_tv: Boolean(item.isTv),
                        },
                        Boolean(item.isTv),
                      )
                    }
                  >
                    <Text style={styles.watchlistStreamBtnText}>
                      {item.isTv ? '▶ Stream TV' : '▶ Stream'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.watchedBtn, item.isWatched && styles.watchedBtnActive]}
                    onPress={() => handleToggleWatched(item.tmdbId, item.isTv)}
                  >
                    <Text
                      style={[
                        styles.watchedBtnText,
                        item.isWatched && styles.watchedBtnTextActive,
                      ]}
                    >
                      {item.isWatched ? '✓ Watched' : 'Mark Watched'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() =>
                      handleToggleWatchlist({
                        id: item.tmdbId,
                        title: item.title,
                        overview: item.overview || '',
                        poster_path: item.posterPath || '',
                        backdrop_path: item.backdropPath || '',
                        vote_average: item.voteAverage,
                        release_date: item.releaseDate || '',
                        genre_ids: [],
                        is_tv: Boolean(item.isTv),
                      })
                    }
                  >
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={gridMovies}
          key={numColumns}
          numColumns={numColumns}
          keyExtractor={(item, index) => `${item.id}-${item.release_date || ''}-${index}`}
          contentContainerStyle={[
            styles.listContainer,
            { paddingBottom: insets.bottom + 40 },
          ]}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#E11D48"
              colors={['#E11D48']}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#E11D48" />
                <Text style={styles.footerLoaderText}>Loading more movies...</Text>
              </View>
            ) : undefined
          }
          ListHeaderComponent={
            activeTab === 'tv_shows' || spotlightMovie ? (
              <View>
                {/* TVmaze Schedule & Series Live Banner */}
                {activeTab === 'tv_shows' && (
                  <View style={styles.tvLiveBanner}>
                    <View style={styles.tvLiveTopRow}>
                      <View style={styles.tvLiveBadge}>
                        <View style={styles.tvPulseDot} />
                        <Text style={styles.tvLiveBadgeText}>
                          TVMAZE BROADCAST & STREAM RADAR
                        </Text>
                      </View>
                      <View style={styles.tvFreeBadge}>
                        <Text style={styles.tvFreeBadgeText}>Free Open API</Text>
                      </View>
                    </View>
                    <Text style={styles.tvLiveHeadline}>
                      {tvFilter === 'schedule'
                        ? '📅 Live Broadcasts & Episodes Airing Today on Global Networks'
                        : tvFilter === 'drama'
                          ? '🎭 Premium Television Dramas with Episode Guides'
                          : tvFilter === 'scifi'
                            ? '🚀 Sci-Fi, Fantasy & Action TV Series Directory'
                            : '🌟 Popular Television Series, Air Schedules & Season Guides'}
                    </Text>
                  </View>
                )}

                {/* Spotlight Feature */}
                {spotlightMovie ? (
                  <View style={styles.spotlightWrapper}>
                    {spotlightMovie.backdrop_path || spotlightMovie.poster_path ? (
                      <Image
                        source={{
                          uri:
                            spotlightMovie.backdrop_path ||
                            spotlightMovie.poster_path,
                        }}
                        style={styles.spotlightBackdrop}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.spotlightBackdrop, styles.fallbackSpotlightBackdrop]} />
                    )}
                    <View style={styles.spotlightGradient}>
                      <View style={styles.spotlightBadge}>
                        <Text style={styles.spotlightBadgeText}>
                          {activeTab === 'tv_shows'
                            ? `📺 TVMAZE • ${spotlightMovie.network || 'SERIES'}`
                            : '🔥 TOP TRENDING'}
                        </Text>
                      </View>
                      <Text style={styles.spotlightTitle} numberOfLines={2}>
                        {spotlightMovie.title}
                      </Text>
                      <View style={styles.spotlightMeta}>
                        <Text style={styles.spotlightRating}>
                          ★ {spotlightMovie.vote_average}{' '}
                          {activeTab === 'tv_shows' ? 'TVmaze' : 'TMDb'}
                        </Text>
                        <Text style={styles.spotlightDot}>•</Text>
                        <Text style={styles.spotlightYear}>
                          {spotlightMovie.release_date?.slice(0, 4)}
                        </Text>
                        {spotlightMovie.genres && spotlightMovie.genres[0] && (
                          <>
                            <Text style={styles.spotlightDot}>•</Text>
                            <Text style={styles.spotlightGenre}>
                              {spotlightMovie.genres[0].name}
                            </Text>
                          </>
                        )}
                      </View>

                      <View style={styles.spotlightBtnRow}>
                        <TouchableOpacity
                          style={styles.playTrailerBtn}
                          onPress={() =>
                            handleStreamMovie(spotlightMovie, Boolean(spotlightMovie.is_tv))
                          }
                        >
                          <Text style={styles.playTrailerBtnText}>
                            {spotlightMovie.is_tv ? '▶ Stream S01:E01' : '▶ Instant Stream HD'}
                          </Text>
                        </TouchableOpacity>

                        {Boolean(spotlightMovie.is_tv) && (
                          <TouchableOpacity
                            style={styles.spotlightTvGuideBtn}
                            onPress={() => {
                              setSelectedTvShow(spotlightMovie);
                              setIsEpisodeGuideOpen(true);
                            }}
                          >
                            <Text style={styles.spotlightTvGuideBtnText}>
                              📺 Episodes
                            </Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[
                            styles.spotlightWatchlistBtn,
                            isInWatchlist(spotlightMovie.id, Boolean(spotlightMovie.is_tv)) &&
                            styles.spotlightWatchlistBtnActive,
                          ]}
                          onPress={() => handleToggleWatchlist(spotlightMovie)}
                        >
                          <Text style={styles.spotlightWatchlistBtnText}>
                            {isInWatchlist(spotlightMovie.id, Boolean(spotlightMovie.is_tv))
                              ? '❤️ Saved'
                              : '+ Watchlist'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.spotlightInfoBtn}
                          onPress={() => {
                            setSelectedMovie(spotlightMovie);
                            setIsDetailOpen(true);
                          }}
                        >
                          <Text style={styles.spotlightInfoBtnText}>ℹ️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : undefined
          }

          ListEmptyComponent={
            isLoading || isSearching ? (
              <View style={[styles.emptyContainer, { minHeight: 220 }]}>
                <ActivityIndicator size="large" color="#E11D48" />
                <Text style={[styles.emptySubtitle, { marginTop: 14 }]}>
                  {debouncedSearchQuery
                    ? `Searching for "${debouncedSearchQuery}"...`
                    : 'Loading movies...'}
                </Text>
              </View>

            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🎬</Text>
                <Text style={styles.emptyTitle}>No Movies Found</Text>
                <Text style={styles.emptySubtitle}>
                  Try adjusting your search query or selecting a different genre.
                </Text>
              </View>
            )
          }
          renderItem={renderMovieItem}
        />
      )}

      {/* --- MOVIE DETAIL MODAL (Lazy Loaded) --- */}
      {isDetailOpen && selectedMovie && (
        <MovieDetailModal
          visible={isDetailOpen}
          movie={selectedMovie}
          isBookmarked={isInWatchlist(selectedMovie.id, Boolean(selectedMovie.is_tv))}
          insets={insets}
          onClose={() => setIsDetailOpen(false)}
          onStream={(m) => handleStreamMovie(m, Boolean(m.is_tv))}
          onDownload={(m) => handleDownloadMovie(m, Boolean(m.is_tv))}
          onTrailer={handlePlayTrailer}
          onToggleWatchlist={handleToggleWatchlist}
          onBrowseEpisodes={(m) => {
            setIsDetailOpen(false); // Problem 18 fix: close detail modal so they don't stack
            setSelectedTvShow(m);
            setIsEpisodeGuideOpen(true);
          }}
        />
      )}

      {/* --- TVMAZE SEASONS & EPISODE GUIDE MODAL (Lazy Loaded) --- */}
      {isEpisodeGuideOpen && selectedTvShow && (
        <TVEpisodeGuideModal
          visible={isEpisodeGuideOpen}
          movie={selectedTvShow}
          insets={insets}
          onClose={() => {
            setIsEpisodeGuideOpen(false);
            setSelectedTvShow(null);
          }}
          onPlayEpisode={(movie, season, episode, title) => {
            setIsEpisodeGuideOpen(false);
            resolveAndPlayStream({
              movie,
              isTv: true,
              season,
              episode,
              episodeTitle: title,
            });
          }}
          onDownloadEpisode={(movie, season, episode, _title) => {
            setIsEpisodeGuideOpen(false);
            handleDownloadMovie(movie, true, season, episode);
          }}
        />
      )}

      {/* --- INSTANT UNIVERSAL FULLSCREEN VIDEO STREAMER MODAL (Lazy Loaded) --- */}
      {isStreamModalOpen && activeStreamItem && (
        <StreamPlayerModal
          visible={isStreamModalOpen}
          streamItem={activeStreamItem}
          insets={insets}
          isBuffering={isPlayerBuffering}
          streamError={streamError}
          playerReloadKey={playerReloadKey}
          isBookmarked={
            activeStreamItem.tmdbId
              ? isInWatchlist(Number(activeStreamItem.tmdbId), activeStreamItem.isTv)
              : false
          }
          onToggleBookmark={() => {
            if (activeStreamItem.tmdbId) {
              handleToggleWatchlist({
                id: activeStreamItem.tmdbId,
                title: activeStreamItem.title,
                is_tv: activeStreamItem.isTv,
                overview: '',
                poster_path: '',
                backdrop_path: '',
                vote_average: 0,
                release_date: '',
                genre_ids: [],
              } as Movie);
            }
          }}
          onClose={() => {
            setIsStreamModalOpen(false);
            setActiveStreamItem(null);
          }}
          onReload={() => {
            setPlayerReloadKey((k) => k + 1);
            setIsPlayerBuffering(true);
          }}
          onDownload={handleDownloadFromPlayer}
          onSelectServer={handleSelectServer}
          onSelectSeason={handleSelectSeason}
          onSelectEpisode={handleSelectEpisode}
          onSwitchNextServer={handleSwitchToNextServer}
          onLoadStart={() => {
            setIsPlayerBuffering(true);
            setStreamError(null);
          }}
          onLoadEnd={() => setIsPlayerBuffering(false)}
          onError={(err) => {
            setIsPlayerBuffering(false);
            setStreamError(err);
          }}
        />
      )}

      {/* --- YOUTUBE TRAILER MODAL (Lazy Loaded) --- */}
      {isTrailerModalOpen && Boolean(activeTrailerKey) && (
        <TrailerModal
          visible={isTrailerModalOpen}
          trailerKey={activeTrailerKey || undefined}
          onClose={() => {
            setIsTrailerModalOpen(false);
            setActiveTrailerKey(null);
          }}
        />
      )}

      {/* --- DIRECT MOVIE & SERIES DOWNLOAD MODAL (Lazy Loaded) --- */}
      {isDownloadModalOpen && (
        <DownloadModal
          visible={isDownloadModalOpen}
          item={downloadItem}
          insets={insets}
          onClose={() => {
            setIsDownloadModalOpen(false);
            setDownloadItem(null);
          }}
          onRetry={() => {
            if (downloadItem?.movie) {
              handleDownloadMovie(
                downloadItem.movie,
                Boolean(downloadItem.isTv),
                downloadItem.season || 1,
                downloadItem.episode || 1,
              );
            } else if (selectedMovie) {
              handleDownloadMovie(selectedMovie);
            }
          }}
        />
      )}

    </View>

  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090B10',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1E29',
  },
  headerLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#161B26',
    borderWidth: 1,
    borderColor: '#262D3D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '400',
    lineHeight: 26,
    marginLeft: -2,
  },
  workspacePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B26',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  workspaceIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  workspaceTitle: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  workspaceSubtitle: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#161B26',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  headerButtonActive: {
    backgroundColor: '#E11D48',
    borderColor: '#E11D48',
  },
  headerButtonText: {
    fontSize: 16,
  },
  watchlistBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#E11D48',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#090B10',
  },
  watchlistBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  searchSection: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B26',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: '#FFFFFF',
    fontSize: 14,
  },
  clearSearchBtn: {
    padding: 6,
  },
  clearSearchText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  searchFilterBadgeRow: {
    marginTop: 6,
    flexDirection: 'row',
  },
  searchFilterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.4)',
  },
  searchFilterBadgeText: {
    color: '#FB7185',
    fontSize: 11,
    fontWeight: '600',
  },
  searchFilterBadgeClose: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  tabsContainer: {
    marginTop: 10,
    marginBottom: 4,
  },
  tabsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#161B26',
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  categoryTabActive: {
    backgroundColor: '#E11D48',
    borderColor: '#E11D48',
  },
  categoryTabText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  categoryTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  genresContainer: {
    marginVertical: 6,
  },
  genresScrollContent: {
    paddingHorizontal: 16,
    gap: 6,
  },
  genreChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#11141D',
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  genreChipActive: {
    backgroundColor: '#262D3D',
    borderColor: '#E11D48',
  },
  genreChipText: {
    color: '#6B7280',
    fontSize: 12,
  },
  genreChipTextActive: {
    color: '#F43F5E',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#9CA3AF',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  listContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  spotlightWrapper: {
    height: 230,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#161B26',
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  spotlightBackdrop: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  fallbackSpotlightBackdrop: {
    backgroundColor: '#161B26',
  },
  spotlightGradient: {
    flex: 1,
    backgroundColor: 'rgba(9, 11, 16, 0.72)',
    padding: 16,
    justifyContent: 'flex-end',
  },
  spotlightBadge: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  spotlightBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  spotlightTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  spotlightMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  spotlightRating: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '700',
  },
  spotlightDot: {
    color: '#6B7280',
    marginHorizontal: 6,
  },
  spotlightYear: {
    color: '#D1D5DB',
    fontSize: 13,
  },
  spotlightGenre: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  spotlightBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playTrailerBtn: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  playTrailerBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  spotlightWatchlistBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  spotlightWatchlistBtnActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  spotlightWatchlistBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  spotlightInfoBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotlightInfoBtnText: {
    fontSize: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLoader: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  footerLoaderText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  watchlistRow: {
    flexDirection: 'row',
    backgroundColor: '#121620',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  watchlistPoster: {
    width: 90,
    height: 135,
    backgroundColor: '#1A1E29',
  },
  fallbackWatchlistPoster: {
    backgroundColor: '#161B26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackWatchlistPosterIcon: {
    fontSize: 28,
  },
  watchlistInfo: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  watchlistTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  watchlistTvBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  watchlistTvBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  watchlistMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  ratingText: {
    color: '#FBBF24',
    fontWeight: '700',
    fontSize: 12,
  },
  watchlistYear: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  watchlistGenre: {
    color: '#E11D48',
    fontSize: 12,
    fontWeight: '600',
  },
  watchlistOverview: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 16,
  },
  watchlistActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  watchlistStreamBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#E11D48',
  },
  watchlistStreamBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  watchedBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#1E2433',
  },
  watchedBtnActive: {
    backgroundColor: '#10B981',
  },
  watchedBtnText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  watchedBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  removeBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
  },
  // --- TVmaze Sub-Filter Chips ---
  tvSubChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#11141D',
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  tvSubChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3B82F6',
  },
  tvSubChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '500',
  },
  tvSubChipTextActive: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  // --- TVmaze Live Radar Banner ---
  tvLiveBanner: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 10,
    backgroundColor: '#0E1526',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1D2A47',
  },
  tvLiveTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tvLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#3B82F6',
    gap: 6,
  },
  tvPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#3B82F6',
  },
  tvLiveBadgeText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tvFreeBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tvFreeBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  tvLiveHeadline: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  spotlightTvGuideBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightTvGuideBtnText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
  },
  languageFilterContainer: {
    paddingVertical: 6,
    backgroundColor: '#090B10',
    borderBottomWidth: 1,
    borderBottomColor: '#161B26',
  },
  languageFilterScroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  langFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#121620',
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  langFilterPillActive: {
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    borderColor: '#E11D48',
  },
  langFilterPillText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
  },
  langFilterPillTextActive: {
    color: '#F43F5E',
    fontWeight: '800',
  },
});

