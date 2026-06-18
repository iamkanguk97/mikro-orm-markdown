import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import type { Post } from './Post.js';
import type { User } from './User.js';

/**
 * A reader comment on a post, optionally threaded under a parent comment.
 * @namespace Blog
 */
@Entity()
export class Comment {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** The comment text. */
  @Property({ type: 'text' })
  content!: string;

  /** The post being commented on (required). */
  @ManyToOne({ entity: () => 'Post', nullable: false })
  post!: Post;

  /** The commenting user, or null for anonymous guests (nullable relation). */
  @ManyToOne({ entity: () => 'User', nullable: true })
  author?: User;

  /** Parent comment when this is a threaded reply (self-reference). */
  @ManyToOne({ entity: () => Comment, nullable: true })
  parent?: Comment;
}
