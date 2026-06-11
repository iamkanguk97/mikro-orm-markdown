import { describe, expect, it } from 'vitest';
import { MetadataLoadError, loadEntityMetadata } from '../../src/metadata/load.js';
import config from '../fixtures/mikro-orm.config.js';

describe('loadEntityMetadata', () => {
  it('returns EntityMetadata for all fixture entities', async () => {
    const metas = await loadEntityMetadata(config);
    const classNames = metas.map((m) => m.className);

    expect(classNames).toContain('Author');
    expect(classNames).toContain('Post');
    expect(classNames).toContain('Tag');
  });

  it('each entity has a tableName', async () => {
    const metas = await loadEntityMetadata(config);
    const byName = Object.fromEntries(metas.map((m) => [m.className, m]));

    expect(byName['Author']?.tableName).toBeDefined();
    expect(byName['Post']?.tableName).toBeDefined();
    expect(byName['Tag']?.tableName).toBeDefined();
  });

  it('Author entity has expected properties', async () => {
    const metas = await loadEntityMetadata(config);
    const author = metas.find((m) => m.className === 'Author');

    expect(author).toBeDefined();
    const propNames = Object.keys(author!.properties);
    expect(propNames).toContain('id');
    expect(propNames).toContain('name');
    expect(propNames).toContain('email');
    expect(propNames).toContain('posts');
  });

  it('Post.author is a many-to-one relation (owns the FK)', async () => {
    const metas = await loadEntityMetadata(config);
    const post = metas.find((m) => m.className === 'Post');

    expect(post).toBeDefined();
    const authorProp = post!.properties['author'];
    expect(authorProp).toBeDefined();
    // MANY_TO_ONE = 1 in MikroORM ReferenceKind enum
    expect(authorProp!.kind).toBe('m:1');
  });

  it('throws MetadataLoadError when no entities are discovered', async () => {
    await expect(loadEntityMetadata({ ...config, entities: [] })).rejects.toBeInstanceOf(
      MetadataLoadError,
    );
  });
});
