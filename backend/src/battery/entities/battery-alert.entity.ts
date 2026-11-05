import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('battery_alerts')
export class BatteryAlert {
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
  eventType!: string;

  @Column({
    type: 'int',
  })
  level!: number;

  @Column({
    type: 'float',
    nullable: true,
  })
  temperature!: number | null;

  @Column({
    type: 'varchar',
    length: 255,
  })
  message!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  timestamp!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
