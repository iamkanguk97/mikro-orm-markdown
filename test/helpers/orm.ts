import type { Options } from '@mikro-orm/core';
import { SqliteDriver } from '@mikro-orm/sqlite';

/** In-memory SQLite Options for metadata-only discovery tests. */
export function inMemorySqliteOptions(entities: NonNullable<Options['entities']>): Options {
  return { driver: SqliteDriver, dbName: ':memory:', entities };
}
