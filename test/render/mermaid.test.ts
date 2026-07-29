import { describe, expect, it } from 'vitest';
import type { ColumnModel, DiagramModel, RelationEdge } from '../../src/model/types.js';
import { escapeMermaidQuotedText } from '../../src/render/escape.js';
import { normalizeType, renderErDiagram } from '../../src/render/mermaid.js';
import { parseMermaidDiagram } from './mermaid-parser.js';

describe('renderErDiagram — M3 rendering', () => {
  function makeCol(overrides: Partial<ColumnModel> = {}): ColumnModel {
    return {
      propName: 'field',
      fieldName: 'field',
      type: 'string',
      isPrimary: false,
      isForeignKey: false,
      isUnique: false,
      isNullable: false,
      ...overrides,
    };
  }

  it('renders formula column with "formula: <expr>" comment', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'Customer',
          tableName: 'customer',
          columns: [
            makeCol({
              propName: 'nameLength',
              fieldName: 'nameLength',
              type: 'integer',
              formula: 'LENGTH(name)',
            }),
          ],
          constraints: [],
        },
      ],
      relations: [],
    };
    expect(renderErDiagram(model)).toContain('integer nameLength "formula: LENGTH(name)"');
  });

  it('renders discriminator column with "discriminator" comment', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'Animal',
          tableName: 'animal',
          columns: [makeCol({ propName: 'type', fieldName: 'type', type: 'string', isDiscriminator: true })],
          discriminatorColumn: 'type',
          constraints: [],
        },
      ],
      relations: [],
    };
    expect(renderErDiagram(model)).toContain('string type "discriminator"');
  });

  it('renders embedded column with "[EmbeddableType]" comment', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'Customer',
          tableName: 'customer',
          columns: [
            makeCol({
              propName: 'address_street',
              fieldName: 'address_street',
              type: 'string',
              embeddedIn: 'Address',
            }),
          ],
          constraints: [],
        },
      ],
      relations: [],
    };
    expect(renderErDiagram(model)).toContain('string address_street "[Address]"');
  });

  it('renders STI extends edge correctly', () => {
    const model: DiagramModel = {
      entities: [],
      relations: [
        {
          fromEntity: 'Dog',
          toEntity: 'Animal',
          fromCardinality: '||',
          toCardinality: '||',
          label: 'extends',
        },
      ],
    };
    expect(renderErDiagram(model)).toContain('Dog ||--|| Animal : "extends"');
  });
});

// ─── renderErDiagram (unit: uses manually constructed models) ─────────────────

