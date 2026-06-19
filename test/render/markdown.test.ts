import { describe, expect, it } from 'vitest';
import { loadJsDoc } from '../../src/docs/jsdoc.js';
import { loadEntityMetadata } from '../../src/metadata/load.js';
import type { DocumentModel } from '../../src/model/build.js';
import { buildDocumentModel } from '../../src/model/build.js';
import { renderMarkdown } from '../../src/render/markdown.js';
import config from '../fixtures/mikro-orm.config.js';

async function getMarkdown(): Promise<string> {
  const { metas, sourcePaths } = await loadEntityMetadata(config);
  const jsDocResult = loadJsDoc(sourcePaths);
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

describe('renderMarkdown — table of contents', () => {
  it('renders a Contents section linking each namespace', async () => {
    const md = await getMarkdown();
    expect(md).toContain('## Contents');
    expect(md).toContain('- [Animals](#animals)');
    expect(md).toContain('- [Blog](#blog)');
    expect(md).toContain('- [Shop](#shop)');
  });

  it('places the Contents section before the first namespace section', async () => {
    const md = await getMarkdown();
    expect(md.indexOf('## Contents')).toBeLessThan(md.indexOf('## Blog'));
  });

  it('omits the Contents section when there is only one group', () => {
    const docModel: DocumentModel = {
      title: 'Single',
      groups: [{ name: 'default', erdEntities: [], erdRelations: [], textEntities: [] }],
    };
    expect(renderMarkdown(docModel)).not.toContain('## Contents');
  });

  it('builds a Unicode-aware anchor matching the heading for a non-ASCII namespace', () => {
    const docModel: DocumentModel = {
      title: 'Multi',
      groups: [
        { name: '동물', erdEntities: [], erdRelations: [], textEntities: [] },
        { name: 'Animals', erdEntities: [], erdRelations: [], textEntities: [] },
      ],
    };
    const md = renderMarkdown(docModel);
    // The TOC anchor must equal GitHub's anchor for the rendered "## 동물" heading;
    // an ASCII-only slug would have stripped the Korean letters into an empty "#".
    expect(md).toContain('## 동물');
    expect(md).toContain('- [동물](#동물)');
  });

  it('escapes brackets in TOC link labels so an unbalanced bracket cannot break the link', () => {
    const docModel: DocumentModel = {
      title: 'Multi',
      groups: [
        { name: 'Archived]', erdEntities: [], erdRelations: [], textEntities: [] },
        { name: 'Animals', erdEntities: [], erdRelations: [], textEntities: [] },
      ],
    };
    const md = renderMarkdown(docModel);
    // The ] is backslash-escaped so it does not close the label early.
    expect(md).toContain('- [Archived\\]](#archived)');
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

  it('shows the actual DB table name for each entity (M3)', async () => {
    const md = await getMarkdown();
    // Author maps to the `author` table via the default naming strategy.
    expect(md).toContain('*Table: `author`*');
  });

  it('shows the STI child discriminator value on the Extends note (L1)', async () => {
    const md = await getMarkdown();
    expect(md).toContain('Extends `Animal` (Single Table Inheritance, discriminator value: `dog`)');
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

  it('preserves parameterized SQL types verbatim in the table (H4)', async () => {
    const md = await getMarkdown();
    // The Author.nickname column is declared as varchar(255); the table row must
    // show it unaltered, not the Mermaid-sanitized varchar_255_. (The Mermaid
    // diagram block legitimately keeps the sanitized form, so we scope the
    // negative check to the table row only.)
    expect(md).toContain('| nickname | varchar(255) |');
    const tableRow = md.split('\n').find((line) => line.startsWith('| nickname |'));
    expect(tableRow).not.toContain('varchar_255_');
  });

  it('property JSDoc description appears in column table', async () => {
    const md = await getMarkdown();
    expect(md).toContain('| name | string |  |  | 작성자 이름 |');
  });

  it('falls back to @Property({ comment }) when a column has no JSDoc', async () => {
    const md = await getMarkdown();
    // Customer.name has no JSDoc, only a comment
    expect(md).toContain('| name | string |  |  | 고객 이름 |');
  });

  it('JSDoc description wins over @Property({ comment }) when both exist', async () => {
    const md = await getMarkdown();
    // Post.body has both a JSDoc comment and a DDL comment — JSDoc must win
    expect(md).toContain('게시글 본문');
    expect(md).not.toContain('DB 본문 코멘트');
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
  it('formula column is listed in the Computed columns section', async () => {
    const md = await getMarkdown();
    expect(md).toContain('**Computed columns:**');
    expect(md).toContain('`LENGTH(name)`');
  });

  it('renders an empty/unresolved formula as just the column name (no broken code span)', () => {
    const docModel: DocumentModel = {
      title: 'Computed',
      groups: [
        {
          name: 'default',
          erdEntities: [],
          erdRelations: [],
          textEntities: [
            {
              model: {
                className: 'Widget',
                tableName: 'widget',
                columns: [
                  {
                    propName: 'computed',
                    fieldName: 'computed',
                    type: 'integer',
                    isPrimary: false,
                    isForeignKey: false,
                    isUnique: false,
                    isNullable: false,
                    formula: '',
                  },
                ],
                isPivot: false,
                isEmbeddable: false,
                constraints: [],
              },
              jsDoc: undefined,
              propDocs: new Map(),
            },
          ],
        },
      ],
    };

    const md = renderMarkdown(docModel);
    expect(md).toContain('**Computed columns:**');
    expect(md).toContain('- `computed`');
    // The empty expression must not produce a "`computed`: ``" broken inline-code span.
    expect(md).not.toContain('`computed`:');
  });

  it('lists @Enum allowed values in the description (M5)', () => {
    const docModel: DocumentModel = {
      title: 'Enum',
      groups: [
        {
          name: 'default',
          erdEntities: [],
          erdRelations: [],
          textEntities: [
            {
              model: {
                className: 'Account',
                tableName: 'account',
                columns: [
                  {
                    propName: 'status',
                    fieldName: 'status',
                    type: 'string',
                    isPrimary: false,
                    isForeignKey: false,
                    isUnique: false,
                    isNullable: false,
                    enumItems: ['active', 'banned'],
                  },
                ],
                isPivot: false,
                isEmbeddable: false,
                constraints: [],
              },
              jsDoc: undefined,
              propDocs: new Map(),
            },
          ],
        },
      ],
    };

    const md = renderMarkdown(docModel);
    expect(md).toContain('One of: active, banned');
  });

  it('embedded columns show [Address] in Key column', async () => {
    const md = await getMarkdown();
    expect(md).toContain('[Address]');
  });

  it('embedded column falls back to the @Embeddable class JSDoc for its Description', async () => {
    const md = await getMarkdown();
    expect(md).toContain('| address_street | string | [Address] |  | 도로명 주소. |');
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
    expect(md).toContain('Extends `Animal` (Single Table Inheritance');
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

describe('renderMarkdown — escaping', () => {
  it('escapes markdown syntax that would break headings, tables, and blockquotes', () => {
    const docModel: DocumentModel = {
      title: 'Unsafe | <Title>\nNext',
      description: 'Summary | <script>\nsecond line',
      groups: [
        {
          name: 'Group | <A>\nNext',
          erdEntities: [],
          erdRelations: [],
          textEntities: [
            {
              model: {
                className: 'Entity | <One>\nNext',
                tableName: 'entity',
                columns: [
                  {
                    propName: 'name',
                    fieldName: 'name|raw',
                    type: 'string',
                    isPrimary: false,
                    isForeignKey: false,
                    isUnique: false,
                    isNullable: false,
                    comment: 'visible | internal\n<script>',
                  },
                  {
                    propName: 'score',
                    fieldName: 'score',
                    type: 'integer',
                    isPrimary: false,
                    isForeignKey: false,
                    isUnique: false,
                    isNullable: false,
                    formula: 'sum(`score` | 1)',
                  },
                ],
                isPivot: false,
                isEmbeddable: false,
                discriminatorColumn: 'kind`type',
                constraints: [
                  {
                    type: 'check',
                    name: 'check`name',
                    properties: [],
                    expression: 'score > `min`',
                  },
                ],
              },
              jsDoc: {
                description: 'First | line\n# not heading',
                namespaces: [],
                erdNamespaces: [],
                describeNamespaces: [],
                hidden: false,
              },
              propDocs: new Map([['name', { description: 'doc | desc\n<b>raw</b>', atLeastOne: false }]]),
            },
          ],
        },
      ],
    };

    const md = renderMarkdown(docModel);

    expect(md).toContain('# Unsafe \\| &lt;Title&gt; Next');
    expect(md).toContain('Summary \\| &lt;script&gt; second line');
    expect(md).toContain('## Group \\| &lt;A&gt; Next');
    expect(md).toContain('### Entity \\| &lt;One&gt; Next');
    expect(md).toContain('> First \\| line\n> \\# not heading');
    expect(md).toContain('| name\\|raw | string |  |  | doc \\| desc<br>&lt;b&gt;raw&lt;/b&gt; |');
    expect(md).toContain('| score | integer |  |  |  |');
    expect(md).toContain('- `score`: ``sum(`score` | 1)``');
    expect(md).toContain('*STI root — discriminator column: ``kind`type``*');
    expect(md).toContain('- Check ``check`name``: `` score > `min` ``');
  });
});

describe('renderMarkdown — composite keys', () => {
  it('shows a relation column that is both PK and FK', () => {
    const docModel: DocumentModel = {
      title: 'Composite Keys',
      groups: [
        {
          name: 'default',
          erdEntities: [],
          erdRelations: [],
          textEntities: [
            {
              model: {
                className: 'AuditLog',
                tableName: 'audit_log',
                columns: [
                  {
                    propName: 'tenant',
                    fieldName: 'tenant_region_code',
                    type: 'string',
                    isPrimary: true,
                    isForeignKey: true,
                    isUnique: false,
                    isNullable: false,
                  },
                ],
                isPivot: false,
                isEmbeddable: false,
                constraints: [],
              },
              jsDoc: undefined,
              propDocs: new Map(),
            },
          ],
        },
      ],
    };

    expect(renderMarkdown(docModel)).toContain('| tenant_region_code | string | PK, FK (tenant) |  |  |');
  });
});

/** Extracts the content of a level-2 section (from ## heading to next ## or end). */
function extractSection(md: string, sectionName: string): string {
  const start = md.indexOf(`## ${sectionName}`);
  if (start === -1) {
    return '';
  }
  const nextSection = md.indexOf('\n## ', start + 1);
  return nextSection === -1 ? md.slice(start) : md.slice(start, nextSection);
}
