import { type EntityMetadata, ReferenceKind } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import type { JsDocResult } from '../../src/docs/jsdoc.js';
import { loadJsDoc } from '../../src/docs/jsdoc.js';
import { loadEntityMetadata } from '../../src/metadata/load.js';
import { buildDocumentModel, type DocumentModel } from '../../src/model/build.js';
import config from '../fixtures/mikro-orm.config.js';

async function getDocModel(): Promise<DocumentModel> {
  const { metas, sourcePaths } = await loadEntityMetadata(config);
  const jsDocResult = loadJsDoc(sourcePaths);
  return buildDocumentModel(metas, jsDocResult, 'Test DB');
}

function createManyToManyMetas(): EntityMetadata[] {
  const post = Object.assign({} as EntityMetadata, {
    className: 'Post',
    tableName: 'post',
    primaryKeys: ['id'],
    properties: {
      id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
      tags: { name: 'tags', type: 'Tag', kind: ReferenceKind.MANY_TO_MANY, owner: true },
    },
  });
  const tag = Object.assign({} as EntityMetadata, {
    className: 'Tag',
    tableName: 'tag',
    primaryKeys: ['id'],
    properties: {
      id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
      posts: { name: 'posts', type: 'Post', kind: ReferenceKind.MANY_TO_MANY, mappedBy: 'tags' },
    },
  });

  return [post, tag];
}

function createAtLeastOneJsDoc(className: string, propName: string): JsDocResult {
  return {
    entities: new Map(),
    props: new Map([[className, new Map([[propName, { atLeastOne: true }]])]]),
    sourceFileCount: 0,
    classNames: new Set(),
  };
}

describe('buildDocumentModel — @atLeastOne warnings (L2)', () => {
  it('warns when @atLeastOne cannot be matched to a relation edge', () => {
    // A unidirectional @OneToMany (no mappedBy) produces no edge to adjust.
    const parent = Object.assign({} as EntityMetadata, {
      className: 'Parent',
      tableName: 'parent',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        children: { name: 'children', type: 'Child', kind: ReferenceKind.ONE_TO_MANY },
      },
    });
    const jsDoc: JsDocResult = {
      entities: new Map(),
      props: new Map([['Parent', new Map([['children', { atLeastOne: true }]])]]),
      sourceFileCount: 0,
      classNames: new Set(),
    };

    const onWarn = vi.fn();
    buildDocumentModel([parent], jsDoc, 'T', undefined, onWarn);

    expect(onWarn).toHaveBeenCalledOnce();
    expect(String(onWarn.mock.calls[0]?.[0])).toContain('@atLeastOne on Parent.children');
    expect(onWarn.mock.calls[0]?.[1]).toMatchObject({ title: '@atLeastOne had no effect' });
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
    const order = Object.assign({} as EntityMetadata, {
      className: 'Order',
      tableName: 'order',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        secret: {
          name: 'secret',
          fieldNames: ['secret_id'],
          type: 'Secret',
          kind: ReferenceKind.MANY_TO_ONE,
          referencedColumnNames: ['id'],
        },
      },
    });
    const secret = Object.assign({} as EntityMetadata, {
      className: 'Secret',
      tableName: 'secret',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
      },
    });
    const jsDoc: JsDocResult = {
      entities: new Map([['Secret', { hidden: true, namespaces: [], erdNamespaces: [], describeNamespaces: [] }]]),
      props: new Map(),
      sourceFileCount: 0,
      classNames: new Set(),
    };

    const docModel = buildDocumentModel([order, secret], jsDoc, 'T');
    const orderEntity = docModel.groups.flatMap((g) => g.textEntities).find((e) => e.model.className === 'Order');

    const fieldNames = orderEntity!.model.columns.map((c) => c.fieldName);
    expect(fieldNames).toEqual(['id']);
    expect(fieldNames).not.toContain('secret_id');
  });
});

describe('buildDocumentModel — groups', () => {
  it('produces expected namespace groups from fixtures', async () => {
    const docModel = await getDocModel();
    const groupNames = docModel.groups.map((g) => g.name);
    expect(groupNames).toContain('Animals');
    expect(groupNames).toContain('Blog');
    expect(groupNames).toContain('Shop');
  });

  it('"default" group is absent when every entity has a @namespace', async () => {
    const docModel = await getDocModel();
    const groupNames = docModel.groups.map((g) => g.name);
    expect(groupNames).not.toContain('default');
  });

  it('"default" is sorted last when it exists', async () => {
    const { metas } = await loadEntityMetadata(config);
    // Pass empty jsDocResult so no JSDoc loaded → all entities fall into "default"
    const docModel = buildDocumentModel(
      metas,
      { entities: new Map(), props: new Map(), sourceFileCount: 0, classNames: new Set() },
      'T'
    );
    const groupNames = docModel.groups.map((g) => g.name);
    expect(groupNames[groupNames.length - 1]).toBe('default');
  });

  it('title is set correctly', async () => {
    const docModel = await getDocModel();
    expect(docModel.title).toBe('Test DB');
  });

  it('groups are sorted alphabetically (Animals before Blog before Shop)', async () => {
    const docModel = await getDocModel();
    const groupNames = docModel.groups.map((g) => g.name);
    const sorted = [...groupNames].sort((a, b) => a.localeCompare(b));
    expect(groupNames).toEqual(sorted);
  });
});

