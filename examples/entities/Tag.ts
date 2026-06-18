import { Collection, Entity, ManyToMany, PrimaryKey, Property } from '@mikro-orm/core';
import type { Post } from './Post.js';

/**
 * A label that can be attached to many posts.
 * @namespace Blog
 */
@Entity()
export class Tag {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Unique, human-readable tag name. */
  @Property({ type: 'string', unique: true })
  label!: string;

  /** Posts carrying this tag (inverse side of the many-to-many). */
  @ManyToMany({ entity: () => 'Post', mappedBy: 'tags' })
  posts = new Collection<Post>(this);
}
