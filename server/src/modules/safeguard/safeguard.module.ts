import { Module } from '@nestjs/common';
import { SafeGuardService } from './safeguard.service';
import { SafeGuardController } from './safeguard.controller';
import { RiskEngineService } from './risk-engine.service';

@Module({
  controllers: [SafeGuardController],
  providers: [SafeGuardService, RiskEngineService],
  exports: [SafeGuardService, RiskEngineService],
})
export class SafeGuardModule {}
