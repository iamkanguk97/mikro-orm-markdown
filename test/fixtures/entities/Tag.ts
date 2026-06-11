import { Collection, Entity, ManyToMany, PrimaryKey, Property } from '@mikro-orm/core';
import type { Post } from './Post.js';

/** 게시글 태그 */
@Entity()
export class Tag {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** 태그 이름 */
  @Property({ type: 'string', unique: true })
  label!: string;

  @ManyToMany({ entity: () => 'Post', mappedBy: 'tags' })
  posts = new Collection<Post>(this);
}
