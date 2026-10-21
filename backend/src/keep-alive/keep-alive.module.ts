import { Module } from '@nestjs/common';
import { KeepAliveController } from './keep-alive.controller';
import { KeepAliveService } from './keep-alive.service';

@Module({
  controllers: [KeepAliveController],
  providers: [KeepAliveService],
  exports: [KeepAliveService],
})
export class KeepAliveModule {}
