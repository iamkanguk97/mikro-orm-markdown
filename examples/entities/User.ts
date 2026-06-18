import { Collection, Entity, OneToMany, OneToOne, PrimaryKey, Property } from '@mikro-orm/core';
import type { Post } from './Post.js';
import type { Profile } from './Profile.js';

/**
 * A registered user who can author posts.
 * @namespace Blog
 */
@Entity()
export class User {
  /** Surrogate primary key. */
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Unique login handle. */
  @Property({ type: 'string', unique: true })
  username!: string;

  /** Contact email (unique). */
  @Property({ type: 'string', unique: true })
  email!: string;

  /** When the account was created. */
  @Property({ type: 'datetime' })
  createdAt: Date = new Date();

  /** Optional one-to-one profile; this side owns the foreign key. */
  @OneToOne({ entity: () => 'Profile', owner: true, nullable: true })
  profile?: Profile;

  /** Every post written by this user (zero or more). */
  @OneToMany({ entity: () => 'Post', mappedBy: 'author' })
  posts = new Collection<Post>(this);
}
