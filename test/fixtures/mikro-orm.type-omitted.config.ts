import { SqliteDriver } from '@mikro-orm/sqlite';
import { UserWithImplicitTypes } from './type-omitted/UserWithImplicitTypes.js';

export default {
  driver: SqliteDriver,
  dbName: ':memory:',
  entities: [UserWithImplicitTypes],
  debug: false,
};
