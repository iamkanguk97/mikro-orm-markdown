import { type EntityMetadata, ReferenceKind } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import type { JsDocResult } from '../../src/docs/jsdoc.js';
import { loadJsDoc } from '../../src/docs/jsdoc.js';
import type { StructuredMessage } from '../../src/messages.js';
import { loadEntityMetadata } from '../../src/metadata/load.js';
import { buildDocumentModel, type DocumentModel, type EnrichedEntity } from '../../src/model/build.js';
import config from '../fixtures/mikro-orm.config.js';
import { makeEntityMeta, makeSimpleEntityMeta, pkProperty } from '../helpers/entity-meta.js';
import { makeJsDocResult } from '../helpers/jsdoc.js';
import { getFixtureDocModel, getFixtureMetas } from '../helpers/pipeline.js';

function createManyToManyMetas(): EntityMetadata[] {
  const post = makeEntityMeta({
    className: 'Post',
    tableName: 'post',
    primaryKeys: ['id'],
    properties: {
      id: pkProperty(),
      tags: { name: 'tags', type: 'Tag', kind: ReferenceKind.MANY_TO_MANY, owner: true },
    },
  });
  const tag = makeEntityMeta({
    className: 'Tag',
    tableName: 'tag',
    primaryKeys: ['id'],
    properties: {
      id: pkProperty(),
      posts: { name: 'posts', type: 'Post', kind: ReferenceKind.MANY_TO_MANY, mappedBy: 'tags' },
    },
  });

  return [post, tag];
}

function createAtLeastOneJsDoc(className: string, propName: string): JsDocResult {
  return makeJsDocResult({
    props: new Map([[className, new Map([[propName, { atLeastOne: true }]])]]),
  });
}

function createStiEntityMeta(
  className: string,
  propertyNames: string[],
  // `extendsEntity` accepts a class as well as a name: MikroORM v6 stores the
  // ancestor's class name in `meta.extends`, v7 the ancestor class itself.
  options: {
    extendsEntity?: string | (new () => unknown);
    discriminatorColumn?: string;
    discriminatorValue?: string;
  } = {}
): EntityMetadata {
  const properties = Object.fromEntries(
    propertyNames.map((name) => [
      name,
      {
        name,
        fieldNames: [name],
        type: name === 'id' ? 'integer' : 'string',
        kind: ReferenceKind.SCALAR,
        primary: name === 'id',
      },
    ])
  );

  return makeEntityMeta({
    className,
    tableName: 'sti_entity',
    primaryKeys: propertyNames.includes('id') ? ['id'] : [],
    properties,
    ...(options.extendsEntity !== undefined && { extends: options.extendsEntity }),
    ...(options.discriminatorColumn !== undefined && { discriminatorColumn: options.discriminatorColumn }),
    ...(options.discriminatorValue !== undefined && { discriminatorValue: options.discriminatorValue }),
  });
}

describe('buildDocumentModel — @atLeastOne warnings (L2)', () => {
  it('warns when @atLeastOne cannot be matched to a relation edge', () => {
    // A unidirectional @OneToMany (no mappedBy) produces no edge to adjust.
    const parent = makeEntityMeta({
      className: 'Parent',
      tableName: 'parent',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        children: { name: 'children', type: 'Child', kind: ReferenceKind.ONE_TO_MANY },
      },
    });
    const jsDoc = createAtLeastOneJsDoc('Parent', 'children');

    const calls: [string, StructuredMessage | undefined][] = [];
    buildDocumentModel([parent], jsDoc, 'T', {
      onWarn: (message: string, warning?: StructuredMessage) => {
        calls.push([message, warning]);
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toContain('@atLeastOne on Parent.children');
    expect(calls[0]?.[1]).toMatchObject({ title: '@atLeastOne had no effect' });
  });
});

describe('buildDocumentModel — @atLeastOne many-to-many', () => {
  it('upgrades an owning many-to-many collection to one-or-more on the target side', () => {
    const docModel = buildDocumentModel(createManyToManyMetas(), createAtLeastOneJsDoc('Post', 'tags'), 'T');
    const edge = docModel.groups.flatMap((group) => group.erdRelations).find((relation) => relation.label === 'tags');

    expect(edge!.fromCardinality).toBe('}o');
    expect(edge!.toCardinality).toBe('|{');
  });

  it('upgrades an inverse many-to-many collection to one-or-more on the source side', () => {
    const docModel = buildDocumentModel(createManyToManyMetas(), createAtLeastOneJsDoc('Tag', 'posts'), 'T');
    const edge = docModel.groups.flatMap((group) => group.erdRelations).find((relation) => relation.label === 'tags');

    expect(edge!.fromCardinality).toBe('}|');
    expect(edge!.toCardinality).toBe('o{');
  });
});

describe('buildDocumentModel — FK to @hidden entity (L3)', () => {
  it('drops FK columns that reference a hidden entity', () => {
    const order = makeEntityMeta({
      className: 'Order',
      tableName: 'order',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        secret: {
          name: 'secret',
          fieldNames: ['secret_id'],
          type: 'Secret',
          kind: ReferenceKind.MANY_TO_ONE,
          referencedColumnNames: ['id'],
        },
      },
    });
    const secret = makeEntityMeta({
      className: 'Secret',
      tableName: 'secret',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
      },
    });
    const jsDoc = makeJsDocResult({
      entities: new Map([['Secret', { hidden: true, namespaces: [], erdNamespaces: [], describeNamespaces: [] }]]),
    });

    const docModel = buildDocumentModel([order, secret], jsDoc, 'T');
    const orderEntity = docModel.groups.flatMap((g) => g.textEntities).find((e) => e.model.className === 'Order');

    const fieldNames = orderEntity!.model.columns.map((c) => c.fieldName);
    expect(fieldNames).toEqual(['id']);
    expect(fieldNames).not.toContain('secret_id');
  });

  it('drops structured constraints that include a hidden FK column', () => {
    const order = makeEntityMeta({
      className: 'Order',
      tableName: 'order',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        status: { name: 'status', fieldNames: ['status'], type: 'string', kind: ReferenceKind.SCALAR },
        secret: {
          name: 'secret',
          fieldNames: ['secret_id'],
          type: 'Secret',
          kind: ReferenceKind.MANY_TO_ONE,
          referencedColumnNames: ['id'],
        },
      },
      indexes: [
        { name: 'order_secret_lookup_idx', properties: ['status', 'secret'] },
        { name: 'order_status_idx', properties: ['status'] },
      ],
      uniques: [{ name: 'order_secret_uq', properties: ['secret_id'] }],
      checks: [{ name: 'order_status_check', expression: "status <> ''" }],
    });
    const secret = makeSimpleEntityMeta('Secret');
    const jsDoc = makeJsDocResult({
      entities: new Map([['Secret', { hidden: true, namespaces: [], erdNamespaces: [], describeNamespaces: [] }]]),
    });

    const docModel = buildDocumentModel([order, secret], jsDoc, 'T');
    const constraints = docModel.groups
      .flatMap((group) => group.textEntities)
      .find((entity) => entity.model.className === 'Order')!.model.constraints;

    expect(constraints).toEqual([
      { type: 'index', properties: ['status'], name: 'order_status_idx' },
      { type: 'check', properties: [], expression: "status <> ''", name: 'order_status_check' },
    ]);
  });
});

