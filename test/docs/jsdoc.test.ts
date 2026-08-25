import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { bindJsDocToEntitySources, bindSchemaJsDoc, type JsDocResult, loadJsDoc } from '../../src/docs/jsdoc.js';
import { COLLISION_DTO_SOURCE, COLLISION_ENTITY_SOURCE, ENTITY_FIXTURES_GLOB, fixturePath } from '../helpers/paths.js';
import { makeTempDir } from '../helpers/temp-dir.js';

describe('loadJsDoc', () => {
  it('returns empty maps for empty glob list', () => {
    const result = loadJsDoc([]);
    expect(result.entities.size).toBe(0);
    expect(result.props.size).toBe(0);
    expect(result.sourceFileCount).toBe(0);
    expect(result.classNames.size).toBe(0);
  });

  it('never throws on an unreadable file and still parses valid sources (M6)', () => {
    const dir = makeTempDir('jsdoc-m6-');
    const unreadable = path.join(dir, 'Unreadable.ts');
    fs.writeFileSync(unreadable, 'export class Unreadable {}\n');
    fs.chmodSync(unreadable, 0o000);
    const onWarn = vi.fn();

    const result = loadJsDoc([unreadable, ENTITY_FIXTURES_GLOB], onWarn);

    // The bad path is absorbed; valid fixtures are still parsed.
    expect(result.entities.get('Author')).toBeDefined();
    expect(result.sourceFileCount).toBeGreaterThan(0);
    expect(result.classNames).toContain('Author');
    expect(onWarn).toHaveBeenCalledOnce();
    expect(String(onWarn.mock.calls[0]?.[0])).toContain('Could not load JSDoc source path');
    fs.chmodSync(unreadable, 0o644);
  });

  it('reports zero source files for unmatched explicit paths', () => {
    const result = loadJsDoc([fixturePath('entities', 'no-match-*.ts')]);

    expect(result.sourceFileCount).toBe(0);
    expect(result.entities.size).toBe(0);
    expect(result.props.size).toBe(0);
    expect(result.classNames.size).toBe(0);
  });

  it('warns when an exact source path matches no files', () => {
    const onWarn = vi.fn();
    const missingPath = fixturePath('entities', 'NoMatch.ts');

    const result = loadJsDoc([missingPath], onWarn);

    expect(result.sourceFileCount).toBe(0);
    expect(onWarn).toHaveBeenCalledOnce();
    expect(String(onWarn.mock.calls[0]?.[0])).toContain('No JSDoc source file matched path');
  });

  it('extracts @namespace tag from Author entity', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    const author = result.entities.get('Author');
    expect(author).toBeDefined();
    expect(author!.namespaces).toContain('Blog');
  });

  it('extracts entity description from class JSDoc', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    const author = result.entities.get('Author');
    expect(author!.description).toBe('글 작성자');
  });

  it('Post has @namespace Blog and description', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    const post = result.entities.get('Post');
    expect(post).toBeDefined();
    expect(post!.namespaces).toContain('Blog');
    expect(post!.description).toBe('블로그 게시글');
  });

  it('Customer has @namespace Shop', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    const customer = result.entities.get('Customer');
    expect(customer).toBeDefined();
    expect(customer!.namespaces).toContain('Shop');
  });

  it('Animal, Dog, Cat all have @namespace Animals', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    expect(result.entities.get('Animal')?.namespaces).toContain('Animals');
    expect(result.entities.get('Dog')?.namespaces).toContain('Animals');
    expect(result.entities.get('Cat')?.namespaces).toContain('Animals');
  });

  it('entities without @hidden have hidden=false', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    for (const [, info] of result.entities) {
      expect(info.hidden).toBe(false);
    }
  });

  it('entities without @erd or @describe have empty arrays', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    const author = result.entities.get('Author');
    expect(author!.erdNamespaces).toHaveLength(0);
    expect(author!.describeNamespaces).toHaveLength(0);
  });

  it('retains separate source-aware declarations for same-named classes', () => {
    const result = loadJsDoc([COLLISION_ENTITY_SOURCE, COLLISION_DTO_SOURCE]);
    const collisions = result.declarations.filter((declaration) => declaration.className === 'CollisionEntity');

    expect(collisions).toHaveLength(2);
    expect(collisions.map((declaration) => declaration.sourcePath)).toEqual(
      expect.arrayContaining([COLLISION_ENTITY_SOURCE, COLLISION_DTO_SOURCE])
    );
    expect(
      collisions.find((declaration) => declaration.sourcePath === COLLISION_ENTITY_SOURCE)?.entity?.description
    ).toBe('Entity source description');
    expect(collisions.find((declaration) => declaration.sourcePath === COLLISION_DTO_SOURCE)?.entity?.hidden).toBe(
      true
    );
  });

  it('deduplicates symlink aliases before checking compiled-source ambiguity', () => {
    const dir = makeTempDir('jsdoc-source-alias-');
    const aliasPath = path.join(dir, 'CollisionEntity.ts');
    fs.symlinkSync(COLLISION_ENTITY_SOURCE, aliasPath);

    const loaded = loadJsDoc([COLLISION_ENTITY_SOURCE, aliasPath]);
    const collisions = loaded.declarations.filter((declaration) => declaration.className === 'CollisionEntity');

    expect(collisions).toHaveLength(1);
    const bound = bindJsDocToEntitySources(loaded, new Map([['CollisionEntity', '/virtual/CollisionEntity']]), {
      allowCompiledSourceFallback: true,
    });
    expect(bound.entities.get('CollisionEntity')?.description).toBe('Entity source description');
  });

  it('exact-matches an entity source path that still needs normalization', () => {
    const loaded = loadJsDoc([COLLISION_ENTITY_SOURCE]);
    // Same file addressed through a redundant "./" segment — only the entity
    // side is unnormalized; declaration paths are normalized by loadJsDoc.
    const unnormalized = COLLISION_ENTITY_SOURCE.replace(
      `${path.sep}CollisionEntity.ts`,
      `${path.sep}.${path.sep}CollisionEntity.ts`
    );

    const bound = bindJsDocToEntitySources(loaded, new Map([['CollisionEntity', unnormalized]]));

    expect(bound.classNames).toContain('CollisionEntity');
    expect(bound.entities.get('CollisionEntity')?.description).toBe('Entity source description');
  });
});

