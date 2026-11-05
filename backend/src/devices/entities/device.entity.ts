import * as dotenv from 'dotenv';
dotenv.config();

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({
    type: 'varchar',
    length: 128,
  })
  deviceId!: string;

  @Index()
  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  nickname!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  fcmToken!: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  deviceModel!: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  manufacturer!: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  androidVersion!: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  appVersion!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  keystorePublicKey!: string | null;

  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  keystoreChallenge!: string | null;

  @Column({
    type: 'boolean',
    default: false,
  })
  isBound!: boolean;

  @Column({
    type: (process.env.DB_TYPE === 'better-sqlite3'
      ? 'datetime'
      : 'timestamptz') as any,
    nullable: true,
  })
  lastActive!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

