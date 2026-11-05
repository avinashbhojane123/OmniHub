import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Status } from './status.entity';
import { Room } from '../rooms/room.entity';

/**
 * StatusModule encapsulates the persistence layer for ephemeral 24-hour status stories,
 * media attachments, viewer tracking, and room relations across the OmniHub platform.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Status, Room])],
  exports: [TypeOrmModule],
})
export class StatusModule {}
