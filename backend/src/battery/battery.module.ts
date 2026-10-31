import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatterySettings } from './entities/battery-settings.entity';
import { BatterySession } from './entities/battery-session.entity';
import { BatteryService } from './battery.service';
import { BatteryController } from './battery.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BatterySettings, BatterySession]),
  ],
  controllers: [BatteryController],
  providers: [BatteryService],
  exports: [BatteryService],
})
export class BatteryModule {}
