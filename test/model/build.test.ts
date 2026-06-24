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
