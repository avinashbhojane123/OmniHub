import { movieService } from '../src/services/movies/MovieService';
import { movieRepository } from '../src/database/repositories';
import { getUniversalEmbedUrl } from '../src/components/movies/StreamPlayerModal';

describe('MovieService & MovieRepository (CineVerse Workspace)', () => {
  jest.setTimeout(15000);

  beforeEach(async () => {
    // Clear any test bookmarks
    const all = await movieRepository.findAll();
    for (const b of all) {
      await movieRepository.delete(b.tmdbId);
    }

    // Mock global fetch for reliable test execution
    (globalThis as any).fetch = jest.fn((url: string) => {
      const u = String(url);
      if (u.includes('/trending')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                {
                  id: 693134,
                  title: 'Dune: Part Two',
                  overview: 'Paul Atreides unites with Chani and the Fremen.',
                  poster_path: '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
                  vote_average: 8.6,
                  vote_count: 5200,
                  release_date: '2024-03-01',
                  genre_ids: [878, 12],
                  trailer_key: 'Way9Dexny3w',
                  director: 'Denis Villeneuve',
                },
              ],
            }),
        });
      }
      if (u.includes('/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                {
                  id: 872585,
                  title: 'Oppenheimer',
                  overview: 'The story of J. Robert Oppenheimer.',
                  poster_path: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
                  vote_average: 8.9,
                  genre_ids: [18, 36],
                  director: 'Christopher Nolan',
                },
                {
                  id: 157336,
                  title: 'Interstellar',
                  overview: 'Mankind was born on Earth.',
                  poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
                  vote_average: 8.8,
                  genre_ids: [878, 12],
                  director: 'Christopher Nolan',
                },
              ],
            }),
        });
      }
      if (u.includes('/157336')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 157336,
              title: 'Interstellar',
              overview: 'Mankind was born on Earth.',
              director: 'Christopher Nolan',
              cast: [{ id: 10297, name: 'Matthew McConaughey', character: 'Cooper' }],
              vote_average: 8.8,
            }),
        });
      }
      if (u.includes('/27205')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 27205,
              title: 'Inception',
              overview: 'Your mind is the scene of the crime.',
              vote_average: 8.7,
            }),
        });
      }
      if (u.includes('/discover')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                {
                  id: 976573,
                  title: 'Elemental',
                  original_title: 'Elemental',
                  original_language: 'en',
                  overview: 'In an element city.',
                  vote_average: 7.7,
                  genre_ids: [16, 35],
                },
                {
                  id: 872585,
                  title: 'Jawan',
                  original_title: 'Jawan',
                  original_language: 'hi',
                  overview: 'A high-octane action thriller.',
                  vote_average: 8.4,
                  genre_ids: [28, 53],
                },
              ],
            }),
        });
      }
      if (u.includes('/find-tmdb')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              tmdbId: 1399,
              mediaType: 'tv',
              title: 'Game of Thrones',
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [] }),
      });
    });
  });

  it('should fetch trending movies with curated TMDb dataset', async () => {
    const movies = await movieService.getTrending();
    expect(movies.length).toBeGreaterThan(0);
    const dune = movies.find((m) => m.id === 693134);
    expect(dune).toBeDefined();
    expect(dune?.title).toBe('Dune: Part Two');
    expect(dune?.trailer_key).toBe('Way9Dexny3w');
    expect(dune?.vote_average).toBeGreaterThan(8);
  });

  it('should filter movies by search query and genres', async () => {
    const oppenheimerResults = await movieService.searchMovies('Oppenheimer');
    expect(oppenheimerResults.length).toBeGreaterThanOrEqual(1);
    expect(oppenheimerResults[0].title).toBe('Oppenheimer');
    expect(oppenheimerResults[0].director).toBe('Christopher Nolan');

    // Filter by Sci-Fi genre (id 878)
    const sciFiMovies = await movieService.searchMovies('', 878);
    expect(sciFiMovies.length).toBeGreaterThan(0);
    sciFiMovies.forEach((m) => {
      expect(m.genre_ids).toContain(878);
    });
  });

  it('should discover movies by language and preserve original_language', async () => {
    const hindiMovies = await movieService.getByLanguage('hi');
    expect(hindiMovies.length).toBeGreaterThan(0);
    const jawan = hindiMovies.find((m) => m.id === 872585);
    expect(jawan).toBeDefined();
    expect(jawan?.title).toBe('Jawan');
    expect(jawan?.original_language).toBe('hi');
  });

  it('should fetch movie details and cast', async () => {
    const movie = await movieService.getMovieDetails(157336); // Interstellar
    expect(movie.title).toBe('Interstellar');
    expect(movie.director).toBe('Christopher Nolan');
    expect(movie.cast).toBeDefined();
    expect(movie.cast?.length).toBeGreaterThan(0);
    expect(movie.cast?.[0].name).toBe('Matthew McConaughey');
  });

  it('should save to watchlist and toggle watched status offline-first', async () => {
    const movie = await movieService.getMovieDetails(27205); // Inception
    expect(await movieService.isBookmarked(movie.id)).toBe(false);

    // Add to watchlist
    await movieService.addToWatchlist(movie);
    expect(await movieService.isBookmarked(movie.id)).toBe(true);

    let watchlist = await movieService.getWatchlist();
    expect(watchlist.some((b) => b.tmdbId === movie.id)).toBe(true);

    const saved = watchlist.find((b) => b.tmdbId === movie.id);
    expect(saved?.isWatched).toBe(false);

    // Toggle watched
    const nextWatched = await movieService.toggleWatched(movie.id);
    expect(nextWatched).toBe(true);

    watchlist = await movieService.getWatchlist();
    const updated = watchlist.find((b) => b.tmdbId === movie.id);
    expect(updated?.isWatched).toBe(true);

    // Remove from watchlist
    await movieService.removeFromWatchlist(movie.id);
    expect(await movieService.isBookmarked(movie.id)).toBe(false);
  });

  it('should resolve TMDb ID by IMDb ID and construct proper embed URL', async () => {
    const tmdbId = await movieService.resolveTmdbId({ imdbId: 'tt0944947', isTv: true });
    expect(tmdbId).toBe(1399);

    const embedUrl = getUniversalEmbedUrl('vidsrc_sh', 'tt0944947', true, 1, 1);
    expect(embedUrl).toContain('https://vidsrc.sh/embed/tv/tt0944947/1/1');
  });
});
