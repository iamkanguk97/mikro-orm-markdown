import { SqliteDriver } from '@mikro-orm/sqlite';
import { Member } from './entities/Member.js';
import { Project } from './entities/Project.js';
import { Team } from './entities/Team.js';

// In-memory SQLite is enough for documentation generation: the tool only reads
// entity metadata and never connects to the database.
export default {
  driver: SqliteDriver,
  dbName: ':memory:',
  entities: [Team, Member, Project],
  debug: false,
};
