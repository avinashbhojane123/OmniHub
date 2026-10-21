import { movieService } from '../src/services/movies/MovieService';
import { movieRepository } from '../src/database/repositories';

describe('MovieService & MovieRepository (CineVerse Workspace)', () => {
  jest.setTimeout(15000);

  beforeEach(async () => {
    // Clear any test bookmarks
    const all = await movieRepository.findAll();
    for (const b of all) {
      await movieRepository.delete(b.tmdbId);
    }
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
});
