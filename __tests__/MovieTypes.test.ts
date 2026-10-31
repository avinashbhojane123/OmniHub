import {
  ALL_GENRES,
  WORKSPACE_LANGUAGES,
  MOVIE_CATEGORY_TABS,
  CastMember,
  Genre,
  VideoTrailer,
  Movie,
  MovieBookmark,
  StreamableMedia,
  TVMazeShow,
  TVMazeEpisode,
  StreamingServer,
  StreamEpisode,
  TVMazeSeason,
  TVMazeScheduleItem,
  getGenreNameById,
  getGenreIdByName,
  getGenresByIds,
  getTmdbImageUrl,
  formatMovieDuration,
  formatMovieReleaseYear,
  formatMovieRating,
  getTrailerEmbedUrl,
  stripHtml,
  createEmptyMovie,
  getMovieBookmarkKey,
  movieToBookmark,
  bookmarkToMovie,
  tvMazeShowToMovie,
  sortMovies,
  filterMoviesByGenre,
  filterMoviesByLanguage,
  searchMoviesInMemory,
  isCastMember,
  isGenre,
  isMovie,
  isMovieBookmark,
  isStreamableMedia,
  isTVMazeShow,
  isTVMazeEpisode,
  isVideoTrailer,
  isStreamingServer,
  isStreamEpisode,
  isTVMazeSeason,
  isTVMazeScheduleItem,
} from '../src/types/movie';

