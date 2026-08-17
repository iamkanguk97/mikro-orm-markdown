import type { EntityClass, EntityMetadata, Options } from '@mikro-orm/core';
import { EntitySchema, MetadataStorage, MikroORM } from '@mikro-orm/core';
import { normalizeSourcePath } from '../source-path.js';
import { isRenderableMeta } from './renderable.js';

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
  /**
   * Renderable entities confirmed to be schema-defined (EntitySchema, or
   * MikroORM 7's defineEntity() which is built on it): config-listed instances
   * and EntitySchema.REGISTRY hits. Their metadata renders normally, but JSDoc
   * on the schema declaration is not read yet, so generateMarkdown warns for
   * them instead of silently dropping tags such as @hidden.
   */
  schemaEntityClassNames: Set<string>;
  /**
   * Renderable entities that could not be confirmed as decorator-based
   * @Entity() classes — usually name-only EntitySchema entities, which leave
   * no definitive trace (see identifyDiscoveredSchemaEntities). Treated like
   * schemaEntityClassNames downstream; kept separate because the signal is an
   * inference, not proof.
   */
  unconfirmedEntityClassNames: Set<string>;
}

async function closeDiscoveryResources(orm: MikroORM): Promise<unknown[]> {
  // With connect=false, orm.close() can instantiate SQL clients just to close them.
  const results = await Promise.allSettled([
    Promise.resolve().then(() => orm.config.getMetadataCacheAdapter()?.close?.()),
    Promise.resolve().then(() => orm.config.getResultCacheAdapter()?.close?.()),
  ]);

  return results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
}

function attachCleanupErrors(discoveryError: unknown, cleanupErrors: unknown[]): void {
  const canHaveProperties =
    (typeof discoveryError === 'object' && discoveryError !== null) || typeof discoveryError === 'function';
  if (!canHaveProperties) {
    return;
  }

  try {
    Object.defineProperty(discoveryError, 'cleanupErrors', {
      value: cleanupErrors,
      enumerable: false,
    });
  } catch {
    // A frozen error or defensive Proxy cannot be annotated. Preserve the
    // original discovery failure instead of replacing it with an attachment error.
  }
}

/**
 * Identifies schema entities listed directly in the config, before discovery
 * runs. Needed because a name-only EntitySchema instance leaves no trace that
 * discovery can later confirm (it never appears in EntitySchema.REGISTRY), so
 * the instance in the config array is the only definitive signal for it.
 */
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

/**
 * String entries (globs or file paths) of `entitiesTs`/`entities`. Schema
 * entities often carry no meta.path (v7 never sets it; v6 only under
 * folder/glob discovery), so these config strings are the only route to the
 * files declaring them when their JSDoc must be read. `entitiesTs` wins when
 * it has any strings — it points at original TypeScript sources, where
 * comments survive.
 */
export function collectConfiguredEntitySourceStrings(options: Options): string[] {
  const fromTs = (options.entitiesTs ?? []).filter((entry): entry is string => typeof entry === 'string');
  if (fromTs.length > 0) {
    return fromTs;
  }
  return (options.entities ?? []).filter((entry): entry is string => typeof entry === 'string');
}

/**
 * True when `target` was ever passed through a MikroORM property/class decorator
 * (@Entity, @Property, @PrimaryKey, ...). Every such decorator calls
 * `MetadataStorage.getMetadataFromDecorator`, which stamps a marker onto the
 * class the first time it runs — used here to catch EntitySchema entities that
 * were never decorated at all (see identifyDiscoveredSchemaEntities).
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

/**
 * Identifies EntitySchema entities that collectEntitySchemaNames cannot see:
 * ones discovered via a glob/folder pattern (`entities: ['./src/**\/*.ts']`)
 * rather than listed directly in the config array. MikroORM only reveals the
 * actual EntitySchema instance by dynamically importing the matched files
 * during discovery — after the pre-discovery collection has already run — so
 * this must run on the discovered EntityMetadata[] instead.
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
 *    could look "markerless" too — the reason these names stay in a separate
 *    `unconfirmed` bucket instead of being asserted as schema entities. A
 *    false positive costs only a spurious JSDoc warning downstream, never a
 *    failed generation.
 */
function identifyDiscoveredSchemaEntities(metas: EntityMetadata[]): { confirmed: string[]; unconfirmed: string[] } {
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

  return { confirmed, unconfirmed };
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
  const configListedSchemaNames = collectEntitySchemaNames(options);

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

  let discoveryFailed = false;
  let discoveryError: unknown;

  try {
    // Iterate the storage rather than reading `getAll()`: v6 returns a plain
    // object from it, v7 a Map, so `Object.values()` silently yields nothing on
    // v7 and every entity disappears. `MetadataStorage[Symbol.iterator]` is
    // declared in both majors' typings and yields exactly the same set as
    // `getAll()` in each (v6: `Object.values(this.metadata)`, v7:
    // `this.#metadataMap.values()`), so this is version-agnostic.
    const all = [...orm.getMetadata()];

    if (all.length === 0) {
      throw new MetadataLoadError(
        'No entities were discovered. ' + 'Check that your config specifies at least one entity path or class.'
      );
    }

    const { confirmed, unconfirmed } = identifyDiscoveredSchemaEntities(all);
    const schemaEntityClassNames = new Set([...configListedSchemaNames, ...confirmed]);
    const unconfirmedEntityClassNames = new Set(unconfirmed.filter((name) => !schemaEntityClassNames.has(name)));

    const baseDir = orm.config.get('baseDir');
    const entitySourcePaths = new Map(
      all.filter((meta) => meta.path).map((meta) => [meta.className, normalizeSourcePath(meta.path, baseDir)])
    );
    const sourcePaths = [...new Set(entitySourcePaths.values())];

    return { metas: all, sourcePaths, entitySourcePaths, schemaEntityClassNames, unconfirmedEntityClassNames };
  } catch (error) {
    discoveryFailed = true;
    discoveryError = error;
    throw error;
  } finally {
    const cleanupErrors = await closeDiscoveryResources(orm);
    if (cleanupErrors.length > 0) {
      if (discoveryFailed) {
        attachCleanupErrors(discoveryError, cleanupErrors);
      } else {
        throw new AggregateError(cleanupErrors, 'Failed to close MikroORM discovery cache adapters.');
      }
    }
  }
}