describe('loadJsDoc — property descriptions', () => {
  it('extracts property description from Author.name', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    const authorProps = result.props.get('Author');
    expect(authorProps).toBeDefined();
    expect(authorProps!.get('name')?.description).toBe('작성자 이름');
  });

  it('extracts property description from Author.email', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    const authorProps = result.props.get('Author');
    expect(authorProps!.get('email')?.description).toBe('이메일 주소');
  });

  it('extracts property descriptions from Post', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    const postProps = result.props.get('Post');
    expect(postProps).toBeDefined();
    expect(postProps!.get('title')?.description).toBe('게시글 제목');
    expect(postProps!.get('body')?.description).toBe('게시글 본문');
  });

  it('properties without JSDoc are not included in propMap', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    // Tag has label with JSDoc, but id (no JSDoc) should not appear
    const tagProps = result.props.get('Tag');
    expect(tagProps?.get('id')).toBeUndefined();
  });

  it('extracts property descriptions from getter accessors and constructor parameter properties', () => {
    const dir = makeTempDir('jsdoc-accessors-');
    const sourcePath = path.join(dir, 'AccessorEntity.ts');
    fs.writeFileSync(
      sourcePath,
      `
        class User {}

        export class AccessorEntity {
          constructor(
            /** Constructor-declared {@link User} display name */
            public displayName: string,
          ) {}

          /** Getter-declared score */
          get score(): number {
            return 1;
          }
        }
      `,
      'utf-8'
    );

    const result = loadJsDoc([sourcePath]);
    const props = result.props.get('AccessorEntity');

    expect(props?.get('displayName')?.description).toBe('Constructor-declared {@link User} display name');
    expect(props?.get('score')?.description).toBe('Getter-declared score');
  });
});