describe('renderErDiagram', () => {
  function makeCol(overrides: Partial<ColumnModel> = {}): ColumnModel {
    return {
      propName: 'field',
      fieldName: 'field',
      type: 'string',
      isPrimary: false,
      isForeignKey: false,
      isUnique: false,
      isNullable: false,
      ...overrides,
    };
  }

  function makeEdge(overrides: Partial<RelationEdge> = {}): RelationEdge {
    return {
      fromEntity: 'A',
      toEntity: 'B',
      fromCardinality: '}o',
      toCardinality: '||',
      label: 'rel',
      ...overrides,
    };
  }

  it('starts with "erDiagram"', () => {
    const result = renderErDiagram({ entities: [], relations: [] });
    expect(result).toBe('erDiagram');
  });

  it('renders a PK column correctly', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'User',
          tableName: 'user',
          columns: [makeCol({ propName: 'id', fieldName: 'id', type: 'integer', isPrimary: true })],
          constraints: [],
        },
      ],
      relations: [],
    };
    const result = renderErDiagram(model);
    expect(result).toContain('integer id PK');
  });

  it('renders a UK column correctly', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'User',
          tableName: 'user',
          columns: [makeCol({ fieldName: 'email', type: 'string', isUnique: true })],
          constraints: [],
        },
      ],
      relations: [],
    };
    expect(renderErDiagram(model)).toContain('string email UK');
  });

  it('does NOT add a TS property-name comment when names differ (kept out of the diagram)', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'Post',
          tableName: 'post',
          columns: [
            makeCol({
              propName: 'author',
              fieldName: 'author_id',
              type: 'integer',
              isForeignKey: true,
            }),
          ],
          constraints: [],
        },
      ],
      relations: [],
    };
    const result = renderErDiagram(model);
    // DB column name only; FK qualifier is omitted (relationship lines convey FK relationships).
    // The TS property name lives in the markdown table, not the diagram.
    expect(result).toContain('integer author_id');
    expect(result).not.toContain('author_id FK');
    expect(result).not.toContain('"author"');
  });

  it('does NOT add comment when field name equals prop name', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'User',
          tableName: 'user',
          columns: [makeCol({ propName: 'name', fieldName: 'name', type: 'string' })],
          constraints: [],
        },
      ],
      relations: [],
    };
    const result = renderErDiagram(model);
    expect(result).toContain('string name\n');
    expect(result).not.toContain('"name"');
  });

  it('renders nullable m:1 edge with o| to-cardinality', () => {
    const model: DiagramModel = {
      entities: [],
      relations: [makeEdge({ fromCardinality: '}o', toCardinality: 'o|', label: 'author' })],
    };
    expect(renderErDiagram(model)).toContain('A }o--o| B : "author"');
  });

  it('renders 1:1 edge correctly', () => {
    const model: DiagramModel = {
      entities: [],
      relations: [makeEdge({ fromCardinality: '||', toCardinality: '||', label: 'profile' })],
    };
    expect(renderErDiagram(model)).toContain('A ||--|| B : "profile"');
  });

  it('renders m:n edge correctly', () => {
    const model: DiagramModel = {
      entities: [],
      relations: [
        makeEdge({
          fromEntity: 'Post',
          toEntity: 'Tag',
          fromCardinality: '}o',
          toCardinality: 'o{',
          label: 'tags',
        }),
      ],
    };
    expect(renderErDiagram(model)).toContain('Post }o--o{ Tag : "tags"');
  });

  it('sanitizes Mermaid identifiers and encodes quoted labels/comments for the Mermaid parser', async () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'Order Item',
          tableName: 'order_item',
          columns: [
            makeCol({
              propName: 'full"name',
              fieldName: 'full name|raw',
              type: 'string',
              formula: 'concat("first", "last")\nline',
            }),
          ],
          constraints: [],
        },
      ],
      relations: [
        makeEdge({
          fromEntity: 'Order Item',
          toEntity: 'User Account',
          label: 'created "by"\nuser',
        }),
      ],
    };

    const result = renderErDiagram(model);

    expect(result).toContain('Order_Item["Order Item"] {');
    expect(result).toContain('string full_name_raw "formula: concat(#quot;first#quot;, #quot;last#quot;) line"');
    expect(result).toContain('Order_Item }o--|| User_Account : "created #quot;by#quot; user"');
    await expect(parseMermaidDiagram(result)).resolves.toMatchObject({ diagramType: 'er' });
  });

  it('preserves literal entity-looking text and backslashes in Mermaid quoted text', () => {
    expect(escapeMermaidQuotedText('raw #quot; #35; C:\\tmp "quote"')).toBe(
      'raw #35;quot; #35;35; C:\\tmp #quot;quote#quot;'
    );
  });
});

// ─── renderErDiagram — Mermaid frontmatter ────────────────────────────────────

