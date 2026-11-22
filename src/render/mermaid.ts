import type { ColumnModel, DiagramModel } from '../model/types.js';
import { DISCRIMINATOR_LABEL, embeddedLabel } from './column-markers.js';
import { escapeMermaidQuotedText, toMermaidAttributeType, toMermaidIdentifier } from './escape.js';

export const MERMAID_LAYOUTS = ['dagre', 'elk', 'elk.stress'] as const;
export type MermaidLayout = (typeof MERMAID_LAYOUTS)[number];

export const MERMAID_THEMES = ['default', 'neutral', 'dark', 'forest', 'base'] as const;
export type MermaidTheme = (typeof MERMAID_THEMES)[number];

/** Optional Mermaid rendering hints injected as YAML frontmatter inside the erDiagram fence. */
export interface MermaidRenderOptions {
  layout?: MermaidLayout;
  theme?: MermaidTheme;
}

/**
 * The inputs that map to each generic type word: the type names MikroORM stores
 * in `prop.type` after discovery (TypeScript names like `number`, its own
 * `*Type` class names like `JsonType`) plus the dialect spellings users write
 * in `@Property({ type })` for PostgreSQL, MySQL, MariaDB and SQLite.
 */
const INPUTS_BY_GENERIC_TYPE: Record<string, readonly string[]> = {
  string: [
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
  ],
  uuid: ['uuid', 'UuidType'],
  integer: [
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
  ],
  float: ['float', 'float4', 'float8', 'double', 'double precision', 'real', 'FloatType', 'DoubleType'],
  decimal: ['decimal', 'numeric', 'money', 'DecimalType'],
  boolean: ['boolean', 'bool', 'BooleanType'],
  datetime: [
    'datetime',
    'timestamp',
    'timestamptz',
    'timestamp with time zone',
    'timestamp without time zone',
    'DateTimeType',
  ],
  date: ['date', 'DateType'],
  time: ['time', 'timetz', 'time with time zone', 'time without time zone', 'TimeType'],
  json: ['json', 'jsonb', 'JsonType'],
  binary: [
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
  ],
  // Not generic words: these only keep a MikroORM class name out of the output,
  // so the column reads like the plain name the developer declared (`interval`,
  // `array`) or the one the other drivers store (`tsvector`).
  interval: ['IntervalType'],
  tsvector: ['FullTextType'],
  array: ['ArrayType', 'EnumArrayType'],
};

/** Generic type per lowercased base type name, for the case-insensitive lookup. */
const GENERIC_TYPE_BY_BASE_NAME = new Map<string, string>(
  Object.entries(INPUTS_BY_GENERIC_TYPE).flatMap(([genericType, inputs]) =>
    inputs.map((input) => [input.toLowerCase(), genericType] as const)
  )
);

/** The JS class name MikroORM stores for a `Date` property, which holds a date and a time. */
const JS_DATE_CLASS_NAME = 'Date';

/**
 * Maps DB-specific or ORM-internal type strings to RDBMS-agnostic generic types
 * so the generated docs are portable across PostgreSQL, MySQL, SQLite, etc.
 *
 * Matching is case-insensitive, strips a "(…)" parameter list (varchar(255),
 * numeric(10,2), timestamp(6) with time zone) and a MySQL "unsigned"/"signed"
 * modifier, then looks up the base name exactly — a prefix match would confuse
 * e.g. PostgreSQL's `interval` with `int`. The one case-sensitive input is the
 * JS class name `Date` (datetime), which differs from the SQL type `date` only
 * by its capital letter. Unrecognized types pass through unchanged.
 */