describe('loadJsDoc — @atLeastOne', () => {
  it('parses @atLeastOne on a collection property', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    const authorProps = result.props.get('Author');
    expect(authorProps!.get('posts')?.atLeastOne).toBe(true);
  });

  it('properties without @atLeastOne have atLeastOne=false', () => {
    const result = loadJsDoc([ENTITY_FIXTURES_GLOB]);
    const authorProps = result.props.get('Author');
    expect(authorProps!.get('name')?.atLeastOne).toBe(false);
  });

  it('parses @atLeastOne on getter accessors and constructor parameter properties', () => {
    const dir = makeTempDir('jsdoc-at-least-one-accessors-');
    const sourcePath = path.join(dir, 'RelationEntity.ts');
    fs.writeFileSync(
      sourcePath,
      `
        export class RelationEntity {
          constructor(
            /**
             * Constructor collection
             * @atLeastOne
             */
            public constructorItems: string[],
          ) {}

          /**
           * Getter collection
           * @atLeastOne
           */
          get getterItems(): string[] {
            return [];
          }
        }
      `,
      'utf-8'
    );

    const result = loadJsDoc([sourcePath]);
    const props = result.props.get('RelationEntity');

    expect(props?.get('constructorItems')?.atLeastOne).toBe(true);
    expect(props?.get('getterItems')?.atLeastOne).toBe(true);
  });
});

describe('loadJsDoc — @hidden and @erd/@describe', () => {
  it('parses every supported tag, explicit default values, and duplicate tags from source', () => {
    const dir = makeTempDir('jsdoc-supported-tags-');
    const sourcePath = path.join(dir, 'TaggedEntity.ts');
    fs.writeFileSync(
      sourcePath,
      `
        /**
         * Tagged entity description.
         * @namespace default
         * @namespace Sales
         * @namespace Sales
         * @erd default
         * @erd Overview
         * @erd Overview
         * @describe default
         * @describe Details
         * @describe Details
         * @hidden
         */
        export class TaggedEntity {
          /**
           * Required links.
           * @atLeastOne
           * @atLeastOne
           */
          links!: string[];
        }
      `,
      'utf-8'
    );

    const result = loadJsDoc([sourcePath]);
    const entity = result.entities.get('TaggedEntity');
    const links = result.props.get('TaggedEntity')?.get('links');

    expect(entity).toEqual({
      description: 'Tagged entity description.',
      namespaces: ['default', 'Sales', 'Sales'],
      erdNamespaces: ['default', 'Overview', 'Overview'],
      describeNamespaces: ['default', 'Details', 'Details'],
      hidden: true,
    });
    expect(links).toEqual({ description: 'Required links.', atLeastOne: true });
  });
});

