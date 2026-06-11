import { Collection, Entity, ManyToMany, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import type { Author } from './Author.js';
import type { Tag } from './Tag.js';

/**
 * 블로그 게시글
 * @namespace Blog
 */
@Entity()
export class Post {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** 게시글 제목 */
  @Property({ type: 'string' })
  title!: string;

  /** 게시글 본문 */
  @Property({ type: 'text', nullable: true })
  body?: string;

  /** 작성자 */
  @ManyToOne({ entity: () => 'Author', nullable: false })
  author!: Author;

  @ManyToMany({ entity: () => 'Tag', owner: true })
  tags = new Collection<Tag>(this);
}
