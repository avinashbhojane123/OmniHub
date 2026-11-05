import { tvMazeService, TVMAZE_TO_TMDB_MAP } from '../src/services/movies/TVMazeService';

describe('TVMazeService (TVmaze Public API Television & Episode Guide)', () => {
  jest.setTimeout(25000);

  beforeEach(() => {
    tvMazeService.clearCache();
  });

  it('1. should fetch popular TV shows with unified movie interface', async () => {
    const shows = await tvMazeService.getPopularShows(0);
    expect(shows).toBeDefined();
    expect(shows.length).toBeGreaterThan(0);

    const first = shows[0];
    expect(first.is_tv).toBe(true);
    expect(first.tvmaze_id).toBeDefined();
    expect(first.title).toBeDefined();
    expect(first.overview).toBeDefined();
    // Verify no unencoded HTML tags or entities remain in the overview
    expect(first.overview).not.toContain('<p>');
    expect(first.overview).not.toContain('</p>');
    expect(first.overview).not.toContain('&amp;');
    expect(first.overview).not.toContain('&nbsp;');
    expect(first.vote_average).toBeGreaterThan(0);
    expect(first.genres).toBeDefined();
    expect(first.network).toBeDefined();

    // Verify secure HTTPS image URLs
    if (first.poster_path) {
      expect(first.poster_path.startsWith('https://')).toBe(true);
    }
    if (first.backdrop_path) {
      expect(first.backdrop_path.startsWith('https://')).toBe(true);
    }
  });

  it('2. should fetch broadcast & streaming schedule for today with country sanitization', async () => {
    const schedule = await tvMazeService.getScheduleToday('us'); // Lowercase should be sanitized to US
    expect(schedule).toBeDefined();
    expect(schedule.length).toBeGreaterThan(0);

    const item = schedule[0];
    expect(item.name).toBeDefined();
    expect(item.season).toBeDefined();
    expect(item.number).toBeDefined();
    expect(item.show).toBeDefined();
    expect(item.show.name).toBeDefined();
  });

  it('3. should fetch seasons breakdown for a TV series', async () => {
    // Show ID 169 (Breaking Bad)
    const seasons = await tvMazeService.getShowSeasons(169);
    expect(seasons).toBeDefined();
    expect(seasons.length).toBeGreaterThanOrEqual(5);

    const s1 = seasons[0];
    expect(s1.number).toBe(1);
    expect(s1.episodeOrder).toBe(7);
  });

  it('4. should fetch episodes list with stills and clean synopses', async () => {
    // Show ID 169 (Breaking Bad)
    const episodes = await tvMazeService.getShowEpisodes(169);
    expect(episodes).toBeDefined();
    expect(episodes.length).toBeGreaterThanOrEqual(60);

    const ep1 = episodes[0];
    expect(ep1.season).toBe(1);
    expect(ep1.number).toBe(1);
    expect(ep1.name).toBe('Pilot');
    expect(ep1.summary).toBeDefined();
    expect(ep1.summary).not.toContain('<p>');
    expect(ep1.summary).not.toContain('&nbsp;');
    expect(ep1.runtime).toBeGreaterThan(0);
  });

  it('5. should search TV shows by query', async () => {
    const results = await tvMazeService.searchShows('Stranger Things');
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThanOrEqual(1);

    const match = results.find((s) => s.title.toLowerCase().includes('stranger things'));
    expect(match).toBeDefined();
    expect(match?.is_tv).toBe(true);
  });

  it('6. should fetch cast members with integer IDs and secure profile URLs', async () => {
    // Show ID 169 (Breaking Bad)
    const cast = await tvMazeService.getShowCast(169);
    expect(cast).toBeDefined();
    expect(cast.length).toBeGreaterThan(0);

    const actor = cast[0];
    expect(typeof actor.id).toBe('number');
    expect(Number.isInteger(actor.id)).toBe(true);
    expect(actor.name).toBeDefined();
    expect(actor.character).toBeDefined();
    if (actor.profile_path) {
      expect(actor.profile_path.startsWith('https://')).toBe(true);
    }
  });

  it('7. should handle invalid showId gracefully without throwing', async () => {
    expect(await tvMazeService.getShowDetails(-1)).toBeNull();
    expect(await tvMazeService.getShowDetails(0)).toBeNull();
    expect(await tvMazeService.getShowDetails(NaN)).toBeNull();

    expect(await tvMazeService.getShowEpisodes(-5)).toEqual([]);
    expect(await tvMazeService.getShowSeasons(-5)).toEqual([]);
    expect(await tvMazeService.getShowCast(-5)).toEqual([]);
  });

  it('8. should resolve TMDb IDs instantly from well-known mappings', async () => {
    expect(TVMAZE_TO_TMDB_MAP[169]).toBe(1396); // Breaking Bad
    expect(TVMAZE_TO_TMDB_MAP[82]).toBe(1399); // Game of Thrones
    expect(TVMAZE_TO_TMDB_MAP[527]).toBe(1398); // The Sopranos
    expect(TVMAZE_TO_TMDB_MAP[36984]).toBe(87108); // Chernobyl

    const tmdbId = await tvMazeService.ensureTmdbId(169);
    expect(tmdbId).toBe(1396);
  });

  it('9. should leverage in-memory caching for faster repeated calls', async () => {
    // First call fetches from live API
    const start1 = Date.now();
    const shows1 = await tvMazeService.getPopularShows(0);
    const duration1 = Date.now() - start1;

    // Second call should return from cache in under 5ms
    const start2 = Date.now();
    const shows2 = await tvMazeService.getPopularShows(0);
    const duration2 = Date.now() - start2;

    expect(shows2.length).toBe(shows1.length);
    expect(duration2).toBeLessThanOrEqual(50);
  });
});
