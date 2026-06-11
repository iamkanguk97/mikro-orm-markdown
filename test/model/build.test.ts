import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { loadJsDoc } from '../../src/docs/jsdoc.js';
import { loadEntityMetadata } from '../../src/metadata/load.js';
import { buildDocumentModel } from '../../src/model/build.js';
import config from '../fixtures/mikro-orm.config.js';

const FIXTURES_GLOB = path.resolve(import.meta.dirname, '../fixtures/entities/*.ts');

async function getDocModel() {
  const metas = await loadEntityMetadata(config);
  const jsDocResult = loadJsDoc([FIXTURES_GLOB]);
  return buildDocumentModel(metas, jsDocResult, 'Test DB');
}

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
    const metas = await loadEntityMetadata(config);
    // Pass empty globs so no JSDoc loaded → all entities fall into "default"
    const docModel = buildDocumentModel(metas, { entities: new Map(), props: new Map() }, 'T');
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

  it('Animals group has extends edges for Dog and Cat', async () => {
    const docModel = await getDocModel();
    const animals = docModel.groups.find((g) => g.name === 'Animals')!;
    const extendsEdges = animals.erdRelations.filter((r) => r.label === 'extends');
    expect(extendsEdges).toHaveLength(2);
  });
});

describe('buildDocumentModel — @hidden', () => {
  it('hidden entities are excluded from all groups', async () => {
    const metas = await loadEntityMetadata(config);
    const jsDocResult = loadJsDoc([FIXTURES_GLOB]);
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
