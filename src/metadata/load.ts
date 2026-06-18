import * as path from 'node:path';
import type { EntityMetadata, Options } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/core';

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
  let orm: MikroORM;
  try {
    orm = await MikroORM.init({
      ...options,
      debug: false,
      connect: false,
    });
  } catch (cause) {
    throw new MetadataLoadError(
      'Failed to initialize MikroORM and run entity discovery. ' +
        'Make sure your config is valid and all entity files are accessible.',
      cause
    );
  }

  const all = Object.values(orm.getMetadata().getAll());

  if (all.length === 0) {
    throw new MetadataLoadError(
      'No entities were discovered. ' + 'Check that your config specifies at least one entity path or class.'
    );
  }

  const baseDir = orm.config.get('baseDir');
  const sourcePaths = [...new Set(all.filter((m) => m.path).map((m) => path.resolve(baseDir, m.path)))];

  return { metas: all, sourcePaths };
}
