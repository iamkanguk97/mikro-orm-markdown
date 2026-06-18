import { Entity, OneToOne, PrimaryKey, Property } from '@mikro-orm/core';
import type { User } from './User.js';

/**
 * Extended profile information for a user.
 * @namespace Blog
 */
@Entity()
export class Profile {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Free-form biography. */
  @Property({ type: 'text', nullable: true })
  bio?: string;

  /** URL of the avatar image. */
  @Property({ type: 'string', nullable: true })
  avatarUrl?: string;

  /** The owning user (inverse side — no foreign key column here). */
  @OneToOne({ entity: () => 'User', mappedBy: 'profile' })
  user!: User;
}