describe('renderErDiagram — Mermaid frontmatter', () => {
  const emptyModel: DiagramModel = { entities: [], relations: [] };

  it('emits no frontmatter when no options are provided', () => {
    expect(renderErDiagram(emptyModel)).toBe('erDiagram');
  });

  it('emits no frontmatter when an empty options object is provided', () => {
    expect(renderErDiagram(emptyModel, {})).toBe('erDiagram');
  });

  it('emits layout frontmatter when layout is set', () => {
    const result = renderErDiagram(emptyModel, { layout: 'elk' });
    expect(result).toBe('---\nconfig:\n  layout: elk\n---\nerDiagram');
  });

  it('emits theme frontmatter when theme is set', () => {
    const result = renderErDiagram(emptyModel, { theme: 'forest' });
    expect(result).toBe('---\nconfig:\n  theme: forest\n---\nerDiagram');
  });

  it('emits both layout and theme frontmatter when both are set', () => {
    const result = renderErDiagram(emptyModel, { layout: 'elk', theme: 'forest' });
    expect(result).toBe('---\nconfig:\n  layout: elk\n  theme: forest\n---\nerDiagram');
  });

  it('frontmatter precedes erDiagram body content', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'User',
          tableName: 'user',
          columns: [
            {
              propName: 'id',
              fieldName: 'id',
              type: 'integer',
              isPrimary: true,
              isForeignKey: false,
              isUnique: false,
              isNullable: false,
            },
          ],
          constraints: [],
        },
      ],
      relations: [],
    };
    const result = renderErDiagram(model, { layout: 'dagre' });
    const lines = result.split('\n');
    expect(lines[0]).toBe('---');
    expect(lines).toContain('erDiagram');
    const erdIndex = lines.indexOf('erDiagram');
    const dashIndex = lines.lastIndexOf('---');
    expect(dashIndex).toBeLessThan(erdIndex);
  });

  it('entity body appears after frontmatter and erDiagram when both are present', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'User',
          tableName: 'user',
          columns: [
            {
              propName: 'id',
              fieldName: 'id',
              type: 'integer',
              isPrimary: true,
              isForeignKey: false,
              isUnique: false,
              isNullable: false,
            },
          ],
          constraints: [],
        },
      ],
      relations: [],
    };
    const result = renderErDiagram(model, { layout: 'elk', theme: 'neutral' });
    expect(result).toContain('---\nconfig:\n  layout: elk\n  theme: neutral\n---\nerDiagram');
    expect(result).toContain('User {');
  });
});

// ─── normalizeType ────────────────────────────────────────────────────────────

describe('normalizeType', () => {
  it.each([
    ['varchar(255)', 'string'],
    ['character varying', 'string'],
    ['character varying(255)', 'string'],
    ['character', 'string'],
    ['character(36)', 'string'],
    ['char(36)', 'string'],
    ['tinytext', 'string'],
    ['mediumtext', 'string'],
    ['longtext', 'string'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  it.each([
    ['numeric', 'float'],
    ['numeric(10,2)', 'float'],
    ['decimal(10,2)', 'float'],
    ['double(8,2)', 'float'],
    ['float(8,2)', 'float'],
    ['real', 'float'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  it.each([
    ['tinyint', 'integer'],
    ['tinyint(4)', 'integer'],
    ['mediumint', 'integer'],
    ['smallint unsigned', 'integer'],
    ['int unsigned', 'integer'],
    ['bigint(20) unsigned', 'integer'],
    ['serial', 'integer'],
    ['bigserial', 'integer'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  it.each([
    ['datetime(3)', 'datetime'],
    ['timestamp(6)', 'datetime'],
    ['timestamptz(6)', 'datetime'],
  ])('normalizes parameterized %s to %s', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  it('normalizes the MySQL boolean declaration tinyint(1) to boolean, unlike other tinyint widths', () => {
    expect(normalizeType('tinyint(1)')).toBe('boolean');
    expect(normalizeType('tinyint (1)')).toBe('boolean');
    expect(normalizeType(' TINYINT ( 1 ) ')).toBe('boolean');
    expect(normalizeType('tinyint(2)')).toBe('integer');
  });

  it('does not confuse interval with the int family', () => {
    expect(normalizeType('interval')).toBe('interval');
    expect(normalizeType('interval(6)')).toBe('interval(6)');
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(normalizeType(' CHARACTER VARYING(255) ')).toBe('string');
    expect(normalizeType('DECIMAL(10,2)')).toBe('float');
  });

  it.each([
    ['uuid', 'string'],
    ['text', 'string'],
    ['string', 'string'],
    ['timestamptz', 'datetime'],
    ['timestamp', 'datetime'],
    ['datetime', 'datetime'],
    ['integer', 'integer'],
    ['int', 'integer'],
    ['bigint', 'integer'],
    ['smallint', 'integer'],
    ['DoubleType', 'float'],
    ['double precision', 'float'],
    ['double', 'float'],
    ['float', 'float'],
    ['decimal', 'float'],
    ['boolean', 'boolean'],
    ['bool', 'boolean'],
    ['jsonb', 'json'],
  ])('keeps existing mapping of %s to %s', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  it.each([
    'bytea',
    'blob',
    'geometry',
    "enum('a','b')",
    'text[]',
    'unknown',
  ])('passes unrecognized type %s through unchanged', (input) => {
    expect(normalizeType(input)).toBe(input);
  });
});
