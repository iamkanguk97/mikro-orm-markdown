import { Collection, Entity, OneToMany, PrimaryKey, Property } from '@mikro-orm/core';
import type { Post } from './Post.js';

/** 글 작성자 */
@Entity()
export class Author {
  /** 기본키 */
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** 작성자 이름 */
  @Property({ type: 'string' })
  name!: string;

  /** 이메일 주소 */
  @Property({ type: 'string', unique: true })
  email!: string;

  @OneToMany({ entity: () => 'Post', mappedBy: 'author' })
  posts = new Collection<Post>(this);
}
