import { ReflectMetadataProvider } from '@mikro-orm/core';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { Account } from './entities/Account.js';
import { Session } from './entities/Session.js';

// In-memory SQLite is enough for documentation generation: the tool only reads
// entity metadata and never connects to the database.
// FeatureFlag is listed as a source path on purpose: JSDoc on a schema
// declaration binds only when the config points at the file it lives in.
// Every property declares an explicit type, so the decorator-based
// ReflectMetadataProvider is enough and the TsMorph provider (which cannot
// analyse EntitySchema declarations) is never auto-injected.
export default {
  driver: SqliteDriver,
  dbName: ':memory:',
  metadataProvider: ReflectMetadataProvider,
  entities: [Account, Session, './entities/FeatureFlag.ts'],
  debug: false,
};