describe('loadJsDoc — schema declarations', () => {
  const SCHEMA_JS_FIXTURE = fixturePath('entity-schema', 'BookSchema.js');

  /** Writes a class-linked pair: the class in one file, the schema importing it. */
  function writeLinkedPair(dir: string): string {
    fs.writeFileSync(
      path.join(dir, 'Author.ts'),
      [
        '/**',
        ' * Class desc.',
        ' *',
        ' * @namespace Core',
        ' */',
        'export class Author {',
        '  /** Primary key. */',
        '  id!: number;',
        '}',
        '',
      ].join('\n')
    );
    const schemaPath = path.join(dir, 'AuthorSchema.ts');
    fs.writeFileSync(
      schemaPath,
      [
        "import { EntitySchema } from '@mikro-orm/core';",
        "import { Author } from './Author';",
        '',
        '/**',
        ' * Schema desc.',
        ' *',
        ' * @namespace SchemaSide',
        ' * @erd Storefront',
        ' * @hidden',
        ' */',
        'export const AuthorSchema = new EntitySchema({',
        '  class: Author,',
        '  properties: {},',
        '});',
        '',
      ].join('\n')
    );
    return schemaPath;
  }

  it('does not scan schema declarations unless asked', () => {
    const result = loadJsDoc([SCHEMA_JS_FIXTURE]);

    expect(result.schemaDeclarations).toHaveLength(0);
  });

  it('scans exported EntitySchema variables, resolving the entity name from name:', () => {
    const dir = makeTempDir('jsdoc-schema-scan-');
    const filePath = path.join(dir, 'CatalogSchema.ts');
    fs.writeFileSync(
      filePath,
      [
        "import { EntitySchema } from '@mikro-orm/core';",
        '',
        '/**',
        ' * Catalog description.',
        ' *',
        ' * @namespace Storefront',
        ' * @hidden',
        ' */',
        'export const CatalogSchema = new EntitySchema({',
        "  name: 'Catalog',",
        '  properties: {},',
        '});',
        '',
      ].join('\n')
    );

    const result = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    expect(result.schemaDeclarations).toHaveLength(1);
    const declaration = result.schemaDeclarations[0]!;
    expect(declaration.entityName).toBe('Catalog');
    expect(declaration.sourcePath.endsWith('CatalogSchema.ts')).toBe(true);
    expect(declaration.entity?.description).toBe('Catalog description.');
    expect(declaration.entity?.namespaces).toEqual(['Storefront']);
    expect(declaration.entity?.hidden).toBe(true);
    expect(declaration.linkedClass).toBeUndefined();
  });

  it('resolves class-linked schemas through the class: symbol, imports included', () => {
    const dir = makeTempDir('jsdoc-schema-linked-');
    const schemaPath = writeLinkedPair(dir);

    // Only the schema file is passed: the class is reached via its import.
    const result = loadJsDoc([schemaPath], undefined, { scanSchemaDeclarations: true });

    expect(result.schemaDeclarations).toHaveLength(1);
    const declaration = result.schemaDeclarations[0]!;
    expect(declaration.entityName).toBe('Author');
    expect(declaration.entity?.description).toBe('Schema desc.');
    expect(declaration.linkedClass?.className).toBe('Author');
    expect(declaration.linkedClass?.sourcePath.endsWith('Author.ts')).toBe(true);
    expect(declaration.linkedClass?.entity?.description).toBe('Class desc.');
    expect(declaration.linkedClass?.props.get('id')?.description).toBe('Primary key.');
  });

  it('recognizes defineEntity() declarations', () => {
    const dir = makeTempDir('jsdoc-schema-define-');
    const filePath = path.join(dir, 'setting.ts');
    fs.writeFileSync(
      filePath,
      [
        "import { defineEntity } from '@mikro-orm/core';",
        '',
        '/** Setting entity. */',
        "export const settingEntity = defineEntity({ name: 'Setting', properties: {} });",
        '',
      ].join('\n')
    );

    const result = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    expect(result.schemaDeclarations).toHaveLength(1);
    expect(result.schemaDeclarations[0]?.entityName).toBe('Setting');
    expect(result.schemaDeclarations[0]?.entity?.description).toBe('Setting entity.');
  });

  it('recognizes namespace-qualified schema constructors', () => {
    const dir = makeTempDir('jsdoc-schema-qualified-');
    const filePath = path.join(dir, 'qualified.ts');
    fs.writeFileSync(
      filePath,
      [
        "import * as orm from '@mikro-orm/core';",
        '',
        "export const QualifiedSchema = new orm.EntitySchema({ name: 'Qualified', properties: {} });",
        '',
      ].join('\n')
    );

    const result = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    expect(result.schemaDeclarations.map((declaration) => declaration.entityName)).toEqual(['Qualified']);
  });

  it('ignores exports that are not schema declarations', () => {
    const dir = makeTempDir('jsdoc-schema-ignore-');
    const filePath = path.join(dir, 'not-schemas.ts');
    fs.writeFileSync(
      filePath,
      [
        '/** A DTO, not an entity. */',
        'export class NotASchema {}',
        "export const plainObject = { name: 'NotASchema' };",
        'export const arrow = () => null;',
        "export const otherCall = makeThing({ name: 'NotASchema' });",
        '',
      ].join('\n')
    );

    const result = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    expect(result.schemaDeclarations).toHaveLength(0);
  });

  it('skips schema declarations whose entity name cannot be resolved', () => {
    const dir = makeTempDir('jsdoc-schema-noname-');
    const filePath = path.join(dir, 'unresolvable.ts');
    fs.writeFileSync(
      filePath,
      [
        "const cfg = { name: 'Mystery', properties: {} };",
        'export const MysterySchema = new EntitySchema(cfg);',
        'export const TemplateSchema = new EntitySchema({ name: `Templated`, properties: {} });',
        '',
      ].join('\n')
    );

    const result = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    expect(result.schemaDeclarations).toHaveLength(0);
  });

  it('reads property JSDoc from inside the properties object literal for name-only schemas', () => {
    const dir = makeTempDir('jsdoc-schema-props-');
    const filePath = path.join(dir, 'subscription.ts');
    fs.writeFileSync(
      filePath,
      [
        "import { EntitySchema } from '@mikro-orm/core';",
        '',
        'export const SubscriptionSchema = new EntitySchema({',
        "  name: 'Subscription',",
        '  properties: {',
        "    id: { primary: true, type: 'integer' },",
        '    /** Plan the subscription is on. */',
        "    plan: { type: 'string' },",
        '    /** @atLeastOne */',
        "    seats: { kind: '1:m', entity: 'Seat' },",
        '    /** Documented despite the quoted key. */',
        "    'renewed-at': { type: 'datetime' },",
        '    ...sharedProps,',
        "    [computedKey]: { type: 'string' },",
        '  },',
        '});',
        '',
      ].join('\n')
    );

    const result = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    const declaration = result.schemaDeclarations[0]!;
    expect(declaration.props.get('plan')?.description).toBe('Plan the subscription is on.');
    expect(declaration.props.get('seats')?.atLeastOne).toBe(true);
    expect(declaration.props.get('renewed-at')?.description).toBe('Documented despite the quoted key.');
    expect(declaration.props.has('id')).toBe(false);
  });

  it('unwraps the defineEntity() builder callback to reach property JSDoc', () => {
    const dir = makeTempDir('jsdoc-schema-builder-props-');
    const filePath = path.join(dir, 'orders.ts');
    fs.writeFileSync(
      filePath,
      [
        "import { defineEntity } from '@mikro-orm/core';",
        '',
        'export const orderEntity = defineEntity({',
        "  name: 'Order',",
        '  properties: (p) => ({',
        '    /** Total in cents. */',
        '    total: p.integer(),',
        '  }),',
        '});',
        '',
        'export const draftEntity = defineEntity({',
        "  name: 'Draft',",
        '  properties: (p) => {',
        '    return {',
        '      /** Draft body text. */',
        '      body: p.text(),',
        '    };',
        '  },',
        '});',
        '',
      ].join('\n')
    );

    const result = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    const byName = new Map(result.schemaDeclarations.map((declaration) => [declaration.entityName, declaration]));
    expect(byName.get('Order')?.props.get('total')?.description).toBe('Total in cents.');
    expect(byName.get('Draft')?.props.get('body')?.description).toBe('Draft body text.');
  });

  it('reads property JSDoc through a parenthesized properties literal', () => {
    const dir = makeTempDir('jsdoc-schema-paren-props-');
    const filePath = path.join(dir, 'wrapped.ts');
    fs.writeFileSync(
      filePath,
      [
        "import { EntitySchema } from '@mikro-orm/core';",
        '',
        'export const WrappedSchema = new EntitySchema({',
        "  name: 'Wrapped',",
        '  properties: ({',
        '    /** Documented despite the parentheses. */',
        "    label: { type: 'string' },",
        '  }),',
        '});',
        '',
      ].join('\n')
    );

    const result = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    expect(result.schemaDeclarations[0]?.props.get('label')?.description).toBe('Documented despite the parentheses.');
  });

  it('leaves object-literal property JSDoc unread for class-linked schemas — the class documents properties', () => {
    const dir = makeTempDir('jsdoc-schema-linked-props-');
    fs.writeFileSync(path.join(dir, 'Author.ts'), 'export class Author { id!: number; }\n');
    const schemaPath = path.join(dir, 'AuthorSchema.ts');
    fs.writeFileSync(
      schemaPath,
      [
        "import { Author } from './Author';",
        '',
        'export const AuthorSchema = new EntitySchema({',
        '  class: Author,',
        '  properties: {',
        '    /** Ignored: property documentation belongs to the class. */',
        "    id: { primary: true, type: 'number' },",
        '  },',
        '});',
        '',
      ].join('\n')
    );

    const result = loadJsDoc([schemaPath], undefined, { scanSchemaDeclarations: true });

    expect(result.schemaDeclarations[0]?.props.size).toBe(0);
  });
});

