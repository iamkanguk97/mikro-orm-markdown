import { SqliteDriver } from '@mikro-orm/sqlite';
import { Address } from './entities/Address.js';
import { Animal } from './entities/Animal.js';
import { Author } from './entities/Author.js';
import { Cat } from './entities/Cat.js';
import { Customer } from './entities/Customer.js';
import { Dog } from './entities/Dog.js';
import { Post } from './entities/Post.js';
import { Tag } from './entities/Tag.js';

export default {
  driver: SqliteDriver,
  dbName: ':memory:',
  entities: [Author, Post, Tag, Customer, Address, Animal, Dog, Cat],
  debug: false,
};
