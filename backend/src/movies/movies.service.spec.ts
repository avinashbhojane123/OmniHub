import { MoviesService } from './movies.service';

describe('MoviesService (Backend)', () => {
  let service: MoviesService;

  beforeEach(() => {
    service = new MoviesService();
  });

  it('should return trending movies with hardcoded TMDb dataset', async () => {
    const res = await service.getTrending(1);
    expect(res).toBeDefined();
    expect(res.results.length).toBeGreaterThan(0);
    const dune = res.results.find((m) => m.id === 693134);
    expect(dune).toBeDefined();
    expect(dune?.title).toBe('Dune: Part Two');
    expect(dune?.trailer_key).toBe('Way9Dexny3w');
  });

  it('should return top rated movies sorted by rating', async () => {
    const res = await service.getTopRated(1);
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0].vote_average).toBeGreaterThanOrEqual(
      res.results[1].vote_average,
    );
  });

  it('should return TMDb genres list', async () => {
    const res = await service.getGenres();
    expect(res.genres).toBeDefined();
    expect(res.genres.some((g) => g.name === 'Sci-Fi')).toBe(true);
    expect(res.genres.some((g) => g.name === 'Action')).toBe(true);
  });

  it('should search movies by query and genre', async () => {
    const searchRes = await service.search('dark knight');
    expect(searchRes.results.length).toBeGreaterThan(0);
    expect(searchRes.results[0].title).toBe('The Dark Knight');
  });

  it('should manage watchlist items in-memory and toggle watched', async () => {
    const movie = await service.getMovieDetails(872585); // Oppenheimer
    expect(movie.title).toBe('Oppenheimer');

    // Add to watchlist
    await service.addToWatchlist({
      tmdbId: movie.id,
      title: movie.title,
      overview: movie.overview,
      posterPath: movie.poster_path,
      voteAverage: movie.vote_average,
      releaseDate: movie.release_date,
      isWatched: false,
    });

    let watchlist = await service.getWatchlist();
    expect(watchlist.some((w) => w.tmdbId === movie.id)).toBe(true);

    // Toggle watched
    const updated = await service.toggleWatched(movie.id, true);
    expect(updated.isWatched).toBe(true);

    // Remove from watchlist
    await service.removeFromWatchlist(movie.id);
    watchlist = await service.getWatchlist();
    expect(watchlist.some((w) => w.tmdbId === movie.id)).toBe(false);
  });
});
