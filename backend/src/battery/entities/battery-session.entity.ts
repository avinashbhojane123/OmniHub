import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('battery_sessions')
export class BatterySession {
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
    type: 'varchar',
    length: 50,
  })
  startTime!: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  endTime!: string | null;

  @Column({
    type: 'int',
  })
  startLevel!: number;

  @Column({
    type: 'int',
    nullable: true,
  })
  endLevel!: number | null;

  @Column({
    type: 'int',
    default: 0,
  })
  gained!: number;

  @Column({
    type: 'int',
    default: 0,
  })
  durationMinutes!: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: 'AC',
  })
  chargingType!: string;

  @Column({
    type: 'float',
    default: 0,
  })
  peakTemperature!: number;

  @Column({
    type: 'float',
    default: 0,
  })
  peakWattage!: number;

  @Column({
    type: 'float',
    default: 0,
  })
  avgSpeedPerHour!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
