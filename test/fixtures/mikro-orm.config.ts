import { SqliteDriver } from '@mikro-orm/sqlite';
import { Author } from './entities/Author.js';
import { Post } from './entities/Post.js';
import { Tag } from './entities/Tag.js';

export default {
  driver: SqliteDriver,
  dbName: ':memory:',
  entities: [Author, Post, Tag],
  debug: false,
};
