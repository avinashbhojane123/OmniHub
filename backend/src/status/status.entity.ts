import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { Room } from '../rooms/room.entity';

@Entity('statuses')
export class Status {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: 'varchar',
    length: 50,
  })
  nickname!: string;

  @ManyToOne(() => Room, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'roomId',
  })
  room!: Room;

  @Index()
  @Column()
  roomId!: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'text',
  })
  type!: 'text' | 'image' | 'video';

  @Column({
    type: 'text',
    nullable: true,
  })
  content!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  mediaUrl!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  bgColor!: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  fontStyle!: string | null;

  @Column({
    type: (process.env.DB_TYPE === 'better-sqlite3' ? 'simple-json' : 'jsonb') as any,
    nullable: true,
    default: null,
  })
  stickers!: Array<{ id: number; emoji: string }> | null;

  @Column({
    type: (process.env.DB_TYPE === 'better-sqlite3' ? 'simple-json' : 'jsonb') as any,
    nullable: true,
    default: '[]',
  })
  viewers!: string[] | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({
    type: (process.env.DB_TYPE === 'better-sqlite3' ? 'datetime' : 'timestamptz') as any,
    nullable: true,
  })
  expiresAt!: Date | null;
}
