import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Query,
  Param,
  Body,
  Headers,
} from '@nestjs/common';
import { MoviesService } from './movies.service';
import { BookmarkMovieDto, UpdateWatchedDto } from './dto/movie.dto';

@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Get('trending')
  getTrending(@Query('page') page?: string) {
    return this.moviesService.getTrending(page ? Number(page) : 1);
  }

  @Get('now-playing')
  getNowPlaying(@Query('page') page?: string) {
    return this.moviesService.getNowPlaying(page ? Number(page) : 1);
  }

  @Get('popular')
  getPopular(@Query('page') page?: string) {
    return this.moviesService.getPopular(page ? Number(page) : 1);
  }

  @Get('top-rated')
  getTopRated(@Query('page') page?: string) {
    return this.moviesService.getTopRated(page ? Number(page) : 1);
  }

  @Get('upcoming')
  getUpcoming(@Query('page') page?: string) {
    return this.moviesService.getUpcoming(page ? Number(page) : 1);
  }

  @Get('genres')
  getGenres() {
    return this.moviesService.getGenres();
  }

  @Get('discover')
  discover(
    @Query('language') language?: string,
    @Query('isTv') isTv?: string,
    @Query('genre') genre?: string,
    @Query('page') page?: string,
  ) {
    return this.moviesService.discover({
      language,
      isTv: isTv === 'true' || isTv === '1',
      genreId: genre ? Number(genre) : undefined,
      page: page ? Number(page) : 1,
    });
  }

  @Get('search')
  search(
    @Query('q') query: string,
    @Query('genre') genre?: string,
    @Query('page') page?: string,
    @Query('language') language?: string,
  ) {
    return this.moviesService.search(
      query || '',
      genre ? Number(genre) : undefined,
      page ? Number(page) : 1,
      language,
    );
  }

  @Get('watchlist')
  getWatchlist(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const userId = queryUserId || headerUserId;
    return this.moviesService.getWatchlist(userId);
  }

  @Post('watchlist')
  addToWatchlist(
    @Body() dto: BookmarkMovieDto,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    if (!dto.userId && headerUserId) {
      dto.userId = headerUserId;
    }
    return this.moviesService.addToWatchlist(dto);
  }

  @Delete('watchlist/:id')
  removeFromWatchlist(
    @Param('id') id: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Query('isTv') isTv?: string,
  ) {
    const userId = queryUserId || headerUserId;
    return this.moviesService.removeFromWatchlist(
      id,
      userId,
      isTv !== undefined ? isTv === 'true' : undefined,
    );
  }

  @Patch('watchlist/:id/watched')
  toggleWatched(
    @Param('id') id: string,
    @Body() body: UpdateWatchedDto,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Query('isTv') queryIsTv?: string,
  ) {
    const userId = queryUserId || headerUserId;
    const isTv =
      body?.isTv !== undefined
        ? body.isTv
        : queryIsTv !== undefined
          ? queryIsTv === 'true'
          : undefined;
    return this.moviesService.toggleWatched(id, body?.isWatched, userId, isTv);
  }


  // --- TVmaze API (Free TV Series, Schedules, Episodes) ---
  @Get('tvmaze/shows')
  getTVMazeShows(
    @Query('page') page?: string,
    @Query('language') language?: string,
  ) {
    return this.moviesService.getTVMazeShows(page ? Number(page) : 0, language);
  }

  @Get('tvmaze/schedule')
  getTVMazeSchedule(@Query('country') country?: string, @Query('date') date?: string) {
    return this.moviesService.getTVMazeSchedule(country || 'US', date);
  }

  @Get('tvmaze/shows/:id/episodes')
  getTVMazeEpisodes(@Param('id') id: string) {
    return this.moviesService.getTVMazeEpisodes(id);
  }

  @Get('tvmaze/shows/:id/seasons')
  getTVMazeSeasons(@Param('id') id: string) {
    return this.moviesService.getTVMazeSeasons(id);
  }

  @Get('tvmaze/shows/:id/cast')
  getTVMazeCast(@Param('id') id: string) {
    return this.moviesService.getTVMazeCast(id);
  }

  @Get('tvmaze/search')
  searchTVMazeShows(@Query('q') query: string) {
    return this.moviesService.searchTVMazeShows(query || '');
  }

  @Get('find-tmdb')
  findTmdb(
    @Query('imdbId') imdbId?: string,
    @Query('q') query?: string,
    @Query('isTv') isTv?: string,
  ) {
    return this.moviesService.findTmdb(
      imdbId,
      query,
      isTv !== undefined ? isTv === 'true' || isTv === '1' : undefined,
    );
  }

  @Get(':id')
  getMovieDetails(@Param('id') id: string) {

    return this.moviesService.getMovieDetails(id);
  }

  @Get(':id/credits')
  getCredits(@Param('id') id: string) {
    return this.moviesService.getCredits(id);
  }

  @Get(':id/videos')
  getVideos(@Param('id') id: string) {
    return this.moviesService.getVideos(id);
  }

  @Get(':id/recommendations')
  getRecommendations(@Param('id') id: string) {
    return this.moviesService.getRecommendations(id);
  }
}
