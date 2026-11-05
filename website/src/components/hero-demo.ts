// Entity sources for the home demo: the same Post/Author model written in each way
// MikroORM can define entities. Every variant was run through the real CLI and
// produces exactly ERD_SOURCE's diagram (only `direction LR` is added, so the boxes
// sit side by side in the demo pane). Imports are left out to keep the panes short.

export interface DefinitionStyle {
  id: string;
  label: { en: string; ko: string };
  post: string;
  author: string;
}

const CLASS_POST = `/**
 * Blog post authored by a registered user.
 * @namespace Blog
 */
@Entity()
export class Post {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Post title */
  @Property({ type: 'string' })
  title!: string;

  @Property({ type: 'text', nullable: true })
  body?: string;

  @ManyToOne({ entity: () => Author })
  author!: Author;
}`;

const CLASS_AUTHOR = `/**
 * Registered user who writes posts.
 * @namespace Blog
 */
@Entity()
export class Author {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  @Property({ type: 'string' })
  name!: string;

  @Property({ type: 'string', unique: true })
  email!: string;
}`;

const SCHEMA_POST = `/**
 * Blog post authored by a registered user.
 * @namespace Blog
 */
export const PostSchema = new EntitySchema({
  name: 'Post',
  properties: {
    id: { type: 'integer', primary: true },
    /** Post title */
    title: { type: 'string' },
    body: { type: 'text', nullable: true },
    author: { kind: 'm:1', entity: 'Author' },
  },
});`;

const SCHEMA_AUTHOR = `/**
 * Registered user who writes posts.
 * @namespace Blog
 */
export const AuthorSchema = new EntitySchema({
  name: 'Author',
  properties: {
    id: { type: 'integer', primary: true },
    name: { type: 'string' },
    email: { type: 'string', unique: true },
  },
});`;

const DEFINE_POST = `/**
 * Blog post authored by a registered user.
 * @namespace Blog
 */
export const PostSchema = defineEntity({
  name: 'Post',
  properties: (p) => ({
    id: p.integer().primary(),
    /** Post title */
    title: p.string(),
    body: p.text().nullable(),
    author: () => p.manyToOne(AuthorSchema),
  }),
});`;

const DEFINE_AUTHOR = `/**
 * Registered user who writes posts.
 * @namespace Blog
 */
export const AuthorSchema = defineEntity({
  name: 'Author',
  properties: (p) => ({
    id: p.integer().primary(),
    name: p.string(),
    email: p.string().unique(),
  }),
});`;

export const DEFINITION_STYLES: readonly DefinitionStyle[] = [
  { id: 'class', label: { en: 'Decorators', ko: '데코레이터' }, post: CLASS_POST, author: CLASS_AUTHOR },
  { id: 'entity-schema', label: { en: 'EntitySchema', ko: 'EntitySchema' }, post: SCHEMA_POST, author: SCHEMA_AUTHOR },
  {
    id: 'define-entity',
    label: { en: 'defineEntity()', ko: 'defineEntity()' },
    post: DEFINE_POST,
    author: DEFINE_AUTHOR,
  },
];

export const STYLE_SWITCH_LABEL = { en: 'Define entities with', ko: '엔티티 정의 방식' };

export const ERD_SOURCE = `erDiagram
  direction LR
  Post {
    integer id PK
    string title
    string body
    integer author_id
  }
  Author {
    integer id PK
    string name
    string email UK
  }
  Post }o--|| Author : "author"`;
