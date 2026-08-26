import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Entity,
  type EntityClass,
  EntitySchema,
  Formula,
  MetadataStorage,
  PrimaryKey,
  Property,
  ReflectMetadataProvider,
} from '@mikro-orm/core';
import { MariaDbDriver } from '@mikro-orm/mariadb';
import { MySqlDriver } from '@mikro-orm/mysql';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { describe, expect, it, vi } from 'vitest';
import { generateMarkdown, resolveJsDocSources, StructuredError, type StructuredMessage } from '../../src/index.js';
import { MetadataLoadError } from '../../src/metadata/load.js';
import { CoverageAddress, UnusedCoverageAddress } from '../fixtures/embeddable-coverage/Address.js';
import {
  ErdOnlyEmbeddedOwner,
  HiddenEmbeddedOwner,
  PlainCoverageEntity,
  VisibleEmbeddedOwner,
} from '../fixtures/embeddable-coverage/Owners.js';
import config from '../fixtures/mikro-orm.config.js';
import typeOmittedConfig from '../fixtures/mikro-orm.type-omitted.config.js';
import { CollisionEntity } from '../fixtures/source-identity/entity/CollisionEntity.js';
import { inMemorySqliteOptions } from '../helpers/orm.js';
import { COLLISION_DTO_SOURCE, COLLISION_ENTITY_SOURCE, fixturePath } from '../helpers/paths.js';
import { makeTempDir } from '../helpers/temp-dir.js';

const COMPILED_IDENTITY_SOURCE = fixturePath('source-identity', 'compiled', 'CompiledIdentityEntity.ts');
const COMPILED_IDENTITY_DUPLICATE = fixturePath('source-identity', 'compiled-duplicate', 'CompiledIdentityEntity.ts');
const EMBEDDABLE_ADDRESS_SOURCE = fixturePath('embeddable-coverage', 'Address.ts');
const EMBEDDABLE_OWNERS_SOURCE = fixturePath('embeddable-coverage', 'Owners.ts');

/**
 * A fresh class per call: the decorators register the class in MikroORM's
 * global MetadataStorage, so sharing one class between tests would leak state.
 */
