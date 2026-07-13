import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Entity, type EntityClass, MetadataStorage, PrimaryKey, Property } from '@mikro-orm/core';
import { MariaDbDriver } from '@mikro-orm/mariadb';
import { MySqlDriver } from '@mikro-orm/mysql';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMarkdown, resolveJsDocSources, StructuredError, type StructuredMessage } from '../../src/index.js';
import config from '../fixtures/mikro-orm.config.js';
import typeOmittedConfig from '../fixtures/mikro-orm.type-omitted.config.js';
import { CollisionEntity } from '../fixtures/source-identity/entity/CollisionEntity.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const COLLISION_ENTITY_SOURCE = path.resolve(TEST_DIR, '../fixtures/source-identity/entity/CollisionEntity.ts');
const COLLISION_DTO_SOURCE = path.resolve(TEST_DIR, '../fixtures/source-identity/dto/CollisionEntity.ts');
const COMPILED_IDENTITY_SOURCE = path.resolve(
  TEST_DIR,
  '../fixtures/source-identity/compiled/CompiledIdentityEntity.ts'
);
const COMPILED_IDENTITY_DUPLICATE = path.resolve(
  TEST_DIR,
  '../fixtures/source-identity/compiled-duplicate/CompiledIdentityEntity.ts'
);

function createCompiledIdentityEntity(metadataPath: string): EntityClass<object> {
  class CompiledIdentityEntity {}
  Object.defineProperty(CompiledIdentityEntity, MetadataStorage.PATH_SYMBOL, {
    value: metadataPath,
    writable: true,
  });
  Entity()(CompiledIdentityEntity);
  PrimaryKey({ type: 'integer' })(CompiledIdentityEntity.prototype, 'id');
  Property({ type: 'string' })(CompiledIdentityEntity.prototype, 'name');
  return CompiledIdentityEntity;
}