describe('bindSchemaJsDoc', () => {
  function emptyJsDocResult(): JsDocResult {
    return { entities: new Map(), props: new Map(), sourceFileCount: 0, classNames: new Set() };
  }

  function writeNamedSchema(filePath: string, entityName: string, description?: string): void {
    fs.writeFileSync(
      filePath,
      [
        ...(description !== undefined ? [`/** ${description} */`] : []),
        `export const ${entityName}Schema = new EntitySchema({ name: '${entityName}', properties: {} });`,
        '',
      ].join('\n')
    );
  }

  it('merges class-linked JSDoc field by field: class wins, @hidden is OR-d, props come from the class', () => {
    const dir = makeTempDir('jsdoc-bind-linked-');
    fs.writeFileSync(
      path.join(dir, 'Author.ts'),
      [
        '/**',
        ' * Class desc.',
        ' *',
        ' * @namespace Core',
        ' */',
        'export class Author {',
        '  /** Primary key. */',
        '  id!: number;',
        '}',
        '',
      ].join('\n')
    );
    const schemaPath = path.join(dir, 'AuthorSchema.ts');
    fs.writeFileSync(
      schemaPath,
      [
        "import { Author } from './Author';",
        '',
        '/**',
        ' * Schema desc.',
        ' *',
        ' * @namespace SchemaSide',
        ' * @erd Storefront',
        ' * @hidden',
        ' */',
        'export const AuthorSchema = new EntitySchema({ class: Author, properties: {} });',
        '',
      ].join('\n')
    );
    const loaded = loadJsDoc([schemaPath], undefined, { scanSchemaDeclarations: true });

    const binding = bindSchemaJsDoc(loaded, emptyJsDocResult(), new Map([['Author', undefined]]));

    const author = binding.jsDocResult.entities.get('Author');
    expect(author?.description).toBe('Class desc.');
    expect(author?.namespaces).toEqual(['Core']);
    expect(author?.erdNamespaces).toEqual(['Storefront']);
    expect(author?.hidden).toBe(true);
    expect(binding.jsDocResult.props.get('Author')?.get('id')?.description).toBe('Primary key.');
    expect(binding.jsDocReadEntityNames.has('Author')).toBe(true);
  });

  it('prefers the exact source-path match over other same-named declarations', () => {
    const dir = makeTempDir('jsdoc-bind-path-');
    const firstPath = path.join(dir, 'A.ts');
    const secondPath = path.join(dir, 'B.ts');
    writeNamedSchema(firstPath, 'PathMatch', 'From A.');
    writeNamedSchema(secondPath, 'PathMatch', 'From B.');
    const loaded = loadJsDoc([firstPath, secondPath], undefined, { scanSchemaDeclarations: true });

    const binding = bindSchemaJsDoc(loaded, emptyJsDocResult(), new Map([['PathMatch', secondPath]]));

    expect(binding.jsDocResult.entities.get('PathMatch')?.description).toBe('From B.');
    expect(binding.jsDocReadEntityNames.has('PathMatch')).toBe(true);
  });

  it('binds by unique name when the entity has no source path', () => {
    const dir = makeTempDir('jsdoc-bind-name-');
    const filePath = path.join(dir, 'Solo.ts');
    writeNamedSchema(filePath, 'Solo', 'Solo description.');
    const loaded = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    const binding = bindSchemaJsDoc(loaded, emptyJsDocResult(), new Map([['Solo', undefined]]));

    expect(binding.jsDocResult.entities.get('Solo')?.description).toBe('Solo description.');
    expect(binding.jsDocReadEntityNames.has('Solo')).toBe(true);
  });

  it('binds nothing when same-named declarations are ambiguous', () => {
    const dir = makeTempDir('jsdoc-bind-ambiguous-');
    const firstPath = path.join(dir, 'A.ts');
    const secondPath = path.join(dir, 'B.ts');
    writeNamedSchema(firstPath, 'Ambiguous', 'From A.');
    writeNamedSchema(secondPath, 'Ambiguous', 'From B.');
    const loaded = loadJsDoc([firstPath, secondPath], undefined, { scanSchemaDeclarations: true });

    const binding = bindSchemaJsDoc(loaded, emptyJsDocResult(), new Map([['Ambiguous', undefined]]));

    expect(binding.jsDocResult.entities.has('Ambiguous')).toBe(false);
    expect(binding.jsDocReadEntityNames.has('Ambiguous')).toBe(false);
  });

  it('treats a compiled-JS declaration without JSDoc as unread — its comments may be stripped', () => {
    const dir = makeTempDir('jsdoc-bind-bare-js-');
    const filePath = path.join(dir, 'bare.js');
    writeNamedSchema(filePath, 'Bare');
    const loaded = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    const binding = bindSchemaJsDoc(loaded, emptyJsDocResult(), new Map([['Bare', undefined]]));

    expect(binding.jsDocReadEntityNames.has('Bare')).toBe(false);
  });

  it('treats a compiled-JS declaration with surviving JSDoc as read', () => {
    const dir = makeTempDir('jsdoc-bind-doc-js-');
    const filePath = path.join(dir, 'documented.js');
    writeNamedSchema(filePath, 'Documented', 'Survived the build.');
    const loaded = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    const binding = bindSchemaJsDoc(loaded, emptyJsDocResult(), new Map([['Documented', undefined]]));

    expect(binding.jsDocResult.entities.get('Documented')?.description).toBe('Survived the build.');
    expect(binding.jsDocReadEntityNames.has('Documented')).toBe(true);
  });

  it('treats a TypeScript declaration without JSDoc as read — nothing was written to lose', () => {
    const dir = makeTempDir('jsdoc-bind-bare-ts-');
    const filePath = path.join(dir, 'bare.ts');
    writeNamedSchema(filePath, 'BareTs');
    const loaded = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    const binding = bindSchemaJsDoc(loaded, emptyJsDocResult(), new Map([['BareTs', undefined]]));

    expect(binding.jsDocReadEntityNames.has('BareTs')).toBe(true);
  });

  function writePropDocumentedSchema(filePath: string, entityName: string, description: string): void {
    fs.writeFileSync(
      filePath,
      [
        `export const ${entityName}Schema = new EntitySchema({`,
        `  name: '${entityName}',`,
        '  properties: {',
        `    /** ${description} */`,
        "    title: { type: 'string' },",
        '  },',
        '});',
        '',
      ].join('\n')
    );
  }

  it('binds object-literal property JSDoc for name-only schemas', () => {
    const dir = makeTempDir('jsdoc-bind-literal-props-');
    const filePath = path.join(dir, 'Plan.ts');
    writePropDocumentedSchema(filePath, 'Plan', 'Marketing name of the plan.');
    const loaded = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    const binding = bindSchemaJsDoc(loaded, emptyJsDocResult(), new Map([['Plan', undefined]]));

    expect(binding.jsDocResult.props.get('Plan')?.get('title')?.description).toBe('Marketing name of the plan.');
  });

  it('counts surviving property JSDoc as read for compiled-JS declarations', () => {
    const dir = makeTempDir('jsdoc-bind-prop-js-');
    const filePath = path.join(dir, 'plan.js');
    writePropDocumentedSchema(filePath, 'Plan', 'Survived the build.');
    const loaded = loadJsDoc([filePath], undefined, { scanSchemaDeclarations: true });

    const binding = bindSchemaJsDoc(loaded, emptyJsDocResult(), new Map([['Plan', undefined]]));

    expect(binding.jsDocResult.props.get('Plan')?.get('title')?.description).toBe('Survived the build.');
    expect(binding.jsDocReadEntityNames.has('Plan')).toBe(true);
  });
});