describe('buildDocumentModel — groups', () => {
  it('produces expected namespace groups from fixtures', async () => {
    const docModel = await getFixtureDocModel();
    const groupNames = docModel.groups.map((g) => g.name);
    expect(groupNames).toContain('Animals');
    expect(groupNames).toContain('Blog');
    expect(groupNames).toContain('Shop');
  });

  it('"default" group is absent when every entity has a @namespace', async () => {
    const docModel = await getFixtureDocModel();
    const groupNames = docModel.groups.map((g) => g.name);
    expect(groupNames).not.toContain('default');
  });

  it('"default" is sorted last when it exists', async () => {
    const metas = await getFixtureMetas();
    // Pass empty jsDocResult so no JSDoc loaded → all entities fall into "default"
    const docModel = buildDocumentModel(metas, makeJsDocResult(), 'T');
    const groupNames = docModel.groups.map((g) => g.name);
    expect(groupNames[groupNames.length - 1]).toBe('default');
  });

  it('title is set correctly', async () => {
    const docModel = await getFixtureDocModel();
    expect(docModel.title).toBe('Test DB');
  });

  it('groups are sorted alphabetically (Animals before Blog before Shop)', async () => {
    const docModel = await getFixtureDocModel();
    const groupNames = docModel.groups.map((g) => g.name);
    const sorted = [...groupNames].sort((a, b) => a.localeCompare(b));
    expect(groupNames).toEqual(sorted);
  });
});

describe('buildDocumentModel — explicit default namespace', () => {
  it('includes explicit and untagged entities together in the default ERD and text sections', () => {
    const payment = makeSimpleEntityMeta('Payment');
    const auditLog = makeSimpleEntityMeta('AuditLog');
    const jsDoc = makeJsDocResult({
      entities: new Map([
        ['Payment', { namespaces: ['default'], erdNamespaces: [], describeNamespaces: [], hidden: false }],
      ]),
      classNames: new Set(['Payment', 'AuditLog']),
    });

    const docModel = buildDocumentModel([payment, auditLog], jsDoc, 'T');
    const defaultGroup = docModel.groups.find((group) => group.name === 'default');

    expect(defaultGroup?.erdEntities.map((entity) => entity.model.className)).toEqual(['Payment', 'AuditLog']);
    expect(defaultGroup?.textEntities.map((entity) => entity.model.className)).toEqual(['Payment', 'AuditLog']);
  });

  it('respects @erd and @describe scopes when they explicitly target default', () => {
    const erdOnly = makeSimpleEntityMeta('ErdOnly');
    const textOnly = makeSimpleEntityMeta('TextOnly');
    const jsDoc = makeJsDocResult({
      entities: new Map([
        ['ErdOnly', { namespaces: [], erdNamespaces: ['default'], describeNamespaces: [], hidden: false }],
        ['TextOnly', { namespaces: [], erdNamespaces: [], describeNamespaces: ['default'], hidden: false }],
      ]),
      classNames: new Set(['ErdOnly', 'TextOnly']),
    });

    const docModel = buildDocumentModel([erdOnly, textOnly], jsDoc, 'T');
    const defaultGroup = docModel.groups.find((group) => group.name === 'default');

    expect(defaultGroup?.erdEntities.map((entity) => entity.model.className)).toEqual(['ErdOnly']);
    expect(defaultGroup?.textEntities.map((entity) => entity.model.className)).toEqual(['TextOnly']);
  });

  it('keeps the PK-only projection for @erd default used as a foreign namespace', () => {
    const widget = makeEntityMeta({
      className: 'Widget',
      tableName: 'widget',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        name: { name: 'name', fieldNames: ['name'], type: 'string', kind: ReferenceKind.SCALAR },
      },
    });
    const jsDoc = makeJsDocResult({
      entities: new Map([
        ['Widget', { namespaces: ['Home'], erdNamespaces: ['default'], describeNamespaces: [], hidden: false }],
      ]),
      classNames: new Set(['Widget']),
    });

    const docModel = buildDocumentModel([widget], jsDoc, 'T');
    const defaultWidget = docModel.groups
      .find((group) => group.name === 'default')
      ?.erdEntities.find((entity) => entity.model.className === 'Widget');
    const homeWidget = docModel.groups
      .find((group) => group.name === 'Home')
      ?.erdEntities.find((entity) => entity.model.className === 'Widget');

    expect(defaultWidget?.model.columns.map((column) => column.fieldName)).toEqual(['id']);
    expect(homeWidget?.model.columns.map((column) => column.fieldName)).toEqual(['id', 'name']);
  });

  it('retains relations between entities explicitly assigned to default', () => {
    const customer = makeSimpleEntityMeta('Customer');
    const order = makeEntityMeta({
      className: 'Order',
      tableName: 'order',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        customer: {
          name: 'customer',
          fieldNames: ['customer_id'],
          type: 'Customer',
          kind: ReferenceKind.MANY_TO_ONE,
          referencedColumnNames: ['id'],
        },
      },
    });
    const jsDoc = makeJsDocResult({
      entities: new Map([
        ['Customer', { namespaces: ['default'], erdNamespaces: [], describeNamespaces: [], hidden: false }],
        ['Order', { namespaces: ['default'], erdNamespaces: [], describeNamespaces: [], hidden: false }],
      ]),
      classNames: new Set(['Customer', 'Order']),
    });

    const docModel = buildDocumentModel([customer, order], jsDoc, 'T');
    const defaultRelations = docModel.groups.find((group) => group.name === 'default')?.erdRelations;

    expect(defaultRelations).toEqual([
      expect.objectContaining({ fromEntity: 'Order', toEntity: 'Customer', label: 'customer' }),
    ]);
  });
});

