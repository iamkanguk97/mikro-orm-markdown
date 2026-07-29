import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the test/ directory. */
export const TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path of the repository root. */
export const REPO_ROOT = path.resolve(TEST_ROOT, '..');

/** Resolves a path under test/fixtures. */
export function fixturePath(...segments: string[]): string {
  return path.join(TEST_ROOT, 'fixtures', ...segments);
}

/** Glob matching the shared fixture entities. */
export const ENTITY_FIXTURES_GLOB = fixturePath('entities', '*.ts');

/** The entity side of the same-class-name source-identity fixture pair. */
export const COLLISION_ENTITY_SOURCE = fixturePath('source-identity', 'entity', 'CollisionEntity.ts');

/** The DTO side of the same-class-name source-identity fixture pair (poisoned JSDoc). */
export const COLLISION_DTO_SOURCE = fixturePath('source-identity', 'dto', 'CollisionEntity.ts');