export function normalizeType(type: string): string {
  if (type.trim() === JS_DATE_CLASS_NAME) {
    return 'datetime';
  }

  const t = type.toLowerCase().replace(/\s+/g, ' ').trim();

  // MySQL declares booleans as tinyint(1); match before the generic tinyint -> integer rule.
  if (/^tinyint\s*\(\s*1\s*\)$/.test(t)) {
    return 'boolean';
  }

  const baseName = t
    .replace(/\(.*\)/, '')
    .replace(/\b(un)?signed\b/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return GENERIC_TYPE_BY_BASE_NAME.get(baseName) ?? type;
}

/**
 * Renders a DiagramModel as a Mermaid erDiagram block string.
 * The returned string is ready to embed in a markdown code fence.
 * When `mermaid` options are provided, a YAML frontmatter block is prepended.
 */
export function renderErDiagram(model: DiagramModel, mermaid?: MermaidRenderOptions): string {
  const lines: string[] = [];
  const entityIdentifiers = createMermaidIdentifierRegistry([
    ...model.entities.map((entity) => entity.className),
    ...model.relations.flatMap((relation) => [relation.fromEntity, relation.toEntity]),
  ]);

  if (mermaid?.layout !== undefined || mermaid?.theme !== undefined) {
    lines.push('---', 'config:');
    if (mermaid.layout !== undefined) {
      lines.push(`  layout: ${mermaid.layout}`);
    }
    if (mermaid.theme !== undefined) {
      lines.push(`  theme: ${mermaid.theme}`);
    }
    lines.push('---');
  }

  lines.push('erDiagram');

  for (const entity of model.entities) {
    const entityIdentifier = entityIdentifiers(entity.className);
    const entityAlias = entityIdentifier === entity.className ? '' : `["${escapeMermaidQuotedText(entity.className)}"]`;
    const attributeIdentifiers = createMermaidIdentifierRegistry(entity.columns.map((column) => column.fieldName));

    lines.push(`  ${entityIdentifier}${entityAlias} {`);
    for (const col of entity.columns) {
      lines.push(`    ${renderColumnLine(col, attributeIdentifiers(col.fieldName))}`);
    }
    lines.push('  }');
  }

  for (const rel of model.relations) {
    lines.push(
      `  ${entityIdentifiers(rel.fromEntity)} ${rel.fromCardinality}--${rel.toCardinality} ${entityIdentifiers(rel.toEntity)} : "${escapeMermaidQuotedText(rel.label)}"`
    );
  }

  return lines.join('\n');
}

/**
 * Returns a collision-free identifier lookup for the given names. Lookups of
 * names outside the registered set fall back to plain sanitization.
 */
function createMermaidIdentifierRegistry(values: Iterable<string>): (value: string) => string {
  const originals = [...new Set(values)];
  const identifiers = new Map<string, string>();
  const allocated = new Set<string>();

  // Preserve every already-safe ASCII identifier even when an earlier unsafe
  // name sanitizes to the same value. This keeps established output stable.
  for (const original of originals) {
    if (toMermaidIdentifier(original) === original) {
      identifiers.set(original, original);
      allocated.add(original);
    }
  }

  for (const original of originals) {
    if (identifiers.has(original)) {
      continue;
    }

    const baseIdentifier = toMermaidIdentifier(original);
    let identifier = baseIdentifier;
    let suffix = 2;

    while (allocated.has(identifier)) {
      identifier = `${baseIdentifier}_${suffix}`;
      suffix += 1;
    }

    allocated.add(identifier);
    identifiers.set(original, identifier);
  }

  return (value: string): string => identifiers.get(value) ?? toMermaidIdentifier(value);
}

function renderColumnLine(col: ColumnModel, fieldIdentifier: string): string {
  // Priority: PK > UK (FK qualifier omitted — relationship lines already convey FK relationships)
  let qualifier = '';
  if (col.isPrimary) {
    qualifier = ' PK';
  } else if (col.isUnique) {
    qualifier = ' UK';
  }

  // Comment priority (MikroORM-specific markers only — keeps the diagram uncluttered).
  // Renamed columns: FK columns surface their TS name in the markdown table's Key
  // cell ("FK (propName)"); plain renamed scalars show only the DB column name.
  //   1. @Formula SQL expression  — "formula: LENGTH(name)"
  //   2. STI discriminator column — "discriminator"
  //   3. Embedded source type     — "[Address]"
  let comment: string | undefined;
  if (col.formula !== undefined) {
    comment = col.formula ? `formula: ${col.formula}` : 'formula';
  } else if (col.isDiscriminator) {
    comment = DISCRIMINATOR_LABEL;
  } else if (col.embeddedIn !== undefined) {
    comment = embeddedLabel(col.embeddedIn);
  } else if (col.isSelfReference) {
    comment = 'self-ref';
  }

  const commentStr = comment !== undefined ? ` "${escapeMermaidQuotedText(comment)}"` : '';
  return `${toMermaidAttributeType(normalizeType(col.type))} ${fieldIdentifier}${qualifier}${commentStr}`;
}