const sqlDriverSmokeCases = [
  ['SQLite', SqliteDriver, ':memory:'],
  ['PostgreSQL', PostgreSqlDriver, 'mikro_orm_markdown_test'],
  ['MySQL', MySqlDriver, 'mikro_orm_markdown_test'],
  ['MariaDB', MariaDbDriver, 'mikro_orm_markdown_test'],
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateMarkdown', () => {
  it('returns a non-empty markdown string', async () => {
    const md = await generateMarkdown({
      orm: config,
      title: 'Integration Test',
    });
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });

  it('includes the provided title as H1', async () => {
    const md = await generateMarkdown({ orm: config, title: 'My Schema' });
    expect(md.startsWith('# My Schema')).toBe(true);
  });

  it('defaults title to "Database Schema" when not provided', async () => {
    const md = await generateMarkdown({ orm: config });
    expect(md.startsWith('# Database Schema')).toBe(true);
  });

  it('generates valid-looking Mermaid blocks', async () => {
    const md = await generateMarkdown({ orm: config });
    expect(md).toContain('```mermaid');
    expect(md).toContain('erDiagram');
    expect(md).toContain('```');
  });

  it('automatically derives JSDoc namespaces from entity source files without extra config', async () => {
    const md = await generateMarkdown({ orm: config, title: 'Auto JSDoc' });
    expect(md).toContain('## Blog');
    expect(md).toContain('### Author');
    expect(md).toContain('> 글 작성자');
  });

  it('renders description paragraph below the H1 title', async () => {
    const md = await generateMarkdown({
      orm: config,
      title: 'T',
      description: '주문 도메인 스키마입니다.',
    });
    expect(md).toContain('주문 도메인 스키마입니다.');
    const titleIndex = md.indexOf('# T');
    const descIndex = md.indexOf('주문 도메인 스키마입니다.');
    expect(descIndex).toBeGreaterThan(titleIndex);
  });

  it('auto-applies TsMorphMetadataProvider via programmatic API when no metadataProvider is set', async () => {
    const { TsMorphMetadataProvider } = await import('@mikro-orm/reflection');

    // This fixture intentionally omits @Property({ type: ... }); discovery only
    // succeeds when generateMarkdown injects TsMorphMetadataProvider.
    const md = await generateMarkdown({ orm: typeOmittedConfig, title: 'API Provider Test' });
    expect(md.startsWith('# API Provider Test')).toBe(true);
    expect(md).toContain('| name | string |');

    // Calling generateMarkdown with an already-set metadataProvider must be a no-op.
    const configWithProvider = { ...typeOmittedConfig, metadataProvider: TsMorphMetadataProvider };
    const md2 = await generateMarkdown({ orm: configWithProvider, title: 'API Provider Test 2' });
    expect(md2.startsWith('# API Provider Test 2')).toBe(true);
    expect(md2).toContain('| name | string |');
  });

  it('falls back to the default provider for explicit-type runtime entities when TsMorph has no source file', async () => {
    class RuntimeJsUser {}
    Entity()(RuntimeJsUser);
    PrimaryKey({ type: 'integer' })(RuntimeJsUser.prototype, 'id');
    Property({ type: 'string' })(RuntimeJsUser.prototype, 'name');

    const md = await generateMarkdown({
      orm: {
        driver: SqliteDriver,
        dbName: ':memory:',
        entities: [RuntimeJsUser],
      },
      title: 'Runtime JS',
    });

    expect(md.startsWith('# Runtime JS')).toBe(true);
    expect(md).toContain('### RuntimeJsUser');
    expect(md).toContain('| name | string |');
  });

  it.each(
    sqlDriverSmokeCases
  )('generates markdown from %s metadata without a live database connection', async (name, driver, dbName) => {
    const connectSpy = vi.spyOn(driver.prototype, 'connect');

    const md = await generateMarkdown({
      orm: {
        ...config,
        driver,
        dbName,
      },
      title: `${name} Driver Smoke`,
    });

    expect(connectSpy).not.toHaveBeenCalled();
    expect(md.startsWith(`# ${name} Driver Smoke`)).toBe(true);
    expect(md).toContain('```mermaid');
    expect(md).toContain('erDiagram');
    expect(md).toContain('### Author');
    expect(md).toContain('### Post');
    expect(md).toContain('| name |');
    expect(md).toContain('Post }|--|| Author : "author"');
  });

  it('rejects explicit src paths that match no source files', async () => {
    const pending = generateMarkdown({
      orm: config,
      src: ['./test/fixtures/entities/no-match-*.ts'],
    });

    await expect(pending).rejects.toThrow('No source files matched the explicit src paths');
    await expect(pending).rejects.toBeInstanceOf(StructuredError);
    await expect(pending).rejects.toMatchObject({
      structured: { title: 'No JSDoc sources matched the explicit src paths' },
    });
  });

  it('rejects explicit src paths that omit discovered entity declarations', async () => {
    const pending = generateMarkdown({
      orm: config,
      src: ['./test/fixtures/entities/Author.ts'],
    });

    await expect(pending).rejects.toThrow(
      'Explicit src paths did not include source declarations for discovered entities'
    );
    await expect(pending).rejects.toBeInstanceOf(StructuredError);
    await expect(pending).rejects.toMatchObject({
      structured: { title: 'Entities missing from the explicit src paths' },
    });
  });

  it('does not let a same-named DTO satisfy explicit src coverage for a TypeScript entity', async () => {
    const pending = generateMarkdown({
      orm: {
        driver: SqliteDriver,
        dbName: ':memory:',
        entities: [CollisionEntity],
      },
      src: [COLLISION_DTO_SOURCE],
    });

    await expect(pending).rejects.toBeInstanceOf(StructuredError);
    await expect(pending).rejects.toMatchObject({
      structured: { title: 'Entities missing from the explicit src paths' },
    });
    await expect(pending).rejects.toThrow('CollisionEntity');
  });

  it('binds the exact normalized TypeScript entity source and ignores same-named DTO JSDoc', async () => {
    const entitySourceWithParentSegment = `${path.dirname(COLLISION_ENTITY_SOURCE)}${path.sep}..${path.sep}entity${path.sep}CollisionEntity.ts`;

    const md = await generateMarkdown({
      orm: {
        driver: SqliteDriver,
        dbName: ':memory:',
        entities: [CollisionEntity],
      },
      src: [entitySourceWithParentSegment, COLLISION_DTO_SOURCE],
    });

    expect(md).toContain('## EntityNamespace');
    expect(md).toContain('### CollisionEntity');
    expect(md).toContain('> Entity source description');
    expect(md).toContain('| name | string |  |  | Entity name description |');
    expect(md).not.toContain('DtoNamespace');
    expect(md).not.toContain('DtoErdNamespace');
    expect(md).not.toContain('DtoDescribeNamespace');
    expect(md).not.toContain('DTO poison description');
    expect(md).not.toContain('DTO poison property description');
  });

  it('uses the sole class-name candidate when compiled JavaScript metadata points to an explicit TypeScript src', async () => {
    const CompiledIdentityEntity = createCompiledIdentityEntity('/virtual/dist/CompiledIdentityEntity.js');

    const md = await generateMarkdown({
      orm: {
        driver: SqliteDriver,
        dbName: ':memory:',
        entities: [CompiledIdentityEntity],
      },
      src: [COMPILED_IDENTITY_SOURCE],
    });

    expect(md).toContain('## CompiledSourceNamespace');
    expect(md).toContain('> Compiled source description');
    expect(md).toContain('Compiled source name description');
  });

  it('uses the sole TypeScript candidate for extensionless bundled metadata', async () => {
    const CompiledIdentityEntity = createCompiledIdentityEntity('/virtual/bundle/CompiledIdentityEntity');

    const md = await generateMarkdown({
      orm: {
        driver: SqliteDriver,
        dbName: ':memory:',
        entities: [CompiledIdentityEntity],
      },
      src: [COMPILED_IDENTITY_SOURCE],
    });

    expect(md).toContain('## CompiledSourceNamespace');
    expect(md).toContain('> Compiled source description');
    expect(md).toContain('Compiled source name description');
  });

  it('keeps the structured coverage error when no TypeScript declaration matches a compiled entity', async () => {
    const CompiledIdentityEntity = createCompiledIdentityEntity('/virtual/dist/missing/CompiledIdentityEntity.js');

    const pending = generateMarkdown({
      orm: {
        driver: SqliteDriver,
        dbName: ':memory:',
        entities: [CompiledIdentityEntity],
      },
      src: [COLLISION_DTO_SOURCE],
    });

    await expect(pending).rejects.toBeInstanceOf(StructuredError);
    await expect(pending).rejects.toMatchObject({
      structured: { title: 'Entities missing from the explicit src paths' },
    });
    await expect(pending).rejects.toThrow('CompiledIdentityEntity');
  });

  it('rejects multiple same-named TypeScript candidates for compiled JavaScript metadata', async () => {
    const CompiledIdentityEntity = createCompiledIdentityEntity('/virtual/dist/ambiguous/CompiledIdentityEntity.js');

    const pending = generateMarkdown({
      orm: {
        driver: SqliteDriver,
        dbName: ':memory:',
        entities: [CompiledIdentityEntity],
      },
      src: [COMPILED_IDENTITY_SOURCE, COMPILED_IDENTITY_DUPLICATE],
    });

    await expect(pending).rejects.toBeInstanceOf(StructuredError);
    await expect(pending).rejects.toMatchObject({
      structured: {
        title: 'Ambiguous JSDoc source declarations',
        detail: expect.stringContaining('CompiledIdentityEntity'),
        fix: expect.stringContaining('--src'),
      },
    });
    await expect(pending).rejects.toThrow(COMPILED_IDENTITY_SOURCE);
    await expect(pending).rejects.toThrow(COMPILED_IDENTITY_DUPLICATE);
  });
});