function makeRuntimeJsUser(): EntityClass<object> {
  class RuntimeJsUser {}
  Entity()(RuntimeJsUser);
  PrimaryKey({ type: 'integer' })(RuntimeJsUser.prototype, 'id');
  Property({ type: 'string' })(RuntimeJsUser.prototype, 'name');
  return RuntimeJsUser;
}

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

  it('falls back to the default provider with a structured warning when TsMorph has no source file', async () => {
    const RuntimeJsUser = makeRuntimeJsUser();
    const structuredWarnings: StructuredMessage[] = [];

    const md = await generateMarkdown({
      orm: inMemorySqliteOptions([RuntimeJsUser]),
      title: 'Runtime JS',
      onWarn: (_message: string, warning?: StructuredMessage) => {
        if (warning !== undefined) {
          structuredWarnings.push(warning);
        }
      },
    });

    expect(md.startsWith('# Runtime JS')).toBe(true);
    expect(md).toContain('### RuntimeJsUser');
    expect(md).toContain('| name | string |');
    expect(structuredWarnings).toContainEqual(
      expect.objectContaining({
        title: 'TypeScript metadata source unavailable',
        detail: expect.stringContaining('original metadata provider'),
        fix: expect.stringContaining('entitiesTs'),
      })
    );
  });

  it('does not hide arbitrary failures from the auto-injected metadata provider', async () => {
    const injectedFailure = new Error('Source file parser not found arbitrary failure');
    vi.spyOn(TsMorphMetadataProvider.prototype, 'loadEntityMetadata').mockImplementation(() => {
      throw injectedFailure;
    });

    const error = await generateMarkdown({ orm: config }).then(
      () => undefined,
      (cause: unknown) => cause
    );

    expect(error).toBeInstanceOf(MetadataLoadError);
    expect((error as MetadataLoadError).cause).toBe(injectedFailure);
  });

  it('keeps the auto-injected provider failure primary when fallback also fails', async () => {
    const RuntimeJsUser = makeRuntimeJsUser();
    const fallbackFailure = new Error('configured provider failed');
    const fallbackSpy = vi.spyOn(ReflectMetadataProvider.prototype, 'loadEntityMetadata').mockImplementation(() => {
      throw fallbackFailure;
    });
    const structuredWarnings: StructuredMessage[] = [];

    const error = await generateMarkdown({
      orm: inMemorySqliteOptions([RuntimeJsUser]),
      onWarn: (_message: string, warning?: StructuredMessage) => {
        if (warning !== undefined) {
          structuredWarnings.push(warning);
        }
      },
    }).then(
      () => undefined,
      (cause: unknown) => cause
    );

    expect(fallbackSpy).toHaveBeenCalled();
    expect(error).toBeInstanceOf(MetadataLoadError);
    expect((error as MetadataLoadError).cause).toMatchObject({ name: 'MissingTsMorphSourceError' });
    expect((error as MetadataLoadError).cause).not.toBe(fallbackFailure);
    expect(structuredWarnings).not.toContainEqual(
      expect.objectContaining({ title: 'TypeScript metadata source unavailable' })
    );
  });

  // The auto-injected TsMorph provider crashes on schema entities in .ts
  // sources with MikroORM's MetadataError (there is no class declaration to
  // analyse), so generation only proceeds through the fallback retry. Schema
  // declarations then bind their own JSDoc (#106 step 4): the Catalog
  // fixture's @hidden — the #107 regression pin — must actually hide it, and
  // the Showcase fixture's description and @namespace must land.
  it('binds schema-declaration JSDoc for glob-discovered .ts schema entities', async () => {
    const structuredWarnings: StructuredMessage[] = [];

    const md = await generateMarkdown({
      orm: inMemorySqliteOptions(['./test/fixtures/entity-schema-ts/*.ts']),
      onWarn: (_message: string, warning?: StructuredMessage) => {
        if (warning !== undefined) {
          structuredWarnings.push(warning);
        }
      },
    });

    expect(md).not.toContain('### Catalog');
    expect(md).toContain('## Storefront');
    expect(md).toContain('### Showcase');
    expect(md).toContain('> Featured storefront showcase.');
    // Property JSDoc inside the schema object literal binds and beats the
    // comment option in the Description column (#106).
    expect(md).toContain('Display label shown on the storefront tile.');
    expect(md).not.toContain('Comment fallback for the label.');
    expect(structuredWarnings).not.toContainEqual(
      expect.objectContaining({ title: 'JSDoc unavailable for schema-defined entities' })
    );
    // The fallback warning must not advise `entitiesTs` for the schema-entity
    // cause — following that advice drops every `entities` entry; pinning
    // `metadataProvider` is the working fix (#122). The new text may still
    // mention entitiesTs, but only to warn against it.
    const fallbackWarning = structuredWarnings.find(
      (warning) => warning.title === 'TypeScript metadata source unavailable'
    );
    expect(fallbackWarning?.fix).toContain('Pin `metadataProvider` explicitly');
    expect(fallbackWarning?.fix).not.toContain('Configure `entitiesTs`');
  });

  // Same pipeline, other provider failure flavor: for a compiled .js glob the
  // provider throws MissingTsMorphSourceError instead of MetadataError. The
  // fixture's comments survive (they are handwritten, not build output), so
  // both schema styles bind: the class-linked Book merges with the class
  // winning the description conflict, and name-only Publisher binds the
  // schema-side JSDoc directly. The compiled-JS warning still fires — a real
  // build would have stripped the comments.
  it('binds schema-declaration JSDoc from .js sources when comments survive', async () => {
    const structuredWarnings: StructuredMessage[] = [];

    const md = await generateMarkdown({
      orm: inMemorySqliteOptions(['./test/fixtures/entity-schema/*.js']),
      onWarn: (_message: string, warning?: StructuredMessage) => {
        if (warning !== undefined) {
          structuredWarnings.push(warning);
        }
      },
    });

    expect(md).toContain('## Catalog');
    expect(md).toContain('### Book');
    expect(md).toContain('### Publisher');
    expect(md).toContain('> Class-side description for Book.');
    expect(md).not.toContain('Schema-side description for Book');
    expect(md).toContain('> Name-only Publisher declared as EntitySchema.');
    expect(structuredWarnings).not.toContainEqual(
      expect.objectContaining({ title: 'JSDoc unavailable for schema-defined entities' })
    );
    expect(structuredWarnings).toContainEqual(expect.objectContaining({ title: 'JSDoc source unavailable' }));
  });

  // Instance-listed schemas have no meta.path at all, so no JSDoc source
  // exists to read — the warning is the only thing standing between a @hidden
  // tag and a silent leak (#107's second discovery flavor).
  it('renders instance-listed schema entities and warns about their unread JSDoc', async () => {
    const schema = new EntitySchema({
      name: 'InstanceListedSchemaUser',
      properties: {
        id: { primary: true, type: 'number' },
        name: { type: 'string' },
      },
    });
    const structuredWarnings: StructuredMessage[] = [];

    const md = await generateMarkdown({
      orm: inMemorySqliteOptions([schema]),
      onWarn: (_message: string, warning?: StructuredMessage) => {
        if (warning !== undefined) {
          structuredWarnings.push(warning);
        }
      },
    });

    expect(md).toContain('### InstanceListedSchemaUser');
    expect(md).toContain('| name | string |');
    expect(structuredWarnings).toContainEqual(
      expect.objectContaining({
        title: 'JSDoc unavailable for schema-defined entities',
        detail: expect.stringContaining('InstanceListedSchemaUser'),
      })
    );
  });

  // Schema entities have no class declaration for --src to cover, so the
  // explicit-src coverage assertion must not fail generation over them — the
  // schema-JSDoc warning already reports the gap.
  it('does not fail explicit src coverage over schema-defined entities', async () => {
    const schema = new EntitySchema({
      name: 'SrcExemptSchemaUser',
      properties: {
        id: { primary: true, type: 'number' },
      },
    });
    const structuredWarnings: StructuredMessage[] = [];

    const md = await generateMarkdown({
      orm: inMemorySqliteOptions([schema]),
      src: ['./test/fixtures/entities/Author.ts'],
      onWarn: (_message: string, warning?: StructuredMessage) => {
        if (warning !== undefined) {
          structuredWarnings.push(warning);
        }
      },
    });

    expect(md).toContain('### SrcExemptSchemaUser');
    expect(structuredWarnings).toContainEqual(
      expect.objectContaining({
        title: 'JSDoc unavailable for schema-defined entities',
        detail: expect.stringContaining('SrcExemptSchemaUser'),
      })
    );
  });

  // Instance-listed schemas have no path signal at all; explicit --src is the
  // route to their declaration. It matches by unique entity name among schema
  // declarations, and the declaration's @hidden applies (#106 step 4).
  it('binds instance-listed schema declarations through explicit src by name match', async () => {
    const dir = makeTempDir('schema-src-bind-');
    const declarationPath = path.join(dir, 'SrcBoundSchemaUser.ts');
    fs.writeFileSync(
      declarationPath,
      [
        "import { EntitySchema } from '@mikro-orm/core';",
        '',
        '/**',
        ' * Declared hidden at the schema declaration.',
        ' *',
        ' * @hidden',
        ' */',
        'export const SrcBoundSchemaUserSchema = new EntitySchema({',
        "  name: 'SrcBoundSchemaUser',",
        "  properties: { id: { primary: true, type: 'number' } },",
        '});',
        '',
      ].join('\n')
    );
    const schema = new EntitySchema({
      name: 'SrcBoundSchemaUser',
      properties: {
        id: { primary: true, type: 'number' },
      },
    });
    const structuredWarnings: StructuredMessage[] = [];

    const md = await generateMarkdown({
      orm: inMemorySqliteOptions([schema]),
      src: [declarationPath],
      onWarn: (_message: string, warning?: StructuredMessage) => {
        if (warning !== undefined) {
          structuredWarnings.push(warning);
        }
      },
    });

    expect(md).not.toContain('### SrcBoundSchemaUser');
    expect(structuredWarnings).not.toContainEqual(
      expect.objectContaining({ title: 'JSDoc unavailable for schema-defined entities' })
    );
  });

  // Two schema declarations with the same entity name make a name match
  // ambiguous. Binding must refuse to guess — applying the wrong file's tags
  // is worse than not binding — so the entity stays visible and warned about.
  it('keeps warning when same-named schema declarations are ambiguous', async () => {
    const dir = makeTempDir('schema-src-ambiguous-');
    const declarationSource = (description: string): string =>
      [
        "import { EntitySchema } from '@mikro-orm/core';",
        '',
        `/** ${description} @hidden */`,
        'export const AmbiguousSchemaUserSchema = new EntitySchema({',
        "  name: 'AmbiguousSchemaUser',",
        "  properties: { id: { primary: true, type: 'number' } },",
        '});',
        '',
      ].join('\n');
    const firstPath = path.join(dir, 'First.ts');
    const secondPath = path.join(dir, 'Second.ts');
    fs.writeFileSync(firstPath, declarationSource('First candidate.'));
    fs.writeFileSync(secondPath, declarationSource('Second candidate.'));
    const schema = new EntitySchema({
      name: 'AmbiguousSchemaUser',
      properties: {
        id: { primary: true, type: 'number' },
      },
    });
    const structuredWarnings: StructuredMessage[] = [];

    const md = await generateMarkdown({
      orm: inMemorySqliteOptions([schema]),
      src: [firstPath, secondPath],
      onWarn: (_message: string, warning?: StructuredMessage) => {
        if (warning !== undefined) {
          structuredWarnings.push(warning);
        }
      },
    });

    expect(md).toContain('### AmbiguousSchemaUser');
    expect(structuredWarnings).toContainEqual(
      expect.objectContaining({
        title: 'JSDoc unavailable for schema-defined entities',
        detail: expect.stringContaining('AmbiguousSchemaUser'),
      })
    );
  });

  it.each(sqlDriverSmokeCases)(
    'generates markdown from %s metadata without a live database connection',
    async (name, driver, dbName) => {
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
    }
  );

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

  it('rejects missing concrete entity sources before building the document model', async () => {
    const formula = vi.fn(() => '1');
    class MissingFormulaEntity {}
    Object.defineProperty(MissingFormulaEntity, MetadataStorage.PATH_SYMBOL, {
      value: '/virtual/dist/MissingFormulaEntity.js',
      writable: true,
    });
    Entity()(MissingFormulaEntity);
    PrimaryKey({ type: 'integer' })(MissingFormulaEntity.prototype, 'id');
    Formula(formula, { type: 'integer' })(MissingFormulaEntity.prototype, 'computed');

    const pending = generateMarkdown({
      orm: inMemorySqliteOptions([MissingFormulaEntity]),
      src: [COLLISION_DTO_SOURCE],
    });

    await expect(pending).rejects.toMatchObject({
      structured: { title: 'Entities missing from the explicit src paths' },
    });
    expect(formula).not.toHaveBeenCalled();
  });

  it('rejects explicit src paths that omit an embeddable contributing descriptions to a text entity', async () => {
    const pending = generateMarkdown({
      orm: inMemorySqliteOptions([VisibleEmbeddedOwner, CoverageAddress]),
      src: [EMBEDDABLE_OWNERS_SOURCE],
    });

    await expect(pending).rejects.toBeInstanceOf(StructuredError);
    await expect(pending).rejects.toMatchObject({
      structured: { title: 'Entities missing from the explicit src paths' },
    });
    await expect(pending).rejects.toThrow('CoverageAddress');
  });

  it('preserves flattened property descriptions when the contributing embeddable source is included', async () => {
    const md = await generateMarkdown({
      orm: inMemorySqliteOptions([VisibleEmbeddedOwner, CoverageAddress]),
      src: [EMBEDDABLE_OWNERS_SOURCE, EMBEDDABLE_ADDRESS_SOURCE],
    });

    expect(md).toContain(
      '| address_street | string | \\[CoverageAddress\\] |  | Street description from the embeddable source. |'
    );
  });

  it.each([
    ['hidden', HiddenEmbeddedOwner],
    ['ERD-only', ErdOnlyEmbeddedOwner],
  ])('does not require an embeddable used only by a %s entity', async (_kind, owner) => {
    await expect(
      generateMarkdown({
        orm: inMemorySqliteOptions([owner, CoverageAddress]),
        src: [EMBEDDABLE_OWNERS_SOURCE],
      })
    ).resolves.toEqual(expect.any(String));
  });

  it('does not require a configured embeddable that contributes no rendered column', async () => {
    await expect(
      generateMarkdown({
        orm: inMemorySqliteOptions([PlainCoverageEntity, UnusedCoverageAddress]),
        src: [EMBEDDABLE_OWNERS_SOURCE],
      })
    ).resolves.toContain('### PlainCoverageEntity');
  });

  it('does not let a same-named DTO satisfy explicit src coverage for a TypeScript entity', async () => {
    const pending = generateMarkdown({
      orm: inMemorySqliteOptions([CollisionEntity]),
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
      orm: inMemorySqliteOptions([CollisionEntity]),
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
      orm: inMemorySqliteOptions([CompiledIdentityEntity]),
      src: [COMPILED_IDENTITY_SOURCE],
    });

    expect(md).toContain('## CompiledSourceNamespace');
    expect(md).toContain('> Compiled source description');
    expect(md).toContain('Compiled source name description');
  });

  it('uses the sole TypeScript candidate for extensionless bundled metadata', async () => {
    const CompiledIdentityEntity = createCompiledIdentityEntity('/virtual/bundle/CompiledIdentityEntity');

    const md = await generateMarkdown({
      orm: inMemorySqliteOptions([CompiledIdentityEntity]),
      src: [COMPILED_IDENTITY_SOURCE],
    });

    expect(md).toContain('## CompiledSourceNamespace');
    expect(md).toContain('> Compiled source description');
    expect(md).toContain('Compiled source name description');
  });

  it('keeps the structured coverage error when no TypeScript declaration matches a compiled entity', async () => {
    const CompiledIdentityEntity = createCompiledIdentityEntity('/virtual/dist/missing/CompiledIdentityEntity.js');

    const pending = generateMarkdown({
      orm: inMemorySqliteOptions([CompiledIdentityEntity]),
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
      orm: inMemorySqliteOptions([CompiledIdentityEntity]),
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
