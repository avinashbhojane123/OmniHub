import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JoinRoomHttpDto } from './dto/join-room-http.dto';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

export interface JoinRoomResponse {
  success: boolean;
  roomId: number;
  passcode: string;
  nickname: string;
  theme: string;
  customWallpaper: string | null;
}

export interface RoomDetailsResponse {
  success: boolean;
  roomId: number;
  passcode: string;
  roomName: string;
  theme: string;
  customWallpaper: string | null;
  isActive: boolean;
}

export interface RoomsHealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

@UseGuards(RateLimitGuard)
@Controller('rooms')
export class RoomsController {
  private readonly logger = new Logger(RoomsController.name);

  constructor(private readonly roomService: RoomsService) {}

  /**
   * Health and connectivity check for rooms service.
   */
  @Get('health')
  getHealth(): RoomsHealthResponse {
    return {
      status: 'ok',
      service: 'rooms',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Join or create a room by passcode, checking ban status for the given nickname.
   */
  @Post('join')
  @HttpCode(HttpStatus.OK)
  async join(@Body() body: JoinRoomHttpDto): Promise<JoinRoomResponse> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required');
    }

    const rawPasscode = body.passcode;
    const rawNickname = body.nickname;

    if (!rawPasscode || typeof rawPasscode !== 'string') {
      throw new BadRequestException('Passcode is required');
    }

    if (!rawNickname || typeof rawNickname !== 'string') {
      throw new BadRequestException('Nickname is required');
    }

    const cleanPasscode = rawPasscode
      .replace(/[\r\n\t\0\u200B-\u200D\uFEFF]/g, '')
      .trim();
    if (!cleanPasscode) {
      throw new BadRequestException('Passcode cannot be empty');
    }
    if (cleanPasscode.length > 50) {
      throw new BadRequestException('Passcode cannot exceed 50 characters');
    }

    const cleanNickname = rawNickname
      .replace(/[\r\n\t\0\u200B-\u200D\uFEFF]/g, '')
      .trim();
    if (!cleanNickname) {
      throw new BadRequestException('Nickname cannot be empty');
    }
    if (cleanNickname.length > 50) {
      throw new BadRequestException('Nickname cannot exceed 50 characters');
    }

    // Passcode & nickname validated before calling service to prevent orphan room creation
    const room = await this.roomService.findOrCreate(cleanPasscode);

    const isBanned = await this.roomService.checkBanned(
      room.id,
      cleanNickname,
    );
    if (isBanned) {
      this.logger.warn(
        `Banned user '${cleanNickname}' attempted to join room '${cleanPasscode}' (id: ${room.id})`,
      );
      throw new ForbiddenException(
        'You are permanently banned from this room by the host.',
      );
    }

    return {
      success: true,
      roomId: room.id,
      passcode: room.passcode,
      nickname: cleanNickname,
      theme: (room.theme || '').trim() || 'wa-doodle',
      customWallpaper: room.customWallpaper || null,
    };
  }

  /**
   * Retrieve room metadata and wallpaper configuration by room ID.
   */
  @Get('id/:id')
  async getRoomById(
    @Param('id') idParam: string,
  ): Promise<RoomDetailsResponse> {
    const id = parseInt(idParam, 10);
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException(
        'Invalid room ID. Must be a positive integer',
      );
    }

    const room = await this.roomService.findById(id);
    if (!room) {
      throw new NotFoundException(`Room with ID ${id} not found`);
    }

    return {
      success: true,
      roomId: room.id,
      passcode: room.passcode,
      roomName: room.roomName,
      theme: (room.theme || '').trim() || 'wa-doodle',
      customWallpaper: room.customWallpaper || null,
      isActive: room.isActive,
    };
  }

  /**
   * Retrieve room metadata and wallpaper configuration by passcode.
   */
  @Get(':passcode')
  async getRoomByPasscode(
    @Param('passcode') passcodeParam: string,
  ): Promise<RoomDetailsResponse> {
    if (!passcodeParam || typeof passcodeParam !== 'string') {
      throw new BadRequestException('Passcode is required');
    }

    const cleanPasscode = passcodeParam
      .replace(/[\r\n\t\0\u200B-\u200D\uFEFF]/g, '')
      .trim();
    if (!cleanPasscode) {
      throw new BadRequestException('Passcode cannot be empty');
    }

    const room = await this.roomService.findByPasscode(cleanPasscode);
    if (!room) {
      throw new NotFoundException(
        `Room with passcode '${cleanPasscode}' not found`,
      );
    }

    return {
      success: true,
      roomId: room.id,
      passcode: room.passcode,
      roomName: room.roomName,
      theme: (room.theme || '').trim() || 'wa-doodle',
      customWallpaper: room.customWallpaper || null,
      isActive: room.isActive,
    };
  }
}
