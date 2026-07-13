import type { EntityClass, EntityMetadata, Options } from '@mikro-orm/core';
import { EntitySchema, MetadataStorage, MikroORM } from '@mikro-orm/core';
import { normalizeSourcePath } from '../source-path.js';

/** Errors thrown during metadata loading */
export class MetadataLoadError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'MetadataLoadError';
  }
}

export interface LoadedEntityMetadata {
  metas: EntityMetadata[];
  /** Absolute paths to the source files each entity class was declared in, deduped. */
  sourcePaths: string[];
  /** Absolute source path for each discovered entity class. */
  entitySourcePaths: Map<string, string>;
}

async function closeDiscoveryResources(orm: MikroORM): Promise<void> {
  // With connect=false, orm.close() can instantiate SQL clients just to close them.
  await orm.config.getMetadataCacheAdapter()?.close?.();
  await orm.config.getResultCacheAdapter()?.close?.();
}

function collectEntitySchemaNames(options: Options): string[] {
  const configuredEntities = [...(options.entities ?? []), ...(options.entitiesTs ?? [])];
  const names: string[] = [];

  for (const entity of configuredEntities) {
    if (entity instanceof EntitySchema) {
      names.push(entity.meta.className);
      continue;
    }

    if (entity !== null && typeof entity === 'object' && 'schema' in entity && entity.schema instanceof EntitySchema) {
      names.push(entity.schema.meta.className);
    }
  }

  return names;
}

function assertNoEntitySchemaEntities(options: Options): void {
  const schemaNames = collectEntitySchemaNames(options);
  if (schemaNames.length === 0) {
    return;
  }

  throw new MetadataLoadError(
    `EntitySchema-defined entities are not currently supported: ${schemaNames.join(', ')}.\n` +
      'Use decorator-based @Entity() classes instead.'
  );
}

/**
 * True when `target` was ever passed through a MikroORM property/class decorator
 * (@Entity, @Property, @PrimaryKey, ...). Every such decorator calls
 * `MetadataStorage.getMetadataFromDecorator`, which stamps a marker onto the
 * class the first time it runs — used here to catch EntitySchema entities that
 * were never decorated at all (see assertDiscoveredEntitiesAreSupported).
 *
 * The marker's name changed between MikroORM versions (verified by diffing
 * @mikro-orm/core release tarballs from npm): `__path` up to 6.2.8, then a
 * `MetadataStorage.PATH_SYMBOL`-keyed property from 6.2.9 onward. Both are
 * checked so this works across the whole >=6.0.0 peer range.
 */
function hasDecoratorMarker(target: EntityClass<unknown>): boolean {
  const pathSymbol = MetadataStorage.PATH_SYMBOL;
  if (typeof pathSymbol === 'symbol' && pathSymbol in target) {
    return true;
  }
  return '__path' in target;
}

/** Entities collectEntitySchemaNames's pre-discovery scan cannot reason about: pivot tables and embeddables are not user-facing entities. */
function isRenderableMeta(meta: EntityMetadata): boolean {
  return !meta.pivotTable && !meta.embeddable;
}

/**
 * Catches EntitySchema entities that assertNoEntitySchemaEntities cannot see:
 * ones discovered via a glob/folder pattern (`entities: ['./src/**\/*.ts']`)
 * rather than listed directly in the config array. MikroORM only reveals the
 * actual EntitySchema instance by dynamically importing the matched files
 * during discovery — after the pre-discovery guard has already run — so this
 * must run on the discovered EntityMetadata[] instead.
 *
 * Two signals, in order of confidence:
 *
 * 1. `EntitySchema.REGISTRY` — definitive proof. A class-linked EntitySchema
 *    (`new EntitySchema({ class: Book, ... })`) registers `Book` here; internal
 *    per-discovery copies MikroORM makes for decorator-based entities are
 *    marked `internal: true` and are never registered. No false positives are
 *    structurally possible.
 * 2. Decorator marker absence — an inference, not proof. A name-only
 *    EntitySchema (`new EntitySchema({ name: 'Publisher', ... })`, no `class:`
 *    link) is never registered in (1) either, since there is no user class to
 *    register against. The only signal left is that it never went through a
 *    decorator. If some future MikroORM release changes the marker mechanism
 *    again (it has happened once before, at 6.2.9), a validly decorated entity
 *    could look "markerless" too — so this case still throws (the project's
 *    policy is to reject EntitySchema outright, not just warn), but with a
 *    softer message that invites a bug report instead of asserting certainty.
 */
function assertDiscoveredEntitiesAreSupported(metas: EntityMetadata[]): void {
  const confirmed: string[] = [];
  const unconfirmed: string[] = [];

  for (const meta of metas) {
    if (!isRenderableMeta(meta)) {
      continue;
    }
    if (EntitySchema.REGISTRY.has(meta.class)) {
      confirmed.push(meta.className);
    } else if (!hasDecoratorMarker(meta.class)) {
      unconfirmed.push(meta.className);
    }
  }

  if (confirmed.length === 0 && unconfirmed.length === 0) {
    return;
  }

  const lines: string[] = [];
  if (confirmed.length > 0) {
    lines.push(`EntitySchema-defined entities are not currently supported: ${confirmed.join(', ')}.`);
  }
  if (unconfirmed.length > 0) {
    lines.push(
      `Could not confirm these entities are decorator-based @Entity() classes: ${unconfirmed.join(', ')}. ` +
        'This usually means they are EntitySchema-defined entities (also not currently supported). ' +
        "If you're certain these are valid @Entity() classes, this may be a detection false positive in " +
        'mikro-orm-markdown — please open an issue: https://github.com/iamkanguk97/mikro-orm-markdown/issues'
    );
  }
  lines.push('Use decorator-based @Entity() classes instead.');

  throw new MetadataLoadError(lines.join('\n'));
}

/**
 * Runs MikroORM entity discovery without connecting to the database,
 * and returns all discovered EntityMetadata objects along with the
 * absolute source file paths they were declared in (for JSDoc extraction).
 *
 * The caller is responsible for filtering (e.g. excluding abstract,
 * embeddable, or pivot entities) based on rendering needs.
 */
export async function loadEntityMetadata(options: Options): Promise<LoadedEntityMetadata> {
  assertNoEntitySchemaEntities(options);

  let orm: MikroORM;
  try {
    orm = await MikroORM.init({
      ...options,
      debug: false,
      connect: false,
      // Always disable the metadata cache for one-shot doc runs so the project
      // is never littered with a temp/ folder, regardless of how metadataProvider
      // was configured.
      metadataCache: { ...options.metadataCache, enabled: false },
    });
  } catch (cause) {
    throw new MetadataLoadError(
      'Failed to initialize MikroORM and run entity discovery. ' +
        'Make sure your config is valid and all entity files are accessible.',
      cause
    );
  }

  try {
    const all = Object.values(orm.getMetadata().getAll());

    if (all.length === 0) {
      throw new MetadataLoadError(
        'No entities were discovered. ' + 'Check that your config specifies at least one entity path or class.'
      );
    }

    assertDiscoveredEntitiesAreSupported(all);

    const baseDir = orm.config.get('baseDir');
    const entitySourcePaths = new Map(
      all.filter((meta) => meta.path).map((meta) => [meta.className, normalizeSourcePath(meta.path, baseDir)])
    );
    const sourcePaths = [...new Set(entitySourcePaths.values())];

    return { metas: all, sourcePaths, entitySourcePaths };
  } finally {
    await closeDiscoveryResources(orm);
  }
}