describe('Movie Types & CineVerse Domain Utilities', () => {
  describe('Constants & Genre Resolvers', () => {
    it('ALL_GENRES should contain standard TMDB movie and TV genres', () => {
      expect(ALL_GENRES.length).toBeGreaterThanOrEqual(27);
      expect(ALL_GENRES.some((g) => g.id === 28 && g.name === 'Action')).toBe(true);
      expect(ALL_GENRES.some((g) => g.id === 878 && g.name === 'Sci-Fi')).toBe(true);
      expect(ALL_GENRES.some((g) => g.id === 10759 && g.name === 'Action & Adventure')).toBe(true);
      expect(ALL_GENRES.some((g) => g.id === 10765 && g.name === 'Sci-Fi & Fantasy')).toBe(true);
    });

    it('getGenreNameById should return matching name or "Unknown"', () => {
      expect(getGenreNameById(28)).toBe('Action');
      expect(getGenreNameById(35)).toBe('Comedy');
      expect(getGenreNameById(10759)).toBe('Action & Adventure');
      expect(getGenreNameById(99999)).toBe('Unknown');
    });

    it('getGenreIdByName should resolve genre ID case-insensitively and handle aliases', () => {
      expect(getGenreIdByName('action')).toBe(28);
      expect(getGenreIdByName('SCI-FI')).toBe(878);
      expect(getGenreIdByName('science fiction')).toBe(878);
      expect(getGenreIdByName('action & adventure')).toBe(10759);
      expect(getGenreIdByName('action and adventure')).toBe(10759);
      expect(getGenreIdByName('nonexistent')).toBeUndefined();
      expect(getGenreIdByName('')).toBeUndefined();
    });

    it('getGenresByIds should filter and return valid Genre objects', () => {
      const genres = getGenresByIds([28, 878, 99999]);
      expect(genres.length).toBe(2);
      expect(genres.map((g) => g.name)).toEqual(['Action', 'Sci-Fi']);
      expect(getGenresByIds(null as any)).toEqual([]);
    });

    it('WORKSPACE_LANGUAGES should define major global and regional languages', () => {
      expect(WORKSPACE_LANGUAGES.some((l) => l.code === 'all')).toBe(true);
      expect(WORKSPACE_LANGUAGES.some((l) => l.code === 'hi' && l.name === 'Hindi')).toBe(true);
      expect(WORKSPACE_LANGUAGES.some((l) => l.code === 'en' && l.name === 'English')).toBe(true);
      expect(WORKSPACE_LANGUAGES.some((l) => l.code === 'ko')).toBe(true);
    });

    it('MOVIE_CATEGORY_TABS should define tabs', () => {
      expect(MOVIE_CATEGORY_TABS).toContain('trending');
      expect(MOVIE_CATEGORY_TABS).toContain('tv_shows');
      expect(MOVIE_CATEGORY_TABS).toContain('watchlist');
    });
  });

  describe('Formatters & String Utilities', () => {
    it('getTmdbImageUrl should construct proper CDN paths or return direct URLs', () => {
      expect(getTmdbImageUrl('/poster.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
      expect(getTmdbImageUrl('poster.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/poster.jpg');
      expect(getTmdbImageUrl('https://external.cdn/image.png')).toBe('https://external.cdn/image.png');
      expect(getTmdbImageUrl('//cdn.tmdb.org/img.png')).toBe('https://cdn.tmdb.org/img.png');
      expect(getTmdbImageUrl(null)).toBeNull();
      expect(getTmdbImageUrl('')).toBeNull();
    });

    it('formatMovieDuration should convert minutes to human readable string', () => {
      expect(formatMovieDuration(142)).toBe('2h 22m');
      expect(formatMovieDuration(141.8)).toBe('2h 22m');
      expect(formatMovieDuration('142')).toBe('2h 22m');
      expect(formatMovieDuration(60)).toBe('1h');
      expect(formatMovieDuration(45)).toBe('45m');
      expect(formatMovieDuration(0)).toBe('N/A');
      expect(formatMovieDuration(-10)).toBe('N/A');
      expect(formatMovieDuration(undefined)).toBe('N/A');
      expect(formatMovieDuration(NaN)).toBe('N/A');
    });

    it('formatMovieReleaseYear should extract 4-digit year', () => {
      expect(formatMovieReleaseYear('2024-03-01')).toBe('2024');
      expect(formatMovieReleaseYear('1999-12-31')).toBe('1999');
      expect(formatMovieReleaseYear('2025')).toBe('2025');
      expect(formatMovieReleaseYear(null)).toBe('N/A');
      expect(formatMovieReleaseYear('')).toBe('N/A');
    });

    it('formatMovieRating should format voteAverage to 1 decimal place and clamp bounds', () => {
      expect(formatMovieRating(8.56)).toBe('8.6');
      expect(formatMovieRating('8.56')).toBe('8.6');
      expect(formatMovieRating(7)).toBe('7.0');
      expect(formatMovieRating(null)).toBe('0.0');
      expect(formatMovieRating(undefined)).toBe('0.0');
      expect(formatMovieRating(NaN)).toBe('0.0');
      expect(formatMovieRating(12.5)).toBe('10.0');
      expect(formatMovieRating(-3)).toBe('0.0');
    });

    it('getTrailerEmbedUrl should generate sanitized YouTube and Vimeo embed URLs', () => {
      expect(getTrailerEmbedUrl('dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&controls=1&rel=0'
      );
      expect(getTrailerEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&controls=1&rel=0'
      );
      expect(getTrailerEmbedUrl('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe(
        'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&controls=1&rel=0'
      );
      expect(getTrailerEmbedUrl('https://vimeo.com/76979871')).toBe(
        'https://player.vimeo.com/video/76979871'
      );
      const trailerObj: VideoTrailer = {
        id: '1',
        key: 'abc123xyz',
        name: 'Official Trailer',
        site: 'YouTube',
        type: 'Trailer',
      };
      expect(getTrailerEmbedUrl(trailerObj)).toBe(
        'https://www.youtube.com/embed/abc123xyz?autoplay=1&controls=1&rel=0'
      );
      expect(getTrailerEmbedUrl('')).toBe('');
      expect(getTrailerEmbedUrl(null)).toBe('');
      expect(getTrailerEmbedUrl(undefined)).toBe('');
      expect(getTrailerEmbedUrl({ key: '' } as any)).toBe('');
    });

    it('stripHtml should strip tags, script/style blocks, and decode HTML entities', () => {
      const raw = '<style>p { color: red; }</style><p>An epic <b>sci-fi</b> journey &amp; battle in space! &quot;Must see&quot; &#39;10/10&#39; &mdash; It&#8217;s here&#x21;</p><script>alert(1);</script>';
      expect(stripHtml(raw)).toBe('An epic sci-fi journey & battle in space! "Must see" \'10/10\' — It’s here!');
      expect(stripHtml(null)).toBe('');
      expect(stripHtml('Plain text')).toBe('Plain text');
    });
  });

  describe('Factory & Domain Converters (createEmptyMovie & movieToBookmark & bookmarkToMovie)', () => {
    const sampleMovie: Movie = {
      id: 693134,
      title: 'Dune: Part Two',
      overview: 'Paul Atreides unites with Chani and the Fremen.',
      poster_path: '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
      backdrop_path: '/xOMo8BRK7PfcJv9JCnx7s520b2.jpg',
      vote_average: 8.6,
      release_date: '2024-03-01',
      genre_ids: [878, 12],
      runtime: 166,
      is_tv: false,
    };

    it('createEmptyMovie should initialize valid defaults and allow partial overrides', () => {
      const empty = createEmptyMovie();
      expect(empty.id).toBe(0);
      expect(empty.title).toBe('');
      expect(empty.overview).toBe('');
      expect(empty.genre_ids).toEqual([]);
      expect(empty.is_tv).toBe(false);

      const custom = createEmptyMovie({ id: 123, title: 'Custom Movie', is_tv: true });
      expect(custom.id).toBe(123);
      expect(custom.title).toBe('Custom Movie');
      expect(custom.is_tv).toBe(true);
    });

    it('getMovieBookmarkKey should generate composite key differentiating movies and TV shows', () => {
      expect(getMovieBookmarkKey(693134, false)).toBe('693134-false');
      expect(getMovieBookmarkKey(693134, true)).toBe('693134-true');
    });

    it('movieToBookmark should create a complete MovieBookmark with sanitized properties', () => {
      const bookmark = movieToBookmark(sampleMovie, true, 'user_42');
      expect(bookmark.tmdbId).toBe(693134);
      expect(bookmark.userId).toBe('user_42');
      expect(bookmark.title).toBe('Dune: Part Two');
      expect(bookmark.voteAverage).toBe(8.6);
      expect(bookmark.isWatched).toBe(true);
      expect(bookmark.isTv).toBe(false);
      expect(bookmark.genres).toContain('Sci-Fi');
      expect(bookmark.genres).toContain('Adventure');

      // Test with empty strings converting to undefined
      const blankMovie: Movie = {
        ...sampleMovie,
        poster_path: '   ',
        backdrop_path: '',
        overview: '',
      };
      const blankBm = movieToBookmark(blankMovie);
      expect(blankBm.posterPath).toBeUndefined();
      expect(blankBm.backdropPath).toBeUndefined();
      expect(blankBm.overview).toBeUndefined();
    });

    it('bookmarkToMovie should convert MovieBookmark back into Movie structure with first_air_date support', () => {
      const bookmark: MovieBookmark = {
        id: 'bm_123',
        tmdbId: 872585,
        title: 'Oppenheimer',
        overview: 'Story of J. Robert Oppenheimer.',
        posterPath: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
        backdropPath: '/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
        voteAverage: 8.9,
        releaseDate: '2023-07-21',
        genres: ['Drama', 'History'],
        runtime: 180,
        isWatched: true,
        savedAt: '2024-01-01T00:00:00.000Z',
        isTv: false,
      };

      const movie = bookmarkToMovie(bookmark);
      expect(movie.id).toBe(872585);
      expect(movie.title).toBe('Oppenheimer');
      expect(movie.vote_average).toBe(8.9);
      expect(movie.genre_ids).toContain(18); // Drama
      expect(movie.genre_ids).toContain(36); // History
      expect(movie.genres?.map((g) => g.name)).toEqual(['Drama', 'History']);
      expect(movie.runtime).toBe(180);
      expect(movie.is_tv).toBe(false);

      // TV bookmark should populate first_air_date
      const tvBookmark: MovieBookmark = { ...bookmark, isTv: true };
      const tvMovie = bookmarkToMovie(tvBookmark);
      expect(tvMovie.is_tv).toBe(true);
      expect(tvMovie.first_air_date).toBe('2023-07-21');
    });

    it('tvMazeShowToMovie should parse TVmaze show with embedded details', () => {
      const tvMazeShow: TVMazeShow = {
        id: 169,
        name: 'Breaking Bad',
        language: 'English',
        genres: ['Drama', 'Crime', 'Thriller'],
        status: 'Ended',
        runtime: 60,
        averageRuntime: 47,
        premiered: '2008-01-20',
        rating: { average: 9.2 },
        summary: '<p>A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine.</p>',
        network: { name: 'AMC' },
        image: {
          medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/0/2400.jpg',
          original: 'https://static.tvmaze.com/uploads/images/original_untouched/0/2400.jpg',
        },
        externals: {
          imdb: 'tt0903747',
          thetvdb: 81189,
        },
        _embedded: {
          seasons: [
            { id: 1, number: 1 },
            { id: 2, number: 2 },
          ],
          episodes: [
            { id: 1, name: 'Pilot', season: 1, number: 1 },
            { id: 2, name: "Cat's in the Bag...", season: 1, number: 2 },
          ],
        },
      };

      const movie = tvMazeShowToMovie(tvMazeShow, 1396);
      expect(movie.id).toBe(169);
      expect(movie.title).toBe('Breaking Bad');
      expect(movie.is_tv).toBe(true);
      expect(movie.tmdb_id).toBe(1396);
      expect(movie.imdb_id).toBe('tt0903747');
      expect(movie.network).toBe('AMC');
      expect(movie.genre_ids).toContain(18); // Drama
      expect(movie.genre_ids).toContain(80); // Crime
      expect(movie.genre_ids).toContain(53); // Thriller
      expect(movie.vote_average).toBe(9.2);
      expect(movie.total_seasons).toBe(2);
      expect(movie.total_episodes).toBe(2);
      expect(movie.overview).not.toContain('<p>');
    });
  });

  describe('Sorting & Filtering Utilities', () => {
    const movieCatalog: Movie[] = [
      {
        id: 1,
        title: 'Alpha Movie',
        vote_average: 7.5,
        popularity: 200,
        release_date: '2023-01-01',
        genre_ids: [28], // Action
        genres: [{ id: 28, name: 'Action' }],
        original_language: 'en',
        overview: '',
        poster_path: '',
        backdrop_path: '',
      },
      {
        id: 2,
        title: 'Beta Movie',
        vote_average: 8.8,
        popularity: 500,
        release_date: '2024-05-15',
        genre_ids: [878, 28], // Sci-Fi, Action
        genres: [{ id: 878, name: 'Sci-Fi' }, { id: 28, name: 'Action' }],
        original_language: 'hi',
        overview: 'Action packed thrilling journey',
        poster_path: '',
        backdrop_path: '',
        director: 'Famous Director',
        network: 'HBO',
      },
      {
        id: 3,
        title: 'Gamma Movie',
        vote_average: 6.2,
        popularity: 100,
        release_date: '2021-11-20',
        genre_ids: [35], // Comedy
        genres: [{ id: 35, name: 'Comedy' }],
        original_language: 'es',
        overview: '',
        poster_path: '',
        backdrop_path: '',
      },
      {
        id: 4,
        title: 'Delta Undated',
        vote_average: 7.0,
        popularity: 50,
        release_date: '',
        genre_ids: [],
        overview: 'Mystery production without date',
      },
    ];

    it('sortMovies should sort by rating, release_date, title, and popularity', () => {
      const byRatingDesc = sortMovies(movieCatalog, 'rating', 'desc');
      expect(byRatingDesc[0].id).toBe(2); // 8.8
      expect(byRatingDesc[byRatingDesc.length - 1].id).toBe(3); // 6.2

      const byRatingAsc = sortMovies(movieCatalog, 'rating', 'asc');
      expect(byRatingAsc[0].id).toBe(3); // 6.2

      const byDateDesc = sortMovies(movieCatalog, 'release_date', 'desc');
      expect(byDateDesc[0].id).toBe(2); // 2024-05-15
      // Undated title should be placed at the end
      expect(byDateDesc[byDateDesc.length - 1].id).toBe(4);

      const byTitleAsc = sortMovies(movieCatalog, 'title', 'asc');
      expect(byTitleAsc.map((m) => m.id)).toEqual([1, 2, 4, 3]); // Alpha, Beta, Delta, Gamma

      const byPopDesc = sortMovies(movieCatalog, 'popularity', 'desc');
      expect(byPopDesc[0].id).toBe(2); // 500
    });

    it('filterMoviesByGenre should filter movies by genre ID', () => {
      const sciFi = filterMoviesByGenre(movieCatalog, 878);
      expect(sciFi.length).toBe(1);
      expect(sciFi[0].id).toBe(2);

      const action = filterMoviesByGenre(movieCatalog, 28);
      expect(action.length).toBe(2);

      expect(filterMoviesByGenre(movieCatalog, 0)).toEqual(movieCatalog);
    });

    it('filterMoviesByLanguage should filter movies by language code', () => {
      const hindi = filterMoviesByLanguage(movieCatalog, 'hi');
      expect(hindi.length).toBe(1);
      expect(hindi[0].id).toBe(2);

      const all = filterMoviesByLanguage(movieCatalog, 'all');
      expect(all.length).toBe(4);
    });

    it('searchMoviesInMemory should match title, overview, director, genres, genre IDs, and network', () => {
      expect(searchMoviesInMemory(movieCatalog, 'Beta').length).toBe(1);
      expect(searchMoviesInMemory(movieCatalog, 'thrilling').length).toBe(1);
      expect(searchMoviesInMemory(movieCatalog, 'Famous Director').length).toBe(1);
      expect(searchMoviesInMemory(movieCatalog, 'Sci-Fi').length).toBe(1);
      expect(searchMoviesInMemory(movieCatalog, 'HBO').length).toBe(1);
      expect(searchMoviesInMemory(movieCatalog, 'Nonexistent').length).toBe(0);
      expect(searchMoviesInMemory(movieCatalog, '').length).toBe(4);
      // Movie 4 has only genre_ids: [28], searching 'Action' resolves via inGenreIds
      expect(searchMoviesInMemory(movieCatalog, 'Action').length).toBe(2);
      expect(searchMoviesInMemory(null as any, 'Action')).toEqual([]);
    });

    it('sorting and filtering should handle null, undefined, or invalid inputs safely', () => {
      expect(sortMovies(null as any)).toEqual([]);
      expect(filterMoviesByGenre(null as any, 28)).toEqual([]);
      expect(filterMoviesByGenre(movieCatalog, NaN)).toEqual(movieCatalog);
      expect(filterMoviesByLanguage(null as any, 'en')).toEqual([]);
      expect(filterMoviesByLanguage(movieCatalog, null as any)).toEqual(movieCatalog);
    });
  });

  describe('Runtime Type Guards (with NaN and Malformed Data Protection)', () => {
    it('isCastMember should validate cast members and reject NaN', () => {
      expect(isCastMember({ id: 101, name: 'Actor Name', character: 'Hero' })).toBe(true);
      expect(isCastMember({ id: 101, name: 'Actor Name', character: 'Hero', profile_path: null, order: 1 })).toBe(true);
      expect(isCastMember({ id: 101, name: 'Actor Name', character: 'Hero', order: NaN })).toBe(false);
      expect(isCastMember({ id: NaN, name: 'Actor Name', character: 'Hero' })).toBe(false);
      expect(isCastMember({ id: 'bad_id', name: 'Actor Name' })).toBe(false);
      expect(isCastMember(null)).toBe(false);
    });

    it('isGenre should validate genres and reject NaN', () => {
      expect(isGenre({ id: 28, name: 'Action' })).toBe(true);
      expect(isGenre({ id: NaN, name: 'Action' })).toBe(false);
      expect(isGenre({ id: '28', name: 'Action' })).toBe(false);
      expect(isGenre(undefined)).toBe(false);
    });

    it('isVideoTrailer should validate video trailer objects', () => {
      expect(
        isVideoTrailer({
          id: 'v1',
          key: 'xyz789',
          name: 'Teaser',
          site: 'YouTube',
          type: 'Teaser',
        })
      ).toBe(true);
      expect(isVideoTrailer({ id: 'v1', key: 'xyz' })).toBe(false);
      expect(isVideoTrailer(null)).toBe(false);
    });

    it('isStreamingServer should validate server configurations', () => {
      expect(
        isStreamingServer({
          id: 'srv_1',
          name: 'vidsrc',
          label: 'VidSrc Pro',
          badge: 'Fast',
        })
      ).toBe(true);
      expect(isStreamingServer({ id: 'srv_1' })).toBe(false);
      expect(isStreamingServer(null)).toBe(false);
    });

    it('isStreamEpisode should validate episodes and reject NaN', () => {
      expect(
        isStreamEpisode({
          episodeNumber: 1,
          title: 'Pilot',
          duration: '45m',
          streamId: 'ep_1',
        })
      ).toBe(true);
      expect(
        isStreamEpisode({
          episodeNumber: NaN,
          title: 'Pilot',
          duration: '45m',
          streamId: 'ep_1',
        })
      ).toBe(false);
      expect(isStreamEpisode(null)).toBe(false);
    });

    it('isMovie should validate movie objects and reject NaN ratings or ids', () => {
      expect(isMovie({ id: 100, title: 'Test Movie', vote_average: 8.0, genre_ids: [28], is_tv: false })).toBe(true);
      expect(isMovie({ id: NaN, title: 'Test', vote_average: 8.0, genre_ids: [] })).toBe(false);
      expect(isMovie({ id: 100, title: 'Test', vote_average: NaN, genre_ids: [] })).toBe(false);
      expect(isMovie({ id: 100, title: 123 })).toBe(false);
      expect(isMovie({ id: 100, title: 'Test', vote_average: 8.0, genre_ids: [NaN] })).toBe(false);
      expect(isMovie({ id: 100, title: 'Test', vote_average: 8.0, genre_ids: ['action' as any] })).toBe(false);
      expect(isMovie({ id: 100, title: 'Test', vote_average: 8.0, genre_ids: [], is_tv: 'not_bool' })).toBe(false);
      expect(isMovie(null)).toBe(false);
    });

    it('isMovieBookmark should validate bookmark objects', () => {
      const validBookmark: MovieBookmark = {
        id: 'bm_1',
        tmdbId: 100,
        title: 'Bookmarked Movie',
        voteAverage: 8.5,
        isWatched: false,
        savedAt: '2026-10-31T00:00:00.000Z',
        genres: ['Action'],
        isTv: false,
      };
      expect(isMovieBookmark(validBookmark)).toBe(true);
      expect(isMovieBookmark({ ...validBookmark, tmdbId: NaN })).toBe(false);
      expect(isMovieBookmark({ ...validBookmark, voteAverage: NaN })).toBe(false);
      expect(isMovieBookmark({ ...validBookmark, tmdbId: 'bad' as any })).toBe(false);
      expect(isMovieBookmark({ ...validBookmark, genres: [123 as any] })).toBe(false);
      expect(isMovieBookmark({ ...validBookmark, isTv: 123 as any })).toBe(false);
      expect(isMovieBookmark(null)).toBe(false);
    });

    it('isStreamableMedia should validate streamable media items', () => {
      const media: StreamableMedia = {
        id: 'stream_1',
        title: 'Stream Item',
        type: 'movie',
        sourceType: 'remote',
        quality: '1080p',
        overview: '',
        posterUrl: '',
        backdropUrl: '',
        genres: [],
        releaseYear: '2024',
      };
      expect(isStreamableMedia(media)).toBe(true);
      expect(isStreamableMedia({ ...media, type: 'podcast' as any })).toBe(false);
      expect(isStreamableMedia({ ...media, seasonNumber: NaN })).toBe(false);
      expect(isStreamableMedia({ ...media, genres: [null as any] })).toBe(false);
      expect(isStreamableMedia(null)).toBe(false);
    });

    it('isTVMazeShow & isTVMazeEpisode should validate TVmaze payloads and reject NaN', () => {
      expect(isTVMazeShow({ id: 10, name: 'Show', genres: ['Drama'] })).toBe(true);
      expect(isTVMazeShow({ id: NaN, name: 'Show', genres: [] })).toBe(false);
      expect(isTVMazeShow({ id: 10, genres: 'Drama' as any })).toBe(false);
      expect(isTVMazeShow({ id: 10, name: 'Show', genres: [123 as any] })).toBe(false);
      expect(isTVMazeEpisode({ id: 1, name: 'Pilot' })).toBe(true);
      expect(isTVMazeEpisode({ id: NaN, name: 'Pilot' })).toBe(false);
      expect(isTVMazeEpisode(null)).toBe(false);
    });

    it('isTVMazeSeason & isTVMazeScheduleItem should validate seasons and schedules', () => {
      expect(isTVMazeSeason({ id: 100, number: 1 })).toBe(true);
      expect(isTVMazeSeason({ id: NaN, number: 1 })).toBe(false);
      expect(isTVMazeSeason({ id: 100, number: NaN })).toBe(false);
      expect(isTVMazeSeason(null)).toBe(false);

      const validShow: TVMazeShow = { id: 10, name: 'Show', genres: ['Drama'] };
      expect(
        isTVMazeScheduleItem({
          id: 501,
          name: 'Episode Airing',
          season: 2,
          number: 5,
          show: validShow,
        })
      ).toBe(true);
      expect(
        isTVMazeScheduleItem({
          id: 501,
          name: 'Episode Airing',
          season: 2,
          number: 5,
          show: { id: 'bad' } as any,
        })
      ).toBe(false);
      expect(isTVMazeScheduleItem(null)).toBe(false);
    });
  });
});
