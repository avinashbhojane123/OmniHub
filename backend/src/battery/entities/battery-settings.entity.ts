import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('battery_settings')
export class BatterySettings {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({
    type: 'varchar',
    length: 100,
    default: 'default_device',
  })
  deviceId!: string;

  @Column({
    type: 'boolean',
    default: true,
  })
  batteryGuardActive!: boolean;

  @Column({
    type: 'boolean',
    default: true,
  })
  fullChargeAlarmEnabled!: boolean;

  @Column({
    type: 'int',
    default: 80,
  })
  fullChargeTarget!: number;

  @Column({
    type: 'boolean',
    default: true,
  })
  overchargeFailsafeEnabled!: boolean;

  @Column({
    type: 'boolean',
    default: true,
  })
  lowBatteryAlarmEnabled!: boolean;

  @Column({
    type: 'int',
    default: 20,
  })
  lowBatteryTarget!: number;

  @Column({
    type: 'boolean',
    default: true,
  })
  criticalLowAlarmEnabled!: boolean;

  @Column({
    type: 'boolean',
    default: true,
  })
  tempAlarmEnabled!: boolean;

  @Column({
    type: 'int',
    default: 42,
  })
  tempTarget!: number;

  @Column({
    type: 'boolean',
    default: false,
  })
  pluggedAlertEnabled!: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  unpluggedAlertEnabled!: boolean;

  @Column({
    type: 'boolean',
    default: true,
  })
  continuousRingtone!: boolean;

  @Column({
    type: 'boolean',
    default: true,
  })
  vibrationEnabled!: boolean;

  @Column({
    type: 'boolean',
    default: true,
  })
  soundEnabled!: boolean;

  @Column({
    type: 'boolean',
    default: true,
  })
  autoRepeatAlarm!: boolean;

  @UpdateDateColumn()
  updatedAt!: Date;
}