describe('buildDocumentModel — Blog group', () => {
  it('Blog group erdEntities contains Author, Post, Tag', async () => {
    const docModel = await getDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const names = blog.erdEntities.map((e) => e.model.className);
    expect(names).toContain('Author');
    expect(names).toContain('Post');
    expect(names).toContain('Tag');
  });

  it('Blog group includes Post.author and Post.tags relations', async () => {
    const docModel = await getDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const labels = blog.erdRelations.map((r) => r.label);
    expect(labels).toContain('author');
    expect(labels).toContain('tags');
  });

  it('Blog group does NOT include Animals relations', async () => {
    const docModel = await getDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const hasExtendsEdge = blog.erdRelations.some((r) => r.label === 'extends');
    expect(hasExtendsEdge).toBe(false);
  });

  it('@atLeastOne on Author.posts upgrades the Post→Author edge to one-or-more', async () => {
    const docModel = await getDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const authorEdge = blog.erdRelations.find((r) => r.label === 'author')!;
    expect(authorEdge.fromCardinality).toBe('}|');
  });

  it('edges without @atLeastOne keep zero-or-more on the many side', async () => {
    const docModel = await getDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const tagsEdge = blog.erdRelations.find((r) => r.label === 'tags')!;
    expect(tagsEdge.fromCardinality).toBe('}o');
  });
});

describe('buildDocumentModel — Animals group', () => {
  it('Animals group has Animal, Dog, Cat entities', async () => {
    const docModel = await getDocModel();
    const animals = docModel.groups.find((g) => g.name === 'Animals')!;
    const names = animals.erdEntities.map((e) => e.model.className);
    expect(names).toContain('Animal');
    expect(names).toContain('Dog');
    expect(names).toContain('Cat');
  });

  it('Animals group has no extends edges', async () => {
    const docModel = await getDocModel();
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
    const animal = Object.assign({} as EntityMetadata, {
      className: 'Animal',
      tableName: 'animal',
      discriminatorColumn: 'type',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        type: { name: 'type', fieldNames: ['type'], type: 'string', kind: ReferenceKind.SCALAR },
      },
    });
    const dog = Object.assign({} as EntityMetadata, {
      className: 'Dog',
      tableName: 'animal',
      extends: 'Animal',
      discriminatorValue: 'dog',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        name: { name: 'name', fieldNames: ['name'], type: 'string', kind: ReferenceKind.SCALAR },
      },
    });
    const jsDoc: JsDocResult = {
      entities: new Map([['Animal', { hidden: true, namespaces: [], erdNamespaces: [], describeNamespaces: [] }]]),
      props: new Map(),
      sourceFileCount: 0,
      classNames: new Set(['Animal', 'Dog']),
    };

    const docModel = buildDocumentModel([animal, dog], jsDoc, 'T');
    const dogEntity = docModel.groups.flatMap((group) => group.textEntities).find((e) => e.model.className === 'Dog');

    expect(dogEntity).toBeDefined();
    expect(dogEntity!.model.extendsEntity).toBeUndefined();
  });
});

