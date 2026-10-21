import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Query,
  Param,
  Body,
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

  @Get('search')
  search(
    @Query('q') query: string,
    @Query('genre') genre?: string,
    @Query('page') page?: string,
  ) {
    return this.moviesService.search(
      query || '',
      genre ? Number(genre) : undefined,
      page ? Number(page) : 1,
    );
  }

  @Get('watchlist')
  getWatchlist() {
    return this.moviesService.getWatchlist();
  }

  @Post('watchlist')
  addToWatchlist(@Body() dto: BookmarkMovieDto) {
    return this.moviesService.addToWatchlist(dto);
  }

  @Delete('watchlist/:id')
  removeFromWatchlist(@Param('id') id: string) {
    return this.moviesService.removeFromWatchlist(id);
  }

  @Patch('watchlist/:id/watched')
  toggleWatched(
    @Param('id') id: string,
    @Body() body: UpdateWatchedDto,
  ) {
    return this.moviesService.toggleWatched(id, body?.isWatched);
  }

  // --- Trakt.tv API Social & Tracking Endpoints ---
  @Get('trakt/trending')
  getTraktTrending(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.moviesService.getTraktTrending(page ? Number(page) : 1, limit ? Number(limit) : 20);
  }

  @Get('trakt/watched')
  getTraktWatched(
    @Query('period') period?: 'weekly' | 'monthly' | 'yearly',
    @Query('page') page?: string,
  ) {
    return this.moviesService.getTraktWatched(period || 'weekly', page ? Number(page) : 1);
  }

  @Get('trakt/anticipated')
  getTraktAnticipated(@Query('page') page?: string) {
    return this.moviesService.getTraktAnticipated(page ? Number(page) : 1);
  }

  @Get('trakt/comments/:id')
  getTraktComments(@Param('id') id: string) {
    return this.moviesService.getTraktComments(id);
  }

  @Get('trakt/stats/:id')
  getTraktStats(@Param('id') id: string) {
    return this.moviesService.getTraktStats(id);
  }

  @Get('trakt/user/:username/profile')
  getTraktUserProfile(@Param('username') username: string) {
    return this.moviesService.getTraktUserProfile(username);
  }

  @Get('trakt/user/:username/watchlist')
  getTraktUserWatchlist(@Param('username') username: string) {
    return this.moviesService.getTraktUserWatchlist(username);
  }

  @Get('trakt/user/:username/history')
  getTraktUserHistory(@Param('username') username: string) {
    return this.moviesService.getTraktUserHistory(username);
  }

  // --- TVmaze API (Free TV Series, Schedules, Episodes) ---
  @Get('tvmaze/shows')
  getTVMazeShows(@Query('page') page?: string) {
    return this.moviesService.getTVMazeShows(page ? Number(page) : 0);
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

  @Get('tvmaze/search')
  searchTVMazeShows(@Query('q') query: string) {
    return this.moviesService.searchTVMazeShows(query || '');
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
