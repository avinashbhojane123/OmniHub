import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('tasks')
export class TaskEntity {
  @PrimaryColumn('varchar', { length: 100 })
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  seriesId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 30, nullable: true })
  date!: string | null; // YYYY-MM-DD or null for Backlog

  @Column({ type: 'varchar', length: 10, nullable: true })
  startTime!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  endTime!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'medium' })
  priority!: string; // 'low' | 'medium' | 'high'

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  categoryId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 30, default: 'pending' })
  status!: string; // 'pending' | 'in_progress' | 'completed' | 'cancelled'

  @Column({ type: 'text', nullable: true })
  recurrenceRule!: string | null; // Serialized JSON

  @Column({ type: 'int', default: 0 })
  reminderMinutes!: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  snoozeUntil!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'boolean', default: false })
  isLoudAlarm!: boolean;

  @Column({ type: 'boolean', default: false })
  isOvernight!: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  eisenhowerQuadrant!: string | null; // 'q1' | 'q2' | 'q3' | 'q4'

  @Column({ type: 'varchar', length: 30, nullable: true })
  accentColor!: string | null;

  @Column({ type: 'int', nullable: true })
  estimatedMinutes!: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  completedAt!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
