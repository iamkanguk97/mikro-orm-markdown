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

/**
 * Runs MikroORM entity discovery without connecting to the database,
 * and returns all discovered EntityMetadata objects.
 *
 * The caller is responsible for filtering (e.g. excluding abstract,
 * embeddable, or pivot entities) based on rendering needs.
 */
export async function loadEntityMetadata(options: Options): Promise<EntityMetadata[]> {
  let orm: MikroORM | undefined;

  try {
    orm = await MikroORM.init({
      ...options,
      debug: false,
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

    return all;
  } finally {
    await orm.close(true);
  }
}
