import { tvMazeService } from '../src/services/movies/TVMazeService';

describe('TVMazeService (TVmaze Public API Television & Episode Guide)', () => {
  jest.setTimeout(15000);

  it('should fetch popular TV shows with unified movie interface', async () => {
    const shows = await tvMazeService.getPopularShows(0);
    expect(shows).toBeDefined();
    expect(shows.length).toBeGreaterThan(0);

    const first = shows[0];
    expect(first.is_tv).toBe(true);
    expect(first.tvmaze_id).toBeDefined();
    expect(first.title).toBeDefined();
    expect(first.overview).toBeDefined();
    expect(first.vote_average).toBeGreaterThan(0);
    expect(first.genres).toBeDefined();
    expect(first.network).toBeDefined();
  });

  it('should fetch broadcast & streaming schedule for today', async () => {
    const schedule = await tvMazeService.getScheduleToday('US');
    expect(schedule).toBeDefined();
    expect(schedule.length).toBeGreaterThan(0);

    const item = schedule[0];
    expect(item.name).toBeDefined();
    expect(item.season).toBeDefined();
    expect(item.number).toBeDefined();
    expect(item.show).toBeDefined();
    expect(item.show.name).toBeDefined();
  });

  it('should fetch seasons breakdown for a TV series', async () => {
    // Show ID 1371 (Breaking Bad)
    const seasons = await tvMazeService.getShowSeasons(1371);
    expect(seasons).toBeDefined();
    expect(seasons.length).toBeGreaterThanOrEqual(1);

    const s1 = seasons[0];
    expect(s1.number).toBe(1);
    expect(s1.episodeOrder).toBeGreaterThan(0);
  });

  it('should fetch episodes list with stills and synopses', async () => {
    // Show ID 1371 (Breaking Bad)
    const episodes = await tvMazeService.getShowEpisodes(1371);
    expect(episodes).toBeDefined();
    expect(episodes.length).toBeGreaterThan(0);

    const ep1 = episodes[0];
    expect(ep1.season).toBe(1);
    expect(ep1.number).toBe(1);
    expect(ep1.name).toBeDefined();
    expect(ep1.summary).toBeDefined();
    expect(ep1.runtime).toBeGreaterThan(0);
  });

  it('should search TV shows by query', async () => {
    const results = await tvMazeService.searchShows('Stranger Things');
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThanOrEqual(1);

    const match = results.find((s) => s.title.toLowerCase().includes('stranger things'));
    expect(match).toBeDefined();
    expect(match?.is_tv).toBe(true);
  });
});
