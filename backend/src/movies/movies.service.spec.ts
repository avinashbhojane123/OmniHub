import { MoviesService } from './movies.service';

describe('MoviesService (Backend)', () => {
  let service: MoviesService;

  beforeEach(() => {
    service = new MoviesService();
  });

  it('should return trending movies from live TMDb API', async () => {
    const res = await service.getTrending(1);
    expect(res).toBeDefined();
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0].title).toBeDefined();
    expect(res.results[0].poster_path).toBeDefined();
  }, 15000);

  it('should return top rated movies from live TMDb API', async () => {
    const res = await service.getTopRated(1);
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0].vote_average).toBeGreaterThan(7);
  }, 15000);

  it('should return TMDb genres list', async () => {
    const res = await service.getGenres();
    expect(res.genres).toBeDefined();
    expect(res.genres.some((g) => g.name === 'Science Fiction' || g.name === 'Sci-Fi')).toBe(true);
    expect(res.genres.some((g) => g.name === 'Action')).toBe(true);
  }, 15000);

  it('should discover movies by language with original_language preserved', async () => {
    const res = await service.discover({ language: 'hi', page: 1 });
    expect(res).toBeDefined();
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results.some((m) => m.original_language === 'hi')).toBe(true);
  }, 15000);

  it('should search movies by query', async () => {
    const searchRes = await service.search('dark knight');
    expect(searchRes.results.length).toBeGreaterThan(0);
    expect(searchRes.results.some((m) => m.title.includes('Dark Knight'))).toBe(true);
  }, 15000);

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
  }, 15000);

  it('should fetch live TV shows from TVMaze API', async () => {
    const shows = await service.getTVMazeShows(0);
    expect(shows).toBeDefined();
    expect(Array.isArray(shows)).toBe(true);
    expect(shows.length).toBeGreaterThan(0);
    expect(shows[0].name).toBeDefined();
  }, 15000);

  it('should fetch live TV show cast members from TVMaze API', async () => {
    const cast = await service.getTVMazeCast(1371); // Westworld (TVmaze ID 1371)
    expect(cast).toBeDefined();
    expect(Array.isArray(cast)).toBe(true);
    expect(cast.length).toBeGreaterThan(0);
    expect(cast.some((c: any) => c.person?.name === 'Thandiwe Newton' || c.person?.name === 'Evan Rachel Wood')).toBe(true);
  }, 15000);
});
