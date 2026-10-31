import { getDatabase } from '../connection';
import { MovieBookmark } from '../../types';

export class MovieRepository {
  async findAll(): Promise<MovieBookmark[]> {
    try {
      const db = await getDatabase();
      const result = await db.execute(
        'SELECT * FROM movie_bookmarks ORDER BY savedAt DESC',
      );
      return result.rows.map((row) => this.mapRow(row));
    } catch {
      return [];
    }
  }

  async findByTmdbId(tmdbId: number, isTv?: boolean): Promise<MovieBookmark | null> {
    try {
      const db = await getDatabase(); 
      const sql =
        isTv !== undefined
          ? 'SELECT * FROM movie_bookmarks WHERE tmdbId = ? AND isTv = ?'
          : 'SELECT * FROM movie_bookmarks WHERE tmdbId = ?';
      const params = isTv !== undefined ? [tmdbId, isTv ? 1 : 0] : [tmdbId];
      const result = await db.execute(sql, params);
      if (result.rows.length === 0) return null;
      return this.mapRow(result.rows[0]);
    } catch {
      return null;
    }
  }

  async save(bookmark: MovieBookmark): Promise<void> {
    try {
      const db = await getDatabase();
      const existing = await this.findByTmdbId(bookmark.tmdbId, bookmark.isTv);
      const genresStr = JSON.stringify(bookmark.genres || []);

      if (existing) {
        await db.execute(
          `UPDATE movie_bookmarks SET
            title = ?,
            overview = ?,
            posterPath = ?,
            backdropPath = ?,
            voteAverage = ?,
            releaseDate = ?,
            genres = ?,
            runtime = ?,
            isWatched = ?,
            isTv = ?,
            savedAt = ?
          WHERE tmdbId = ? AND isTv = ?`,
          [
            bookmark.title,
            bookmark.overview || null,
            bookmark.posterPath || null,
            bookmark.backdropPath || null,
            bookmark.voteAverage,
            bookmark.releaseDate || null,
            genresStr,
            bookmark.runtime || 0,
            bookmark.isWatched ? 1 : 0,
            bookmark.isTv ? 1 : 0,
            bookmark.savedAt,
            bookmark.tmdbId,
            bookmark.isTv ? 1 : 0,
          ],
        );
      } else {
        await db.execute(
          `INSERT OR REPLACE INTO movie_bookmarks (
            id, tmdbId, title, overview, posterPath, backdropPath,
            voteAverage, releaseDate, genres, runtime, isWatched, isTv, savedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            bookmark.id,
            bookmark.tmdbId,
            bookmark.title,
            bookmark.overview || null,
            bookmark.posterPath || null,
            bookmark.backdropPath || null,
            bookmark.voteAverage,
            bookmark.releaseDate || null,
            genresStr,
            bookmark.runtime || 0,
            bookmark.isWatched ? 1 : 0,
            bookmark.isTv ? 1 : 0,
            bookmark.savedAt,
          ],
        );
      }
    } catch (e) {
      console.warn('[MovieRepository] Failed to save bookmark:', e);
    }
  }

  async delete(tmdbId: number, isTv?: boolean): Promise<void> {
    try {
      const db = await getDatabase();
      const sql =
        isTv !== undefined
          ? 'DELETE FROM movie_bookmarks WHERE tmdbId = ? AND isTv = ?'
          : 'DELETE FROM movie_bookmarks WHERE tmdbId = ?';
      const params = isTv !== undefined ? [tmdbId, isTv ? 1 : 0] : [tmdbId];
      await db.execute(sql, params);
    } catch (e) {
      console.warn('[MovieRepository] Failed to delete bookmark:', e);
    }
  }

  async toggleWatched(tmdbId: number, isTv?: boolean): Promise<boolean> {
    try {
      const item = await this.findByTmdbId(tmdbId, isTv);
      if (!item) return false;
      const nextWatched = !item.isWatched;
      const db = await getDatabase();
      const sql =
        isTv !== undefined
          ? 'UPDATE movie_bookmarks SET isWatched = ? WHERE tmdbId = ? AND isTv = ?'
          : 'UPDATE movie_bookmarks SET isWatched = ? WHERE tmdbId = ?';
      const params =
        isTv !== undefined
          ? [nextWatched ? 1 : 0, tmdbId, isTv ? 1 : 0]
          : [nextWatched ? 1 : 0, tmdbId];
      await db.execute(sql, params);
      return nextWatched;
    } catch {
      return false;
    }
  }

  async isBookmarked(tmdbId: number, isTv?: boolean): Promise<boolean> {
    const item = await this.findByTmdbId(tmdbId, isTv);
    return item !== null;
  }

  private mapRow(row: any): MovieBookmark {
    let parsedGenres: string[] = [];
    if (typeof row.genres === 'string') {
      try {
        parsedGenres = JSON.parse(row.genres);
      } catch {
        parsedGenres = row.genres.split(',').map((g: string) => g.trim());
      }
    } else if (Array.isArray(row.genres)) {
      parsedGenres = row.genres;
    }

    return {
      id: String(row.id),
      tmdbId: Number(row.tmdbId),
      title: row.title,
      overview: row.overview || undefined,
      posterPath: row.posterPath || undefined,
      backdropPath: row.backdropPath || undefined,
      voteAverage: Number(row.voteAverage || 0),
      releaseDate: row.releaseDate || undefined,
      genres: parsedGenres,
      runtime: row.runtime ? Number(row.runtime) : undefined,
      isWatched: Boolean(row.isWatched),
      isTv: Boolean(row.isTv),
      savedAt: row.savedAt,
    };
  }
}

export const movieRepository = new MovieRepository();
