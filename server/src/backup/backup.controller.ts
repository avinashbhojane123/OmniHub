import { Controller, Get, Post, Body, NotFoundException } from '@nestjs/common';
import { BackupService } from './backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post()
  async save(@Body() payload: any) {
    return await this.backupService.saveBackup(payload);
  }

  @Get()
  async list() {
    return await this.backupService.listBackups();
  }

  @Get('latest')
  async getLatest() {
    const backup = await this.backupService.getLatestBackup();
    if (!backup) {
      throw new NotFoundException('No previous backups found');
    }
    return backup;
  }
}
