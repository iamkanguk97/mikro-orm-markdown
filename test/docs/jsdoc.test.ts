import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { loadJsDoc } from '../../src/docs/jsdoc.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_GLOB = path.resolve(TEST_DIR, '../fixtures/entities/*.ts');

describe('loadJsDoc', () => {
  it('returns empty maps for empty glob list', () => {
    const result = loadJsDoc([]);
    expect(result.entities.size).toBe(0);
    expect(result.props.size).toBe(0);
    expect(result.sourceFileCount).toBe(0);
    expect(result.classNames.size).toBe(0);
  });

  it('never throws on an unreadable file and still parses valid sources (M6)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsdoc-m6-'));
    const unreadable = path.join(dir, 'Unreadable.ts');
    fs.writeFileSync(unreadable, 'export class Unreadable {}\n');
    fs.chmodSync(unreadable, 0o000);
    const onWarn = vi.fn();

    try {
      const result = loadJsDoc([unreadable, FIXTURES_GLOB], onWarn);
      // The bad path is absorbed; valid fixtures are still parsed.
      expect(result.entities.get('Author')).toBeDefined();
      expect(result.sourceFileCount).toBeGreaterThan(0);
      expect(result.classNames).toContain('Author');
      expect(onWarn).toHaveBeenCalledOnce();
      expect(String(onWarn.mock.calls[0]?.[0])).toContain('Could not load JSDoc source path');
    } finally {
      fs.chmodSync(unreadable, 0o644);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports zero source files for unmatched explicit paths', () => {
    const result = loadJsDoc([path.resolve(TEST_DIR, '../fixtures/entities/no-match-*.ts')]);

    expect(result.sourceFileCount).toBe(0);
    expect(result.entities.size).toBe(0);
    expect(result.props.size).toBe(0);
    expect(result.classNames.size).toBe(0);
  });

  it('warns when an exact source path matches no files', () => {
    const onWarn = vi.fn();
    const missingPath = path.resolve(TEST_DIR, '../fixtures/entities/NoMatch.ts');

    const result = loadJsDoc([missingPath], onWarn);

    expect(result.sourceFileCount).toBe(0);
    expect(onWarn).toHaveBeenCalledOnce();
    expect(String(onWarn.mock.calls[0]?.[0])).toContain('No JSDoc source file matched path');
  });

  it('extracts @namespace tag from Author entity', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    const author = result.entities.get('Author');
    expect(author).toBeDefined();
    expect(author!.namespaces).toContain('Blog');
  });

  it('extracts entity description from class JSDoc', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    const author = result.entities.get('Author');
    expect(author!.description).toBe('글 작성자');
  });

  it('Post has @namespace Blog and description', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    const post = result.entities.get('Post');
    expect(post).toBeDefined();
    expect(post!.namespaces).toContain('Blog');
    expect(post!.description).toBe('블로그 게시글');
  });

  it('Customer has @namespace Shop', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    const customer = result.entities.get('Customer');
    expect(customer).toBeDefined();
    expect(customer!.namespaces).toContain('Shop');
  });

  it('Animal, Dog, Cat all have @namespace Animals', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    expect(result.entities.get('Animal')?.namespaces).toContain('Animals');
    expect(result.entities.get('Dog')?.namespaces).toContain('Animals');
    expect(result.entities.get('Cat')?.namespaces).toContain('Animals');
  });

  it('entities without @hidden have hidden=false', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    for (const [, info] of result.entities) {
      expect(info.hidden).toBe(false);
    }
  });

  it('entities without @erd or @describe have empty arrays', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    const author = result.entities.get('Author');
    expect(author!.erdNamespaces).toHaveLength(0);
    expect(author!.describeNamespaces).toHaveLength(0);
  });
});

describe('loadJsDoc — property descriptions', () => {
  it('extracts property description from Author.name', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    const authorProps = result.props.get('Author');
    expect(authorProps).toBeDefined();
    expect(authorProps!.get('name')?.description).toBe('작성자 이름');
  });

  it('extracts property description from Author.email', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    const authorProps = result.props.get('Author');
    expect(authorProps!.get('email')?.description).toBe('이메일 주소');
  });

  it('extracts property descriptions from Post', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    const postProps = result.props.get('Post');
    expect(postProps).toBeDefined();
    expect(postProps!.get('title')?.description).toBe('게시글 제목');
    expect(postProps!.get('body')?.description).toBe('게시글 본문');
  });

  it('properties without JSDoc are not included in propMap', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    // Tag has label with JSDoc, but id (no JSDoc) should not appear
    const tagProps = result.props.get('Tag');
    expect(tagProps?.get('id')).toBeUndefined();
  });

  it('extracts property descriptions from getter accessors and constructor parameter properties', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsdoc-accessors-'));
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

    try {
      const result = loadJsDoc([sourcePath]);
      const props = result.props.get('AccessorEntity');

      expect(props?.get('displayName')?.description).toBe('Constructor-declared {@link User} display name');
      expect(props?.get('score')?.description).toBe('Getter-declared score');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('loadJsDoc — @atLeastOne', () => {
  it('parses @atLeastOne on a collection property', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    const authorProps = result.props.get('Author');
    expect(authorProps!.get('posts')?.atLeastOne).toBe(true);
  });

  it('properties without @atLeastOne have atLeastOne=false', () => {
    const result = loadJsDoc([FIXTURES_GLOB]);
    const authorProps = result.props.get('Author');
    expect(authorProps!.get('name')?.atLeastOne).toBe(false);
  });

  it('parses @atLeastOne on getter accessors and constructor parameter properties', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsdoc-at-least-one-accessors-'));
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

    try {
      const result = loadJsDoc([sourcePath]);
      const props = result.props.get('RelationEntity');

      expect(props?.get('constructorItems')?.atLeastOne).toBe(true);
      expect(props?.get('getterItems')?.atLeastOne).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('loadJsDoc — @hidden and @erd/@describe', () => {
  it('parses every supported tag, explicit default values, and duplicate tags from source', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsdoc-supported-tags-'));
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

    try {
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
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
