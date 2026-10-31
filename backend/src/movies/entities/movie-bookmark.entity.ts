import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('movie_bookmarks')
@Index(['tmdbId', 'isTv'])
@Index(['userId', 'tmdbId', 'isTv'])
export class MovieBookmark {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  userId!: string | null;

  @Column({
    type: 'int',
  })
  tmdbId!: number;

  @Column({
    type: 'varchar',
    length: 255,
  })
  title!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  overview!: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  posterPath!: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  backdropPath!: string | null;

  @Column({
    type: 'float',
    default: 0,
  })
  voteAverage!: number;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  releaseDate!: string | null;

  @Column({
    type: 'simple-array',
    nullable: true,
  })
  genres!: string[] | null;

  @Column({
    type: 'int',
    default: 0,
  })
  runtime!: number;

  @Column({
    type: 'boolean',
    default: false,
  })
  isWatched!: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  isTv!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
