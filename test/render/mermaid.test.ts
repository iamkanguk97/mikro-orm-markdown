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

// ─── renderErDiagram — attribute type slot ────────────────────────────────────

describe('renderErDiagram — attribute type slot', () => {
  function renderColumn(type: string, fieldName = 'col'): string {
    return renderErDiagram({
      entities: [
        {
          className: 'Sample',
          tableName: 'sample',
          columns: [
            {
              propName: fieldName,
              fieldName,
              type,
              isPrimary: false,
              isForeignKey: false,
              isUnique: false,
              isNullable: false,
            },
          ],
          constraints: [],
        },
      ],
      relations: [],
    });
  }

  it.each([
    ['string[]', 'string[] col'],
    ['text[]', 'text[] col'],
    ['geometry(Point,4326)', 'geometry(Point,4326) col'],
    ['numeric(10,2)[]', 'numeric(10,2)[] col'],
    ['public.citext', 'public.citext col'],
    ['my-type', 'my-type col'],
    ['pkey', 'pkey col'],
    ['fk_id', 'fk_id col'],
    ['uk1', 'uk1 col'],
    ['user_status', 'user_status col'],
    ['_text', '_text col'],
  ])('writes a type bare when the type slot accepts every character: %s', async (type, expectedLine) => {
    const result = renderColumn(type);

    expect(result.split('\n')).toContain(`    ${expectedLine}`);
    await expect(parseMermaidDiagram(result)).resolves.toMatchObject({ diagramType: 'er' });
  });

  it.each([
    ['my type', '`my type` col'],
    ['bit varying(8)', '`bit varying(8)` col'],
    ["set('a','b')", "`set('a','b')` col"],
    ['"draft" | "published"', '`"draft" | "published"` col'],
    ['{ lat: number; lng: number; }', '`{ lat: number; lng: number; }` col'],
    ['[number, number]', '`[number, number]` col'],
    ['2d_point', '`2d_point` col'],
    ['[]', '`[]` col'],
    ['좌표 타입', '`좌표 타입` col'],
    ['pk', '`pk` col'],
    ['FK', '`FK` col'],
    ['uk[]', '`uk[]` col'],
    ['pk.point', '`pk.point` col'],
    ['_x_', '`#95;x#95;` col'],
    ['__brand__', '`#95;#95;brand#95;#95;` col'],
  ])('wraps a type in backticks when the bare type slot would reject it: %s', async (type, expectedLine) => {
    const result = renderColumn(type);

    expect(result.split('\n')).toContain(`    ${expectedLine}`);
    await expect(parseMermaidDiagram(result)).resolves.toMatchObject({ diagramType: 'er' });
  });

  it.each([
    ['Map<string, number>', '`Map#lt;string, number#gt;` col'],
    ['a # b', '`a #35; b` col'],
    ['a & b', '`a #amp; b` col'],
    ['a ~b~ c', '`a #126;b#126; c` col'],
    ['it`s', '`it#96;s` col'],
    ['a #lt; b', '`a #35;lt; b` col'],
    ['50%', '`50#37;` col'],
    ['%%{wrap}%%', '`#37;#37;{wrap}#37;#37;` col'],
    ['a *b* c', '`a #42;b#42; c` col'],
    ['$$x^2$$', '`#36;#36;x^2#36;#36;` col'],
    ['a\\b', '`a#92;b` col'],
    ["'_a_' | 'b'", "`'#95;a#95;' | 'b'` col"],
    ['fa:fa-user', '`fa#58;fa-user` col'],
    ['sofa:fa-bed', '`sofa#58;fa-bed` col'],
    ['{ lat: number; my_key: string; }', '`{ lat: number; my_key: string; }` col'],
  ])('writes a character Mermaid misreads inside backticks as an entity code: %s', async (type, expectedLine) => {
    const result = renderColumn(type);

    expect(result.split('\n')).toContain(`    ${expectedLine}`);
    await expect(parseMermaidDiagram(result)).resolves.toMatchObject({ diagramType: 'er' });
  });

  it('collapses a line break inside a type to one space', () => {
    const result = renderColumn('{\n  lat: number;\n}');

    expect(result.split('\n')).toContain('    `{ lat: number; }` col');
  });

  it('writes a placeholder for an empty type', async () => {
    const result = renderColumn('   ');

    expect(result.split('\n')).toContain('    _ col');
    await expect(parseMermaidDiagram(result)).resolves.toMatchObject({ diagramType: 'er' });
  });

  it('keeps the strict identifier rule for the field name next to a relaxed type', () => {
    const result = renderColumn('string[]', 'tags[]');

    expect(result.split('\n')).toContain('    string[] tags_');
  });

  it('keeps the strict identifier rule for the field name next to a backtick-quoted type', () => {
    const result = renderColumn('bit varying(8)', 'flag bits');

    expect(result.split('\n')).toContain('    `bit varying(8)` flag_bits');
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
    'string',
    'text',
    'varchar',
    'character varying',
    'character',
    'char',
    'bpchar',
    'nchar',
    'nvarchar',
    'tinytext',
    'mediumtext',
    'longtext',
    'citext',
    'inet',
    'cidr',
    'macaddr',
    'xml',
    'enum',
    'StringType',
    'TextType',
    'CharacterType',
    'EnumType',
  ])('maps %s to string', (input) => {
    expect(normalizeType(input)).toBe('string');
  });

  it.each(['uuid', 'UuidType'])('maps %s to uuid', (input) => {
    expect(normalizeType(input)).toBe('uuid');
  });

  it.each([
    'number',
    'integer',
    'int',
    'int2',
    'int4',
    'int8',
    'smallint',
    'tinyint',
    'mediumint',
    'bigint',
    'serial',
    'serial2',
    'serial4',
    'serial8',
    'smallserial',
    'bigserial',
    'IntegerType',
    'SmallIntType',
    'TinyIntType',
    'MediumIntType',
    'BigIntType',
  ])('maps %s to integer', (input) => {
    expect(normalizeType(input)).toBe('integer');
  });

  it.each(['float', 'float4', 'float8', 'double', 'double precision', 'real', 'FloatType', 'DoubleType'])(
    'maps %s to float',
    (input) => {
      expect(normalizeType(input)).toBe('float');
    }
  );

  it.each(['decimal', 'numeric', 'money', 'DecimalType'])('maps %s to decimal', (input) => {
    expect(normalizeType(input)).toBe('decimal');
  });

  it.each(['boolean', 'bool', 'tinyint(1)', 'BooleanType'])('maps %s to boolean', (input) => {
    expect(normalizeType(input)).toBe('boolean');
  });

  it.each([
    'Date',
    'datetime',
    'timestamp',
    'timestamptz',
    'timestamp with time zone',
    'timestamp without time zone',
    'DateTimeType',
  ])('maps %s to datetime', (input) => {
    expect(normalizeType(input)).toBe('datetime');
  });

  it.each(['date', 'DateType'])('maps %s to date', (input) => {
    expect(normalizeType(input)).toBe('date');
  });

  it.each(['time', 'timetz', 'time with time zone', 'time without time zone', 'TimeType'])(
    'maps %s to time',
    (input) => {
      expect(normalizeType(input)).toBe('time');
    }
  );

  it.each(['json', 'jsonb', 'JsonType'])('maps %s to json', (input) => {
    expect(normalizeType(input)).toBe('json');
  });

  it.each([
    'blob',
    'tinyblob',
    'mediumblob',
    'longblob',
    'bytea',
    'binary',
    'varbinary',
    'buffer',
    'BlobType',
    'Uint8ArrayType',
  ])('maps %s to binary', (input) => {
    expect(normalizeType(input)).toBe('binary');
  });

  it.each([
    ['varchar(255)', 'string'],
    ['character varying(255)', 'string'],
    ['character(36)', 'string'],
    ['char(36)', 'string'],
    ["enum('a','b')", 'string'],
    ['tinyint(4)', 'integer'],
    ['smallint unsigned', 'integer'],
    ['int unsigned', 'integer'],
    ['bigint(20) unsigned', 'integer'],
    ['double(8,2)', 'float'],
    ['float(8,2)', 'float'],
    ['numeric(10,2)', 'decimal'],
    ['decimal(10,2)', 'decimal'],
    ['datetime(3)', 'datetime'],
    ['timestamp(6)', 'datetime'],
    ['timestamptz(6)', 'datetime'],
    ['timestamp(6) with time zone', 'datetime'],
    ['time(6)', 'time'],
    ['time(6) without time zone', 'time'],
    ['varbinary(255)', 'binary'],
  ])('ignores the parameters and modifiers of %s and maps it to %s', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  it('normalizes the MySQL boolean declaration tinyint(1) to boolean, unlike other tinyint widths', () => {
    expect(normalizeType('tinyint(1)')).toBe('boolean');
    expect(normalizeType('tinyint (1)')).toBe('boolean');
    expect(normalizeType(' TINYINT ( 1 ) ')).toBe('boolean');
    expect(normalizeType('tinyint(2)')).toBe('integer');
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(normalizeType(' CHARACTER VARYING(255) ')).toBe('string');
    expect(normalizeType('DECIMAL(10,2)')).toBe('decimal');
    expect(normalizeType('jsontype')).toBe('json');
  });

  it('tells the JS Date class (a date and time) apart from the SQL date type (a calendar day)', () => {
    expect(normalizeType('Date')).toBe('datetime');
    expect(normalizeType('date')).toBe('date');
    expect(normalizeType('DATE')).toBe('date');
  });

  it('renames IntervalType to interval so no MikroORM type class name is shown', () => {
    expect(normalizeType('IntervalType')).toBe('interval');
  });

  // PostgreSQL stores `FullTextType` for a column declared as tsvector; the other drivers keep `tsvector`.
  it('renames FullTextType to tsvector so the column reads the same on every driver', () => {
    expect(normalizeType('FullTextType')).toBe('tsvector');
  });

  // `type: 'array'` and v7's `p.array()` / `p.enumArray()` are stored as these class names on every driver.
  it.each(['ArrayType', 'EnumArrayType'])('renames %s to array so no MikroORM type class name is shown', (input) => {
    expect(normalizeType(input)).toBe('array');
  });

  it('does not confuse interval with the int family', () => {
    expect(normalizeType('interval')).toBe('interval');
    expect(normalizeType('interval(6)')).toBe('interval(6)');
  });

  it.each(['interval', 'geometry', 'tsvector', 'string[]', 'text[]', 'unknown', 'Point', 'PointType'])(
    'passes %s through unchanged',
    (input) => {
      expect(normalizeType(input)).toBe(input);
    }
  );
});