describe('buildDocumentModel — Blog group', () => {
  it('Blog group erdEntities contains Author, Post, Tag', async () => {
    const docModel = await getFixtureDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const names = blog.erdEntities.map((e) => e.model.className);
    expect(names).toContain('Author');
    expect(names).toContain('Post');
    expect(names).toContain('Tag');
  });

  it('Blog group includes Post.author and Post.tags relations', async () => {
    const docModel = await getFixtureDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const labels = blog.erdRelations.map((r) => r.label);
    expect(labels).toContain('author');
    expect(labels).toContain('tags');
  });

  it('Blog group does NOT include Animals relations', async () => {
    const docModel = await getFixtureDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const hasExtendsEdge = blog.erdRelations.some((r) => r.label === 'extends');
    expect(hasExtendsEdge).toBe(false);
  });

  it('@atLeastOne on Author.posts upgrades the Post→Author edge to one-or-more', async () => {
    const docModel = await getFixtureDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const authorEdge = blog.erdRelations.find((r) => r.label === 'author')!;
    expect(authorEdge.fromCardinality).toBe('}|');
  });

  it('edges without @atLeastOne keep zero-or-more on the many side', async () => {
    const docModel = await getFixtureDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const tagsEdge = blog.erdRelations.find((r) => r.label === 'tags')!;
    expect(tagsEdge.fromCardinality).toBe('}o');
  });
});

describe('buildDocumentModel — Animals group', () => {
  it('Animals group has Animal, Dog, Cat entities', async () => {
    const docModel = await getFixtureDocModel();
    const animals = docModel.groups.find((g) => g.name === 'Animals')!;
    const names = animals.erdEntities.map((e) => e.model.className);
    expect(names).toContain('Animal');
    expect(names).toContain('Dog');
    expect(names).toContain('Cat');
  });

  it('Animals group has no extends edges', async () => {
    const docModel = await getFixtureDocModel();
    const animals = docModel.groups.find((g) => g.name === 'Animals')!;
    const extendsEdges = animals.erdRelations.filter((r) => r.label === 'extends');
    expect(extendsEdges).toHaveLength(0);
  });
});

describe('buildDocumentModel — @hidden', () => {
  it('hidden entities are excluded from all groups', async () => {
    const { metas, sourcePaths } = await loadEntityMetadata(config);
    const jsDocResult = loadJsDoc(sourcePaths);
    // Manually set Author as hidden
    jsDocResult.entities.set('Author', {
      namespaces: ['Blog'],
      erdNamespaces: [],
      describeNamespaces: [],
      hidden: true,
    });
    const docModel = buildDocumentModel(metas, jsDocResult, 'T');
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const names = blog.erdEntities.map((e) => e.model.className);
    expect(names).not.toContain('Author');
  });

  it('removes STI extends references to hidden root entities', () => {
    const animal = makeEntityMeta({
      className: 'Animal',
      tableName: 'animal',
      discriminatorColumn: 'type',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        type: { name: 'type', fieldNames: ['type'], type: 'string', kind: ReferenceKind.SCALAR },
      },
    });
    const dog = makeEntityMeta({
      className: 'Dog',
      tableName: 'animal',
      extends: 'Animal',
      discriminatorValue: 'dog',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        name: { name: 'name', fieldNames: ['name'], type: 'string', kind: ReferenceKind.SCALAR },
      },
    });
    const jsDoc = makeJsDocResult({
      entities: new Map([['Animal', { hidden: true, namespaces: [], erdNamespaces: [], describeNamespaces: [] }]]),
      classNames: new Set(['Animal', 'Dog']),
    });

    const docModel = buildDocumentModel([animal, dog], jsDoc, 'T');
    const dogEntity = docModel.groups.flatMap((group) => group.textEntities).find((e) => e.model.className === 'Dog');

    expect(dogEntity).toBeDefined();
    expect(dogEntity!.model.extendsEntity).toBeUndefined();
  });
});

