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

  it('sourcePaths excludes pivot tables that have no declared file', async () => {
    const { sourcePaths } = await loadEntityMetadata(config);

    expect(sourcePaths.some((p) => p.includes('post_tags'))).toBe(false);
  });

  it('sourcePaths has no duplicates', async () => {
    const { sourcePaths } = await loadEntityMetadata(config);

    expect(sourcePaths.length).toBe(new Set(sourcePaths).size);
  });
});
