import { EntitySchema, MikroORM } from '@mikro-orm/core';
import { SqliteDriver } from '@mikro-orm/sqlite';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEntityMetadata, MetadataLoadError } from '../../src/metadata/load.js';
import config from '../fixtures/mikro-orm.config.js';

describe('loadEntityMetadata', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns EntityMetadata for all fixture entities', async () => {
    const { metas } = await loadEntityMetadata(config);
    const classNames = metas.map((m) => m.className);

    expect(classNames).toContain('Author');
    expect(classNames).toContain('Post');
    expect(classNames).toContain('Tag');
  });

  it('each entity has a tableName', async () => {
    const { metas } = await loadEntityMetadata(config);
    const byName = Object.fromEntries(metas.map((m) => [m.className, m]));

    expect(byName['Author']?.tableName).toBeDefined();
    expect(byName['Post']?.tableName).toBeDefined();
    expect(byName['Tag']?.tableName).toBeDefined();
  });

  it('Author entity has expected properties', async () => {
    const { metas } = await loadEntityMetadata(config);
    const author = metas.find((m) => m.className === 'Author');

    expect(author).toBeDefined();
    const propNames = Object.keys(author!.properties);
    expect(propNames).toContain('id');
    expect(propNames).toContain('name');
    expect(propNames).toContain('email');
    expect(propNames).toContain('posts');
  });

  it('Post.author is a many-to-one relation (owns the FK)', async () => {
    const { metas } = await loadEntityMetadata(config);
    const post = metas.find((m) => m.className === 'Post');

    expect(post).toBeDefined();
    const authorProp = post!.properties['author'];
    expect(authorProp).toBeDefined();
    // MANY_TO_ONE = 1 in MikroORM ReferenceKind enum
    expect(authorProp!.kind).toBe('m:1');
  });

  it('throws MetadataLoadError when no entities are discovered', async () => {
    await expect(loadEntityMetadata({ ...config, entities: [] })).rejects.toBeInstanceOf(MetadataLoadError);
  });

  it('throws a clear error for EntitySchema-defined entities', async () => {
    const schema = new EntitySchema({
      name: 'SchemaUser',
      properties: {
        id: { type: 'number', primary: true },
      },
    });

    await expect(
      loadEntityMetadata({
        driver: SqliteDriver,
        dbName: ':memory:',
        entities: [schema],
      })
    ).rejects.toThrow('EntitySchema-defined entities are not currently supported: SchemaUser.');
  });

  it('throws a clear error for EntitySchema class groups', async () => {
    class GroupedSchemaUser {}

    const schema = new EntitySchema({
      name: 'GroupedSchemaUser',
      properties: {
        id: { type: 'number', primary: true },
      },
    });

    await expect(
      loadEntityMetadata({
        driver: SqliteDriver,
        dbName: ':memory:',
        entities: [{ entity: GroupedSchemaUser, schema }],
      })
    ).rejects.toThrow('EntitySchema-defined entities are not currently supported: GroupedSchemaUser.');
  });

  it('throws a clear error for a class-linked EntitySchema discovered via a glob pattern (not listed directly)', async () => {
    await expect(
      loadEntityMetadata({
        driver: SqliteDriver,
        dbName: ':memory:',
        entities: ['./test/fixtures/entity-schema/*.js'],
      })
    ).rejects.toThrow('EntitySchema-defined entities are not currently supported: Book.');
  });

  it('throws a softer error for a name-only EntitySchema discovered via a glob pattern', async () => {
    await expect(
      loadEntityMetadata({
        driver: SqliteDriver,
        dbName: ':memory:',
        entities: ['./test/fixtures/entity-schema/*.js'],
      })
    ).rejects.toThrow(/Could not confirm these entities are decorator-based @Entity\(\) classes: Publisher\./);
  });

  it('discovers metadata without connecting to the database', async () => {
    const connectSpy = vi.spyOn(SqliteDriver.prototype, 'connect');

    await loadEntityMetadata({ ...config, connect: true });

    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('returns absolute source file paths derived from entity metadata', async () => {
    const { sourcePaths } = await loadEntityMetadata(config);

    expect(sourcePaths.length).toBeGreaterThan(0);
    for (const p of sourcePaths) {
      expect(path.isAbsolute(p)).toBe(true);
    }
    expect(sourcePaths.some((p) => p.endsWith(path.join('fixtures', 'entities', 'Author.ts')))).toBe(true);
  });

  it('retains the normalized source path for each discovered entity class', async () => {
    const { entitySourcePaths } = await loadEntityMetadata(config);
    const authorSource = entitySourcePaths.get('Author');

    expect(authorSource).toBeDefined();
    expect(path.isAbsolute(authorSource!)).toBe(true);
    expect(authorSource).toBe(path.resolve('test/fixtures/entities/Author.ts'));
  });

  it('sourcePaths excludes pivot tables that have no declared file', async () => {
    const { sourcePaths } = await loadEntityMetadata(config);

    expect(sourcePaths.some((p) => p.includes('post_tags'))).toBe(false);
  });

  it('sourcePaths has no duplicates', async () => {
    const { sourcePaths } = await loadEntityMetadata(config);

    expect(sourcePaths.length).toBe(new Set(sourcePaths).size);
  });

  it('preserves the discovery error and attaches every cleanup failure', async () => {
    const discoveryError = new TypeError('metadata discovery failed');
    const metadataCleanupError = new Error('metadata cache close failed');
    const resultCleanupError = new Error('result cache close failed');
    const closeMetadataCache = vi.fn(() => {
      throw metadataCleanupError;
    });
    const closeResultCache = vi.fn().mockRejectedValue(resultCleanupError);

    vi.spyOn(MikroORM, 'init').mockResolvedValue({
      getMetadata: () => ({
        getAll: () => {
          throw discoveryError;
        },
      }),
      config: {
        getMetadataCacheAdapter: () => ({ close: closeMetadataCache }),
        getResultCacheAdapter: () => ({ close: closeResultCache }),
      },
    } as never);

    await expect(loadEntityMetadata(config)).rejects.toBe(discoveryError);
    expect(closeMetadataCache).toHaveBeenCalledOnce();
    expect(closeResultCache).toHaveBeenCalledOnce();

    const descriptor = Object.getOwnPropertyDescriptor(discoveryError, 'cleanupErrors');
    expect(descriptor?.value).toEqual([metadataCleanupError, resultCleanupError]);
    expect(descriptor?.enumerable).toBe(false);
  });

  it('throws an AggregateError containing every cleanup-only failure', async () => {
    class DecoratedEntity {}
    Object.defineProperty(DecoratedEntity, '__path', { value: import.meta.url });

    const metadataCleanupError = new Error('metadata cache close failed');
    const resultCleanupError = new Error('result cache close failed');
    const closeMetadataCache = vi.fn().mockRejectedValue(metadataCleanupError);
    const closeResultCache = vi.fn().mockRejectedValue(resultCleanupError);

    vi.spyOn(MikroORM, 'init').mockResolvedValue({
      getMetadata: () => ({
        getAll: () => ({
          DecoratedEntity: {
            class: DecoratedEntity,
            className: 'DecoratedEntity',
            properties: {},
          },
        }),
      }),
      config: {
        get: () => process.cwd(),
        getMetadataCacheAdapter: () => ({ close: closeMetadataCache }),
        getResultCacheAdapter: () => ({ close: closeResultCache }),
      },
    } as never);

    const failure = await loadEntityMetadata(config).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([metadataCleanupError, resultCleanupError]);
    expect(closeMetadataCache).toHaveBeenCalledOnce();
    expect(closeResultCache).toHaveBeenCalledOnce();
  });
});
