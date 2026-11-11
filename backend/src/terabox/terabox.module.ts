import { Module } from '@nestjs/common';
import { TeraboxController } from './terabox.controller';
import { TeraboxService } from './terabox.service';

@Module({
  controllers: [TeraboxController],
  providers: [TeraboxService],
  exports: [TeraboxService],
})
export class TeraboxModule {}

