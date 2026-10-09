import { Controller, Get, Post, Body, Headers, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { BackupService } from './backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  private validateAuth(headers: Record<string, any>) {
    const serverKey = process.env.BACKUP_API_KEY;
    if (!serverKey) return;
    const clientKey = headers['x-api-key'] || (headers.authorization as string | undefined)?.replace(/^Bearer\s+/i, '');
    if (clientKey !== serverKey) {
      throw new UnauthorizedException('Invalid or missing X-API-Key authorization header');
    }
  }

  @Post()
  async save(@Body() payload: any, @Headers() headers: Record<string, any>) {
    this.validateAuth(headers);
    return await this.backupService.saveBackup(payload);
  }

  @Get()
  async list(@Headers() headers: Record<string, any>) {
    this.validateAuth(headers);
    return await this.backupService.listBackups();
  }

  @Get('latest')
  async getLatest(@Headers() headers: Record<string, any>) {
    this.validateAuth(headers);
    const backup = await this.backupService.getLatestBackup();
    if (!backup) {
      throw new NotFoundException('No previous backups found');
    }
    return backup;
  }
}
