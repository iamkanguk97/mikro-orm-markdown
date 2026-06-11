import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { loadJsDoc } from '../../src/docs/jsdoc.js';
import { loadEntityMetadata } from '../../src/metadata/load.js';
import { buildDocumentModel } from '../../src/model/build.js';
import { renderMarkdown } from '../../src/render/markdown.js';
import config from '../fixtures/mikro-orm.config.js';

const FIXTURES_GLOB = path.resolve(import.meta.dirname, '../fixtures/entities/*.ts');

async function getMarkdown(): Promise<string> {
  const metas = await loadEntityMetadata(config);
  const jsDocResult = loadJsDoc([FIXTURES_GLOB]);
  const docModel = buildDocumentModel(metas, jsDocResult, 'Test DB');
  return renderMarkdown(docModel);
}

describe('renderMarkdown — structure', () => {
  it('starts with H1 title', async () => {
    const md = await getMarkdown();
    expect(md.startsWith('# Test DB')).toBe(true);
  });

  it('contains H2 sections for each namespace group', async () => {
    const md = await getMarkdown();
    expect(md).toContain('## Blog');
    expect(md).toContain('## Animals');
    expect(md).toContain('## Shop');
  });

  it('each section has a mermaid code fence', async () => {
    const md = await getMarkdown();
    const fenceCount = (md.match(/```mermaid/g) ?? []).length;
    // Blog + Animals + Shop = 3 sections, each with a Mermaid block
    expect(fenceCount).toBeGreaterThanOrEqual(3);
  });

  it('each section has H3 entity headings', async () => {
    const md = await getMarkdown();
    expect(md).toContain('### Author');
    expect(md).toContain('### Post');
    expect(md).toContain('### Tag');
  });
});

describe('renderMarkdown — entity descriptions', () => {
  it('Author description appears as blockquote', async () => {
    const md = await getMarkdown();
    expect(md).toContain('> 글 작성자');
  });

  it('Post description appears as blockquote', async () => {
    const md = await getMarkdown();
    expect(md).toContain('> 블로그 게시글');
  });
});

describe('renderMarkdown — column table', () => {
  it('column table header is present under Author', async () => {
    const md = await getMarkdown();
    expect(md).toContain('| Column | Type | Key | Nullable | Description |');
  });

  it('Author id column appears with PK key', async () => {
    const md = await getMarkdown();
    expect(md).toContain('| id | integer | PK |');
  });

  it('Author email column appears with UK key', async () => {
    const md = await getMarkdown();
    expect(md).toContain('| email | string | UK |');
  });

  it('Post author_id column appears with FK key showing TS property name', async () => {
    const md = await getMarkdown();
    expect(md).toContain('| author_id | integer | FK (author) |');
  });

  it('property JSDoc description appears in column table', async () => {
    const md = await getMarkdown();
    expect(md).toContain('| name | string |  |  | 작성자 이름 |');
  });

  it('nullable column shows Y in Nullable cell', async () => {
    const md = await getMarkdown();
    // Post.body is nullable
    expect(md).toContain('| body | text |  | Y |');
  });

  it('non-nullable column has empty Nullable cell', async () => {
    const md = await getMarkdown();
    expect(md).toContain('| id | integer | PK |  |');
  });
});

describe('renderMarkdown — MikroORM specific columns', () => {
  it('formula column shows formula expression in Key column', async () => {
    const md = await getMarkdown();
    expect(md).toContain('formula: LENGTH(name)');
  });

  it('embedded columns show [Address] in Key column', async () => {
    const md = await getMarkdown();
    expect(md).toContain('[Address]');
  });

  it('discriminator column shows "discriminator" in Key column', async () => {
    const md = await getMarkdown();
    expect(md).toContain('| type | string | discriminator |');
  });

  it('STI root has discriminator column note', async () => {
    const md = await getMarkdown();
    expect(md).toContain('STI root — discriminator column: `type`');
  });

  it('STI child has extends note', async () => {
    const md = await getMarkdown();
    expect(md).toContain('Extends `Animal` (Single Table Inheritance)');
  });
});

describe('renderMarkdown — constraints', () => {
  it('Animal index constraint is rendered', async () => {
    const md = await getMarkdown();
    expect(md).toContain('**Constraints:**');
    expect(md).toContain('Index `animal_name_idx`: (name)');
  });
});

describe('renderMarkdown — namespace isolation', () => {
  it('Blog Mermaid block contains Author entity', async () => {
    const md = await getMarkdown();
    // Blog section's mermaid block should have Author
    const blogSection = extractSection(md, 'Blog');
    expect(blogSection).toContain('Author {');
  });

  it('Blog Mermaid block does NOT contain Animal entity', async () => {
    const md = await getMarkdown();
    const blogSection = extractSection(md, 'Blog');
    // Animal belongs to Animals namespace, not Blog
    expect(blogSection).not.toContain('Animal {');
  });
});

/** Extracts the content of a level-2 section (from ## heading to next ## or end). */
function extractSection(md: string, sectionName: string): string {
  const start = md.indexOf(`## ${sectionName}`);
  if (start === -1) return '';
  const nextSection = md.indexOf('\n## ', start + 1);
  return nextSection === -1 ? md.slice(start) : md.slice(start, nextSection);
}