describe('buildDocumentModel — STI property documentation inheritance', () => {
  it('merges visible ancestor docs root-to-child and lets the child override a property', () => {
    const root = createStiEntityMeta('Root', ['id', 'rootOnly', 'shared'], { discriminatorColumn: 'kind' });
    const middle = createStiEntityMeta('Middle', ['id', 'rootOnly', 'middleOnly', 'shared'], {
      extendsEntity: 'Root',
    });
    const leaf = createStiEntityMeta('Leaf', ['id', 'rootOnly', 'middleOnly', 'leafOnly', 'shared'], {
      extendsEntity: 'Middle',
      discriminatorValue: 'leaf',
    });
    const jsDoc = makeJsDocResult({
      props: new Map([
        [
          'Root',
          new Map([
            ['rootOnly', { description: 'root description', atLeastOne: false }],
            ['shared', { description: 'root shared', atLeastOne: false }],
          ]),
        ],
        [
          'Middle',
          new Map([
            ['middleOnly', { description: 'middle description', atLeastOne: false }],
            ['shared', { description: 'middle shared', atLeastOne: false }],
          ]),
        ],
        [
          'Leaf',
          new Map([
            ['leafOnly', { description: 'leaf description', atLeastOne: false }],
            ['shared', { description: 'leaf shared', atLeastOne: false }],
          ]),
        ],
      ]),
      classNames: new Set(['Root', 'Middle', 'Leaf']),
    });

    const leafEntity = buildDocumentModel([root, middle, leaf], jsDoc, 'T')
      .groups.flatMap((group) => group.textEntities)
      .find((entity) => entity.model.className === 'Leaf')!;

    expect(Object.fromEntries([...leafEntity.propDocs].map(([name, info]) => [name, info.description]))).toEqual({
      rootOnly: 'root description',
      shared: 'leaf shared',
      middleOnly: 'middle description',
      leafOnly: 'leaf description',
    });
  });

  // On v7 an unnormalized class never matches the metadata map keyed by class
  // name, so the ancestor walk stops immediately and inherited docs vanish with
  // no error.
  it('inherits ancestor docs when metadata carries the ancestor class instead of its name', () => {
    class Root {}
    const root = createStiEntityMeta('Root', ['id', 'rootOnly'], { discriminatorColumn: 'kind' });
    const leaf = createStiEntityMeta('Leaf', ['id', 'rootOnly', 'leafOnly'], {
      extendsEntity: Root,
      discriminatorValue: 'leaf',
    });
    const jsDoc = makeJsDocResult({
      props: new Map([
        ['Root', new Map([['rootOnly', { description: 'root description', atLeastOne: false }]])],
        ['Leaf', new Map([['leafOnly', { description: 'leaf description', atLeastOne: false }]])],
      ]),
      classNames: new Set(['Root', 'Leaf']),
    });

    const leafEntity = buildDocumentModel([root, leaf], jsDoc, 'T')
      .groups.flatMap((group) => group.textEntities)
      .find((entity) => entity.model.className === 'Leaf')!;

    expect(leafEntity.propDocs.get('rootOnly')?.description).toBe('root description');
    expect(leafEntity.propDocs.get('leafOnly')?.description).toBe('leaf description');
  });

  it('stops inheritance at a hidden ancestor without losing child docs', () => {
    const root = createStiEntityMeta('Root', ['id', 'rootOnly'], { discriminatorColumn: 'kind' });
    const hiddenMiddle = createStiEntityMeta('HiddenMiddle', ['id', 'rootOnly', 'middleOnly'], {
      extendsEntity: 'Root',
      discriminatorValue: 'middle',
    });
    const leaf = createStiEntityMeta('Leaf', ['id', 'rootOnly', 'middleOnly', 'leafOnly'], {
      extendsEntity: 'HiddenMiddle',
      discriminatorValue: 'leaf',
    });
    const jsDoc = makeJsDocResult({
      entities: new Map([
        ['HiddenMiddle', { hidden: true, namespaces: [], erdNamespaces: [], describeNamespaces: [] }],
      ]),
      props: new Map([
        ['Root', new Map([['rootOnly', { description: 'root description', atLeastOne: false }]])],
        ['HiddenMiddle', new Map([['middleOnly', { description: 'hidden description', atLeastOne: false }]])],
        ['Leaf', new Map([['leafOnly', { description: 'leaf description', atLeastOne: false }]])],
      ]),
      classNames: new Set(['Root', 'HiddenMiddle', 'Leaf']),
    });

    const leafEntity = buildDocumentModel([root, hiddenMiddle, leaf], jsDoc, 'T')
      .groups.flatMap((group) => group.textEntities)
      .find((entity) => entity.model.className === 'Leaf')!;

    expect(leafEntity.propDocs.get('leafOnly')?.description).toBe('leaf description');
    expect(leafEntity.propDocs.has('middleOnly')).toBe(false);
    expect(leafEntity.propDocs.has('rootOnly')).toBe(false);
  });

  it('terminates cyclic and self-referential ancestry while preserving child overrides', () => {
    const a = createStiEntityMeta('A', ['id', 'aOnly', 'shared'], {
      extendsEntity: 'B',
      discriminatorValue: 'a',
    });
    const b = createStiEntityMeta('B', ['id', 'bOnly', 'shared'], {
      extendsEntity: 'A',
      discriminatorValue: 'b',
    });
    const self = createStiEntityMeta('Self', ['id', 'selfOnly'], {
      extendsEntity: 'Self',
      discriminatorValue: 'self',
    });
    const jsDoc = makeJsDocResult({
      props: new Map([
        [
          'A',
          new Map([
            ['aOnly', { description: 'A only', atLeastOne: false }],
            ['shared', { description: 'A wins', atLeastOne: false }],
          ]),
        ],
        [
          'B',
          new Map([
            ['bOnly', { description: 'B only', atLeastOne: false }],
            ['shared', { description: 'B wins', atLeastOne: false }],
          ]),
        ],
        ['Self', new Map([['selfOnly', { description: 'self description', atLeastOne: false }]])],
      ]),
      classNames: new Set(['A', 'B', 'Self']),
    });

    const entities = buildDocumentModel([a, b, self], jsDoc, 'T').groups.flatMap((group) => group.textEntities);
    const aDocs = entities.find((entity) => entity.model.className === 'A')!.propDocs;
    const bDocs = entities.find((entity) => entity.model.className === 'B')!.propDocs;
    const selfDocs = entities.find((entity) => entity.model.className === 'Self')!.propDocs;

    expect(aDocs.get('bOnly')?.description).toBe('B only');
    expect(aDocs.get('shared')?.description).toBe('A wins');
    expect(bDocs.get('aOnly')?.description).toBe('A only');
    expect(bDocs.get('shared')?.description).toBe('B wins');
    expect(selfDocs.get('selfOnly')?.description).toBe('self description');
  });
});

