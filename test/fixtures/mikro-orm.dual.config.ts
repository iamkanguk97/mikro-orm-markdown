import { SqliteDriver } from '@mikro-orm/sqlite';

export default {
  driver: SqliteDriver,
  dbName: ':memory:',
  entities: ['./dist/does-not-exist/**/*.js'],
  entitiesTs: ['./test/fixtures/dual-entities/*.ts'],
  debug: false,
};
