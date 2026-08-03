import type { Options } from '@mikro-orm/core';
import { SqliteDriver } from '@mikro-orm/sqlite';

/** In-memory SQLite Options for metadata-only discovery tests. */
export function inMemorySqliteOptions(entities: NonNullable<Options['entities']>): Options {
  return { driver: SqliteDriver, dbName: ':memory:', entities };
}

/** The MikroORM major a fake MetadataStorage should imitate. */
export type MetadataStorageShape = 'v6' | 'v7';

/**
 * A stand-in for MikroORM's MetadataStorage.
 *
 * `getAll()` returns the container the requested major uses — a plain object on
 * v6, a Map on v7 — while `[Symbol.iterator]` yields the same entities in both,
 * exactly as the real class does. Loading code must go through the iterator, so
 * a v7-shaped storage still surfaces every entity.
 */
export function makeMetadataStorage(metas: readonly unknown[], shape: MetadataStorageShape = 'v6'): unknown {
  const keyed = metas.map((meta) => [(meta as { className: string }).className, meta] as const);

  return {
    getAll: () => (shape === 'v7' ? new Map(keyed) : Object.fromEntries(keyed)),
    [Symbol.iterator]: () => metas[Symbol.iterator](),
  };
}

/** A MetadataStorage whose enumeration fails, for discovery-error paths. */
export function makeFailingMetadataStorage(error: unknown): unknown {
  const fail = (): never => {
    throw error;
  };

  return { getAll: fail, [Symbol.iterator]: fail };
}
