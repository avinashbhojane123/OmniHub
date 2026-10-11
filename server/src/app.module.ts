import { Module } from '@nestjs/common';
import { BackupService } from './backup/backup.service';
import { BackupController } from './backup/backup.controller';
import { SafeGuardModule } from './modules/safeguard/safeguard.module';

@Module({
  imports: [SafeGuardModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class AppModule {}