describe('resolveJsDocSources', () => {
  it('prefers explicit src paths over discovered source paths', () => {
    const onWarn = vi.fn();
    const result = resolveJsDocSources(['/build/User.js'], ['./src/**/*.ts'], onWarn);
    expect(result).toEqual(['./src/**/*.ts']);
    expect(onWarn).not.toHaveBeenCalled();
  });

  it('warns when entities were discovered from compiled JavaScript and no src is given', () => {
    const onWarn = vi.fn();
    const result = resolveJsDocSources(['/build/User.js', '/build/Post.cjs'], undefined, onWarn);
    expect(result).toEqual(['/build/User.js', '/build/Post.cjs']);
    expect(onWarn).toHaveBeenCalledOnce();
    expect(String(onWarn.mock.calls[0]?.[0])).toContain('--src');
  });

  it('passes a structured warning alongside the flat message to two-parameter handlers', () => {
    const calls: [string, StructuredMessage | undefined][] = [];
    resolveJsDocSources(['/build/User.js'], undefined, (message, warning) => {
      calls.push([message, warning]);
    });

    expect(calls).toHaveLength(1);
    const [message, warning] = calls[0] ?? ['', undefined];
    expect(warning).toMatchObject({ title: 'JSDoc source unavailable' });
    expect(warning?.impact).toContain('Hidden entities may be exposed in the generated document.');
    expect(warning?.fix).toContain('--src');
    // The flat message stays self-contained: it carries the detail, impact, and fix.
    expect(message).toContain(warning?.detail);
    expect(message).toContain(warning?.fix);
  });

  it('passes only the flat message to variadic handlers like console.warn', () => {
    const calls: unknown[][] = [];
    resolveJsDocSources(['/build/User.js'], undefined, (...args: unknown[]) => {
      calls.push(args);
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
    expect(String(calls[0]?.[0])).toContain('--src');
  });

  it('does not warn when discovered sources are TypeScript files', () => {
    const onWarn = vi.fn();
    const result = resolveJsDocSources(['/src/User.ts'], undefined, onWarn);
    expect(result).toEqual(['/src/User.ts']);
    expect(onWarn).not.toHaveBeenCalled();
  });
});