describe('buildDocumentModel — cross-namespace @erd', () => {
  it('shows full columns for an entity that is included only via @erd', () => {
    const statsMeta = Object.assign({} as EntityMetadata, {
      className: 'DailyStats',
      tableName: 'daily_stats',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        day: { name: 'day', fieldNames: ['day'], type: 'date', kind: ReferenceKind.SCALAR },
        views: { name: 'views', fieldNames: ['views'], type: 'integer', kind: ReferenceKind.SCALAR },
      },
    });
    const jsDoc: JsDocResult = {
      entities: new Map([
        ['DailyStats', { namespaces: [], erdNamespaces: ['Reporting'], describeNamespaces: [], hidden: false }],
      ]),
      props: new Map(),
      sourceFileCount: 0,
      classNames: new Set(['DailyStats']),
    };

    const docModel = buildDocumentModel([statsMeta], jsDoc, 'T');
    const reporting = docModel.groups.find((g) => g.name === 'Reporting')!;
    const stats = reporting.erdEntities.find((e) => e.model.className === 'DailyStats')!;

    expect(stats.model.columns.map((c) => c.fieldName)).toEqual(['id', 'day', 'views']);
  });

  it('shows only PK columns for entities that appear via @erd in a foreign namespace', () => {
    const widgetMeta = Object.assign({} as EntityMetadata, {
      className: 'Widget',
      tableName: 'widget',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        name: { name: 'name', fieldNames: ['name'], type: 'string', kind: ReferenceKind.SCALAR },
        code: { name: 'code', fieldNames: ['code'], type: 'string', kind: ReferenceKind.SCALAR },
      },
    });
    const jsDoc: JsDocResult = {
      entities: new Map([
        ['Widget', { namespaces: ['GroupA'], erdNamespaces: ['GroupB'], describeNamespaces: [], hidden: false }],
      ]),
      props: new Map(),
      sourceFileCount: 0,
      classNames: new Set(['Widget']),
    };

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
    const nodeMeta = Object.assign({} as EntityMetadata, {
      className: 'Node',
      tableName: 'node',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        label: { name: 'label', fieldNames: ['label'], type: 'string', kind: ReferenceKind.SCALAR },
      },
    });
    const jsDoc: JsDocResult = {
      entities: new Map([
        ['Node', { namespaces: ['Alpha', 'Beta'], erdNamespaces: [], describeNamespaces: [], hidden: false }],
      ]),
      props: new Map(),
      sourceFileCount: 0,
      classNames: new Set(['Node']),
    };

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
    const itemMeta = Object.assign({} as EntityMetadata, {
      className: 'Item',
      tableName: 'item',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        title: { name: 'title', fieldNames: ['title'], type: 'string', kind: ReferenceKind.SCALAR },
      },
    });
    const jsDoc: JsDocResult = {
      entities: new Map([
        ['Item', { namespaces: [], erdNamespaces: ['GroupB'], describeNamespaces: ['GroupB'], hidden: false }],
      ]),
      props: new Map(),
      sourceFileCount: 0,
      classNames: new Set(['Item']),
    };

    const docModel = buildDocumentModel([itemMeta], jsDoc, 'T');
    const groupB = docModel.groups.find((g) => g.name === 'GroupB')!;
    const itemInB = groupB.erdEntities.find((e) => e.model.className === 'Item')!;
    expect(itemInB.model.columns.map((c) => c.fieldName)).toContain('title');
  });

  it('excludes cross-namespace entity from ERD when it has no PK columns to show', () => {
    // Bug #3: If the only column is a FK-as-PK to a @hidden entity, pkColumns = [] after
    // the hidden-FK filter. The entity should be dropped entirely, not rendered as an empty box.
    const hiddenMeta = Object.assign({} as EntityMetadata, {
      className: 'Secret',
      tableName: 'secret',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
      },
    });
    const sharedPkMeta = Object.assign({} as EntityMetadata, {
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
    const jsDoc: JsDocResult = {
      entities: new Map([
        ['Secret', { hidden: true, namespaces: [], erdNamespaces: [], describeNamespaces: [] }],
        ['SharedPk', { namespaces: ['Home'], erdNamespaces: ['Guest'], describeNamespaces: [], hidden: false }],
      ]),
      props: new Map(),
      sourceFileCount: 0,
      classNames: new Set(['Secret', 'SharedPk']),
    };

    const docModel = buildDocumentModel([hiddenMeta, sharedPkMeta], jsDoc, 'T');
    const guestGroup = docModel.groups.find((g) => g.name === 'Guest')!;
    const sharedPkInGuest = guestGroup.erdEntities.find((e) => e.model.className === 'SharedPk');
    // Entity dropped from Guest ERD because it has no PK columns left after hidden-FK filtering
    expect(sharedPkInGuest).toBeUndefined();
  });
});

describe('buildDocumentModel — enriched entities', () => {
  it('Author entity has jsDoc with description and namespace', async () => {
    const docModel = await getDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const author = blog.textEntities.find((e) => e.model.className === 'Author');
    expect(author).toBeDefined();
    expect(author!.jsDoc?.description).toBe('글 작성자');
    expect(author!.jsDoc?.namespaces).toContain('Blog');
  });

  it('Author propDocs has name and email descriptions', async () => {
    const docModel = await getDocModel();
    const blog = docModel.groups.find((g) => g.name === 'Blog')!;
    const author = blog.textEntities.find((e) => e.model.className === 'Author')!;
    expect(author.propDocs.get('name')?.description).toBe('작성자 이름');
    expect(author.propDocs.get('email')?.description).toBe('이메일 주소');
  });
});