describe('buildDocumentModel — cross-namespace @erd', () => {
  it('shows full columns for an entity that is included only via @erd', () => {
    const statsMeta = makeEntityMeta({
      className: 'DailyStats',
      tableName: 'daily_stats',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        day: { name: 'day', fieldNames: ['day'], type: 'date', kind: ReferenceKind.SCALAR },
        views: { name: 'views', fieldNames: ['views'], type: 'integer', kind: ReferenceKind.SCALAR },
      },
    });
    const jsDoc = makeJsDocResult({
      entities: new Map([
        ['DailyStats', { namespaces: [], erdNamespaces: ['Reporting'], describeNamespaces: [], hidden: false }],
      ]),
      classNames: new Set(['DailyStats']),
    });

    const docModel = buildDocumentModel([statsMeta], jsDoc, 'T');
    const reporting = docModel.groups.find((g) => g.name === 'Reporting')!;
    const stats = reporting.erdEntities.find((e) => e.model.className === 'DailyStats')!;

    expect(stats.model.columns.map((c) => c.fieldName)).toEqual(['id', 'day', 'views']);
  });

  it('shows only PK columns for entities that appear via @erd in a foreign namespace', () => {
    const widgetMeta = makeEntityMeta({
      className: 'Widget',
      tableName: 'widget',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        name: { name: 'name', fieldNames: ['name'], type: 'string', kind: ReferenceKind.SCALAR },
        code: { name: 'code', fieldNames: ['code'], type: 'string', kind: ReferenceKind.SCALAR },
      },
    });
    const jsDoc = makeJsDocResult({
      entities: new Map([
        ['Widget', { namespaces: ['GroupA'], erdNamespaces: ['GroupB'], describeNamespaces: [], hidden: false }],
      ]),
      classNames: new Set(['Widget']),
    });

    const docModel = buildDocumentModel([widgetMeta], jsDoc, 'T');

    const groupB = docModel.groups.find((g) => g.name === 'GroupB')!;
    const widgetInB = groupB.erdEntities.find((e) => e.model.className === 'Widget')!;
    expect(widgetInB.model.columns.map((c) => c.fieldName)).toEqual(['id']);

    const groupA = docModel.groups.find((g) => g.name === 'GroupA')!;
    const widgetInA = groupA.erdEntities.find((e) => e.model.className === 'Widget')!;
    expect(widgetInA.model.columns.map((c) => c.fieldName)).toContain('name');
    expect(widgetInA.model.columns.map((c) => c.fieldName)).toContain('code');
  });

  it('entity with @namespace on both groups shows full columns in both', () => {
    const nodeMeta = makeEntityMeta({
      className: 'Node',
      tableName: 'node',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        label: { name: 'label', fieldNames: ['label'], type: 'string', kind: ReferenceKind.SCALAR },
      },
    });
    const jsDoc = makeJsDocResult({
      entities: new Map([
        ['Node', { namespaces: ['Alpha', 'Beta'], erdNamespaces: [], describeNamespaces: [], hidden: false }],
      ]),
      classNames: new Set(['Node']),
    });

    const docModel = buildDocumentModel([nodeMeta], jsDoc, 'T');

    for (const groupName of ['Alpha', 'Beta']) {
      const group = docModel.groups.find((g) => g.name === groupName)!;
      const nodeInGroup = group.erdEntities.find((e) => e.model.className === 'Node')!;
      expect(nodeInGroup.model.columns.map((c) => c.fieldName)).toContain('label');
    }
  });
});

