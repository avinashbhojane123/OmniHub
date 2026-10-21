import {
  Controller,
  Post,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JoinRoomHttpDto } from './dto/join-room-http.dto';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomService: RoomsService) {}

  @Post('join')
  @UseGuards(RateLimitGuard)
  async join(
    @Body()
    body: JoinRoomHttpDto,
  ) {
    const room = await this.roomService.findOrCreate(body.passcode.trim());

    const isBanned = await this.roomService.checkBanned(
      room.id,
      body.nickname.trim(),
    );
    if (isBanned) {
      throw new ForbiddenException(
        'You are permanently banned from this room by the host.',
      );
    }

    return {
      success: true,
      roomId: room.id,
      passcode: room.passcode,
      nickname: body.nickname.trim(),
      theme: room.theme || 'wa-doodle',
      customWallpaper: room.customWallpaper || null,
    };
  }
}
