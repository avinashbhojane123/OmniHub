import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatGateway } from './chat.gateway';
import { CallingService } from './services/calling.service';
import { WatchPartyService } from './services/watch-party.service';
import { StatusService } from './services/status.service';
import { MessageService } from './services/message.service';
import { RoomModerationService } from './services/room-moderation.service';
import { WallpaperService } from './services/wallpaper.service';

import { Room } from '../rooms/room.entity';
import { Message } from '../messages/message.entity';
import { User } from '../users/user.entity';
import { Status } from '../status/status.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Room, Message, User, Status])],
  providers: [
    CallingService,
    WatchPartyService,
    StatusService,
    MessageService,
    RoomModerationService,
    WallpaperService,
    ChatGateway,
  ],
  exports: [
    CallingService,
    WatchPartyService,
    StatusService,
    MessageService,
    RoomModerationService,
    WallpaperService,
  ],
})
export class ChatModule {}
