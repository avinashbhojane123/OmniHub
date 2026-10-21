import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('movie_bookmarks')
export class MovieBookmark {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'int',
    unique: true,
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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
