import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { User } from '../users/user.entity';
import { Message } from '../messages/message.entity';

@Entity('rooms')
export class Room {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    unique: true,
    length: 50,
  })
  passcode!: string;

  @Column({
    nullable: true,
    length: 100,
  })
  roomName!: string;

  @Column({
    default: true,
  })
  isActive!: boolean;

  @Column({
    type: 'int',
    nullable: true,
    default: null,
  })
  pinnedMessageId!: number | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    default: 'wa-doodle',
  })
  theme!: string | null;

  @Column({
    type: 'text',
    nullable: true,
    default: null,
  })
  customWallpaper!: string | null;

  @OneToMany(() => User, (user) => user.room)
  users!: User[];

  @OneToMany(() => Message, (message) => message.room)
  messages!: Message[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
