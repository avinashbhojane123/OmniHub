import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { MovieBookmark } from './entities/movie-bookmark.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MovieBookmark])],
  controllers: [MoviesController, StreamController],
  providers: [MoviesService, StreamService],
  exports: [MoviesService, StreamService],
})
export class MoviesModule {}
