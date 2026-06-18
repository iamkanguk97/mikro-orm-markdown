import { Collection, Entity, Formula, ManyToMany, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import type { Tag } from './Tag.js';
import type { User } from './User.js';

/**
 * A blog post written by a user.
 * @namespace Blog
 */
@Entity()
export class Post {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Headline shown in listings. */
  @Property({ type: 'string' })
  title!: string;

  // No JSDoc here on purpose: the @Property `comment` becomes the column
  // description in the generated table (the DDL-comment fallback).
  @Property({ type: 'string', comment: 'One of: draft, published, archived' })
  status: string = 'draft';

  /** Full article body. */
  @Property({ type: 'text', nullable: true, comment: 'Markdown source (ignored — JSDoc wins)' })
  body?: string;

  /** Author of the post (required — non-null relation). */
  @ManyToOne({ entity: () => 'User', nullable: false })
  author!: User;

  /**
   * Tags applied to this post; a post must carry at least one.
   * @atLeastOne
   */
  @ManyToMany({ entity: () => 'Tag', owner: true })
  tags = new Collection<Tag>(this);

  /** Character length of the body, computed in SQL at query time (no physical column). */
  @Formula('LENGTH(body)', { type: 'integer' })
  bodyLength?: number;
}