describe('buildDocumentModel — cross-namespace @erd edge cases', () => {
  it('treats @describe as a home namespace — shows full columns in ERD even with @erd', () => {
    // Bug #2: @describe X @erd X without @namespace X should NOT be treated as cross-namespace.
    // The entity's home is GroupB (via @describe), so GroupB ERD should show all columns.
    const itemMeta = makeEntityMeta({
      className: 'Item',
      tableName: 'item',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        title: { name: 'title', fieldNames: ['title'], type: 'string', kind: ReferenceKind.SCALAR },
      },
    });
    const jsDoc = makeJsDocResult({
      entities: new Map([
        ['Item', { namespaces: [], erdNamespaces: ['GroupB'], describeNamespaces: ['GroupB'], hidden: false }],
      ]),
      classNames: new Set(['Item']),
    });

    const docModel = buildDocumentModel([itemMeta], jsDoc, 'T');
    const groupB = docModel.groups.find((g) => g.name === 'GroupB')!;
    const itemInB = groupB.erdEntities.find((e) => e.model.className === 'Item')!;
    expect(itemInB.model.columns.map((c) => c.fieldName)).toContain('title');
  });

  it('excludes cross-namespace entity from ERD when it has no PK columns to show', () => {
    // Bug #3: If the only column is a FK-as-PK to a @hidden entity, pkColumns = [] after
    // the hidden-FK filter. The entity should be dropped entirely, not rendered as an empty box.
    const hiddenMeta = makeEntityMeta({
      className: 'Secret',
      tableName: 'secret',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
      },
    });
    const sharedPkMeta = makeEntityMeta({
      className: 'SharedPk',
      tableName: 'shared_pk',
      properties: {
        secret: {
          name: 'secret',
          fieldNames: ['id'],
          type: 'Secret',
          kind: ReferenceKind.MANY_TO_ONE,
          primary: true,
          nullable: false,
          referencedColumnNames: ['id'],
        },
      },
    });
    const jsDoc = makeJsDocResult({
      entities: new Map([
        ['Secret', { hidden: true, namespaces: [], erdNamespaces: [], describeNamespaces: [] }],
        ['SharedPk', { namespaces: ['Home'], erdNamespaces: ['Guest'], describeNamespaces: [], hidden: false }],
      ]),
      classNames: new Set(['Secret', 'SharedPk']),
    });

    const docModel = buildDocumentModel([hiddenMeta, sharedPkMeta], jsDoc, 'T');
    const guestGroup = docModel.groups.find((g) => g.name === 'Guest')!;
    const sharedPkInGuest = guestGroup.erdEntities.find((e) => e.model.className === 'SharedPk');
    // Entity dropped from Guest ERD because it has no PK columns left after hidden-FK filtering
    expect(sharedPkInGuest).toBeUndefined();
  });
});

describe('buildDocumentModel — enriched entities', () => {
  it('Author entity has jsDoc with description and namespace', async () => {
    const docModel = await getFixtureDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const author = blog.textEntities.find((e) => e.model.className === 'Author');
    expect(author).toBeDefined();
    expect(author!.jsDoc?.description).toBe('글 작성자');
    expect(author!.jsDoc?.namespaces).toContain('Blog');
  });

  it('Author propDocs has name and email descriptions', async () => {
    const docModel = await getFixtureDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const author = blog.textEntities.find((e) => e.model.className === 'Author')!;
    expect(author.propDocs.get('name')?.description).toBe('작성자 이름');
    expect(author.propDocs.get('email')?.description).toBe('이메일 주소');
  });
});

