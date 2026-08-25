import { SqliteDriver } from '@mikro-orm/sqlite';
import { Account } from './entities/Account.js';
import { FeatureFlagSchema } from './entities/FeatureFlag.js';
import { Session } from './entities/Session.js';

// In-memory SQLite is enough for documentation generation: the tool only reads
// entity metadata and never connects to the database.
export default {
  driver: SqliteDriver,
  dbName: ':memory:',
  entities: [Account, Session, FeatureFlagSchema],
  debug: false,
};
