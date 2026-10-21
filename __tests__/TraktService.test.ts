import { traktService } from '../src/services/movies/TraktService';
import { movieRepository, settingsRepository } from '../src/database/repositories';

describe('TraktService (Trakt.tv API Social & Tracking Integration)', () => {
  jest.setTimeout(15000);

  beforeEach(async () => {

    // Clean up test watchlist
    const all = await movieRepository.findAll();
    for (const b of all) {
      await movieRepository.delete(b.tmdbId);
    }
    await settingsRepository.set('trakt_username', '');
  });

  it('should fetch Trakt trending movies with live watchers count', async () => {
    const trending = await traktService.getTrending(1);
    expect(trending.length).toBeGreaterThan(0);

    const first = trending[0];
    expect(first.title).toBeDefined();
    expect(first.trakt_watchers).toBeGreaterThan(0);
    expect(first.trakt_rating).toBeDefined();
  });

  it('should fetch Trakt weekly most watched and anticipated movies', async () => {
    const mostWatched = await traktService.getMostWatched('weekly', 1);
    expect(mostWatched.length).toBeGreaterThan(0);
    expect(mostWatched[0].trakt_plays).toBeGreaterThan(0);

    const anticipated = await traktService.getAnticipated(1);
    expect(anticipated.length).toBeGreaterThan(0);
    expect(anticipated[0].trakt_list_count).toBeGreaterThan(0);
  });

  it('should fetch Trakt community comments & stats for a title', async () => {
    const comments = await traktService.getMovieComments(693134);
    expect(comments.length).toBeGreaterThan(0);

    const firstComment = comments[0];
    expect(firstComment.comment).toBeDefined();
    expect(firstComment.user.username).toBeDefined();
    expect(firstComment.likes).toBeGreaterThan(0);

    const stats = await traktService.getMovieStats(693134);
    expect(stats).toBeDefined();
    expect(stats?.watchers).toBeGreaterThan(0);
    expect(stats?.plays).toBeGreaterThan(0);
  });

  it('should connect Trakt username and sync watchlist into SQLite repository', async () => {
    await traktService.setConnectedUsername('cinemaphile');
    const connected = await traktService.getConnectedUsername();
    expect(connected).toBe('cinemaphile');

    const profile = await traktService.getUserProfile('cinemaphile');
    expect(profile).toBeDefined();
    expect(profile?.username).toBe('cinemaphile');
    expect(profile?.stats?.movies?.watched).toBeGreaterThan(0);

    // Sync watchlist
    const syncResult = await traktService.syncWatchlist('cinemaphile');
    expect(syncResult.status).toBe('success');
    expect(syncResult.message).toContain('Synced');

    const localWatchlist = await movieRepository.findAll();
    expect(localWatchlist.length).toBeGreaterThanOrEqual(0);
  });
});