describe('buildDocumentModel — excludeColumns', () => {
  /** Scalar property whose DB column name differs from its property name (camelCase → snake_case). */
  function scalarProperty(name: string, fieldName: string, type = 'datetime'): Record<string, unknown> {
    return { name, fieldNames: [fieldName], type, kind: ReferenceKind.SCALAR };
  }

  function auditedEntityMeta(className: string, extra: Record<string, unknown> = {}): EntityMetadata {
    return makeEntityMeta({
      className,
      tableName: className.toLowerCase(),
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        createdAt: scalarProperty('createdAt', 'created_at'),
        updatedAt: scalarProperty('updatedAt', 'updated_at'),
        ...extra,
      },
    });
  }

  function manyToOne(name: string, type: string, fieldNames: string[]): Record<string, unknown> {
    return { name, fieldNames, type, kind: ReferenceKind.MANY_TO_ONE, referencedColumnNames: ['id'] };
  }

  function textEntity(docModel: DocumentModel, className: string): EnrichedEntity {
    return docModel.groups.flatMap((g) => g.textEntities).find((e) => e.model.className === className)!;
  }

  function erdEntity(docModel: DocumentModel, className: string): EnrichedEntity {
    return docModel.groups.flatMap((g) => g.erdEntities).find((e) => e.model.className === className)!;
  }

  function fieldNamesOf(entity: { model: { columns: { fieldName: string }[] } }): string[] {
    return entity.model.columns.map((column) => column.fieldName);
  }

  it('drops listed DB columns from every entity in both the ERD and the text tables', () => {
    const metas = [auditedEntityMeta('User'), auditedEntityMeta('Post')];

    const docModel = buildDocumentModel(metas, makeJsDocResult(), 'T', {
      excludeColumns: ['created_at', 'updated_at'],
    });

    for (const className of ['User', 'Post']) {
      expect(fieldNamesOf(textEntity(docModel, className))).toEqual(['id']);
      expect(fieldNamesOf(erdEntity(docModel, className))).toEqual(['id']);
    }
  });

  it('matches DB column names exactly, not property names', () => {
    const metas = [auditedEntityMeta('User')];

    const docModel = buildDocumentModel(metas, makeJsDocResult(), 'T', { excludeColumns: ['createdAt', 'updated'] });

    expect(fieldNamesOf(textEntity(docModel, 'User'))).toEqual(['id', 'created_at', 'updated_at']);
  });

  it('leaves the model untouched when the list is empty', () => {
    const metas = [auditedEntityMeta('User')];

    const docModel = buildDocumentModel(metas, makeJsDocResult(), 'T', { excludeColumns: [] });

    expect(fieldNamesOf(textEntity(docModel, 'User'))).toEqual(['id', 'created_at', 'updated_at']);
  });

  it('removes an excluded FK column together with its relation edge', () => {
    const user = makeSimpleEntityMeta('User');
    const team = makeSimpleEntityMeta('Team');
    const post = auditedEntityMeta('Post', {
      createdBy: manyToOne('createdBy', 'User', ['created_by']),
      team: manyToOne('team', 'Team', ['team_id']),
    });

    const docModel = buildDocumentModel([post, user, team], makeJsDocResult(), 'T', { excludeColumns: ['created_by'] });

    expect(fieldNamesOf(textEntity(docModel, 'Post'))).toEqual(['id', 'created_at', 'updated_at', 'team_id']);
    const labels = docModel.groups.flatMap((g) => g.erdRelations).map((edge) => edge.label);
    expect(labels).toEqual(['team']);
  });

  it('only removes the edge owned by the entity whose FK column was excluded', () => {
    // Both entities have an FK property named "owner"; only Post's column is excluded.
    const user = makeSimpleEntityMeta('User');
    const post = auditedEntityMeta('Post', { owner: manyToOne('owner', 'User', ['post_owner_id']) });
    const team = auditedEntityMeta('Team', { owner: manyToOne('owner', 'User', ['team_owner_id']) });

    const docModel = buildDocumentModel([post, team, user], makeJsDocResult(), 'T', {
      excludeColumns: ['post_owner_id'],
    });

    const edges = docModel.groups.flatMap((g) => g.erdRelations);
    expect(edges.map((edge) => `${edge.fromEntity}.${edge.label}`)).toEqual(['Team.owner']);
  });

  it('removes a composite FK and its edge when every one of its columns is listed', () => {
    const tenantUser = makeEntityMeta({
      className: 'TenantUser',
      tableName: 'tenant_user',
      primaryKeys: ['tenantId', 'id'],
      properties: {
        tenantId: { ...pkProperty('tenantId'), fieldNames: ['tenant_id'] },
        id: pkProperty(),
      },
    });
    const doc = makeEntityMeta({
      className: 'Doc',
      tableName: 'doc',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        author: manyToOne('author', 'TenantUser', ['author_tenant_id', 'author_id']),
      },
    });
    const warnings: string[] = [];

    const docModel = buildDocumentModel([doc, tenantUser], makeJsDocResult(), 'T', {
      onWarn: (message: string) => {
        warnings.push(message);
      },
      excludeColumns: ['author_tenant_id', 'author_id'],
    });

    expect(fieldNamesOf(textEntity(docModel, 'Doc'))).toEqual(['id']);
    expect(docModel.groups.flatMap((g) => g.erdRelations)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('warns and leaves a composite FK untouched when only some of its columns are listed', () => {
    const tenantUser = makeEntityMeta({
      className: 'TenantUser',
      tableName: 'tenant_user',
      primaryKeys: ['tenantId', 'id'],
      properties: {
        tenantId: { ...pkProperty('tenantId'), fieldNames: ['tenant_id'] },
        id: pkProperty(),
      },
    });
    const doc = makeEntityMeta({
      className: 'Doc',
      tableName: 'doc',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        author: manyToOne('author', 'TenantUser', ['author_tenant_id', 'author_id']),
      },
    });
    const calls: [string, StructuredMessage | undefined][] = [];

    const docModel = buildDocumentModel([doc, tenantUser], makeJsDocResult(), 'T', {
      onWarn: (message: string, warning?: StructuredMessage) => {
        calls.push([message, warning]);
      },
      excludeColumns: ['author_tenant_id'],
    });

    expect(fieldNamesOf(textEntity(docModel, 'Doc'))).toEqual(['id', 'author_tenant_id', 'author_id']);
    expect(docModel.groups.flatMap((g) => g.erdRelations).map((edge) => edge.label)).toEqual(['author']);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toContain('Doc.author');
    expect(calls[0]?.[1]).toMatchObject({ title: 'Composite foreign key partially excluded' });
    expect(calls[0]?.[1]?.detail).toContain('author_tenant_id');
  });

  it('warns once, naming the STI root, when children inherit a partially excluded composite FK', () => {
    // STI children repeat the root's FK property on the same table, so one key must not warn per subclass.
    const owner = manyToOne('owner', 'TenantUser', ['owner_tenant_id', 'owner_id']);
    const stiMeta = (className: string, sti: Record<string, unknown>): EntityMetadata =>
      makeEntityMeta({
        className,
        tableName: 'animal',
        primaryKeys: ['id'],
        properties: { id: pkProperty(), owner },
        ...sti,
      });
    const animal = stiMeta('Animal', { discriminatorColumn: 'type' });
    const dog = stiMeta('Dog', { extends: 'Animal', discriminatorValue: 'dog' });
    const cat = stiMeta('Cat', { extends: 'Animal', discriminatorValue: 'cat' });
    const messages: string[] = [];

    // Children come first so the root is named by lookup, not by iteration order.
    const docModel = buildDocumentModel(
      [dog, cat, animal, makeSimpleEntityMeta('TenantUser')],
      makeJsDocResult(),
      'T',
      {
        onWarn: (message: string) => {
          messages.push(message);
        },
        excludeColumns: ['owner_tenant_id'],
      }
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Animal.owner');
    for (const className of ['Animal', 'Dog', 'Cat']) {
      expect(fieldNamesOf(textEntity(docModel, className))).toEqual(['id', 'owner_tenant_id', 'owner_id']);
    }
  });

  it('warns for each entity when unrelated entities have partially excluded composite FKs', () => {
    const post = auditedEntityMeta('Post', {
      author: manyToOne('author', 'TenantUser', ['author_tenant_id', 'author_id']),
    });
    const comment = auditedEntityMeta('Comment', {
      author: manyToOne('author', 'TenantUser', ['author_tenant_id', 'author_id']),
    });
    const messages: string[] = [];

    buildDocumentModel([post, comment, makeSimpleEntityMeta('TenantUser')], makeJsDocResult(), 'T', {
      onWarn: (message: string) => {
        messages.push(message);
      },
      excludeColumns: ['author_tenant_id'],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('Post.author');
    expect(messages[1]).toContain('Comment.author');
  });

  it('keeps index, unique, and check constraints that cover an excluded column', () => {
    const user = makeEntityMeta({
      className: 'User',
      tableName: 'user',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        email: scalarProperty('email', 'email', 'string'),
        deletedAt: scalarProperty('deletedAt', 'deleted_at'),
      },
      indexes: [{ name: 'user_deleted_idx', properties: ['deletedAt'] }],
      uniques: [{ name: 'user_email_live_uq', properties: ['email', 'deletedAt'] }],
      checks: [{ name: 'user_deleted_check', expression: 'deleted_at > 0' }],
    });

    const withoutExclusion = buildDocumentModel([user], makeJsDocResult(), 'T');
    const withExclusion = buildDocumentModel([user], makeJsDocResult(), 'T', { excludeColumns: ['deleted_at'] });

    expect(fieldNamesOf(textEntity(withExclusion, 'User'))).toEqual(['id', 'email']);
    expect(textEntity(withExclusion, 'User').model.constraints).toEqual(
      textEntity(withoutExclusion, 'User').model.constraints
    );
    expect(textEntity(withExclusion, 'User').model.constraints).toHaveLength(3);
  });

  it('drops an entity from a foreign @erd diagram when all of its primary-key columns are excluded', () => {
    // A cross-namespace @erd box renders only PK columns; with none left it is removed, edges included.
    const order = makeEntityMeta({
      className: 'Order',
      tableName: 'order',
      primaryKeys: ['id'],
      properties: { id: pkProperty(), customer: manyToOne('customer', 'Customer', ['customer_id']) },
    });
    const customer = makeSimpleEntityMeta('Customer');
    const jsDoc = makeJsDocResult({
      entities: new Map([
        ['Order', { hidden: false, namespaces: ['Shop'], erdNamespaces: [], describeNamespaces: [] }],
        ['Customer', { hidden: false, namespaces: ['Crm'], erdNamespaces: ['Shop'], describeNamespaces: [] }],
      ]),
    });

    const docModel = buildDocumentModel([order, customer], jsDoc, 'T', { excludeColumns: ['id'] });
    const shop = docModel.groups.find((group) => group.name === 'Shop')!;
    const crm = docModel.groups.find((group) => group.name === 'Crm')!;

    expect(shop.erdEntities.map((entity) => entity.model.className)).toEqual(['Order']);
    expect(shop.erdRelations).toEqual([]);
    // Its home namespace still renders it, just without the excluded column.
    expect(crm.erdEntities.map((entity) => entity.model.className)).toEqual(['Customer']);
    expect(fieldNamesOf(crm.erdEntities[0]!)).toEqual([]);
  });

  it('still drops constraints on an FK to a @hidden entity when that FK column is also excluded', () => {
    // The output must not depend on whether a hidden-target FK is also listed in excludeColumns.
    const order = makeEntityMeta({
      className: 'Order',
      tableName: 'order',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        status: scalarProperty('status', 'status', 'string'),
        secret: manyToOne('secret', 'Secret', ['secret_id']),
      },
      indexes: [
        { name: 'order_secret_idx', properties: ['secret'] },
        { name: 'order_status_idx', properties: ['status'] },
      ],
      uniques: [{ name: 'order_secret_uq', properties: ['secret_id'] }],
    });
    const jsDoc = makeJsDocResult({
      entities: new Map([['Secret', { hidden: true, namespaces: [], erdNamespaces: [], describeNamespaces: [] }]]),
    });
    const metas = [order, makeSimpleEntityMeta('Secret')];

    const hiddenOnly = buildDocumentModel(metas, jsDoc, 'T');
    const hiddenAndExcluded = buildDocumentModel(metas, jsDoc, 'T', { excludeColumns: ['secret_id'] });

    expect(textEntity(hiddenAndExcluded, 'Order').model).toEqual(textEntity(hiddenOnly, 'Order').model);
    expect(textEntity(hiddenAndExcluded, 'Order').model.constraints).toEqual([
      { type: 'index', properties: ['status'], name: 'order_status_idx' },
    ]);
  });

  it('does not report @atLeastOne as ineffective when its edge was removed by an excluded FK column', () => {
    const parent = makeEntityMeta({
      className: 'Parent',
      tableName: 'parent',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        children: { name: 'children', type: 'Child', kind: ReferenceKind.ONE_TO_MANY, mappedBy: 'parent' },
      },
    });
    const child = makeEntityMeta({
      className: 'Child',
      tableName: 'child',
      primaryKeys: ['id'],
      properties: { id: pkProperty(), parent: manyToOne('parent', 'Parent', ['parent_id']) },
    });
    const warnings: string[] = [];

    const docModel = buildDocumentModel([parent, child], createAtLeastOneJsDoc('Parent', 'children'), 'T', {
      onWarn: (message: string) => {
        warnings.push(message);
      },
      excludeColumns: ['parent_id'],
    });

    expect(docModel.groups.flatMap((g) => g.erdRelations)).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
