import type { ColumnModel, DiagramModel } from '../model/types.js';
import { escapeMermaidQuotedText, toMermaidIdentifier } from './escape.js';

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
 * Generic type per base type name, covering the declaration strings produced
 * by the supported MikroORM platforms (PostgreSQL, MySQL, MariaDB, SQLite)
 * plus the dialect spellings users commonly write in `@Property({ type })`.
 */
const GENERIC_TYPE_BY_BASE_NAME = new Map<string, string>([
  ['uuid', 'string'],
  ['text', 'string'],
  ['string', 'string'],
  ['varchar', 'string'],
  ['character varying', 'string'],
  ['character', 'string'],
  ['char', 'string'],
  ['tinytext', 'string'],
  ['mediumtext', 'string'],
  ['longtext', 'string'],
  ['timestamptz', 'datetime'],
  ['timestamp', 'datetime'],
  ['datetime', 'datetime'],
  ['integer', 'integer'],
  ['int', 'integer'],
  ['bigint', 'integer'],
  ['smallint', 'integer'],
  ['tinyint', 'integer'],
  ['mediumint', 'integer'],
  ['serial', 'integer'],
  ['bigserial', 'integer'],
  ['doubletype', 'float'],
  ['double precision', 'float'],
  ['double', 'float'],
  ['float', 'float'],
  ['decimal', 'float'],
  ['numeric', 'float'],
  ['real', 'float'],
  ['boolean', 'boolean'],
  ['bool', 'boolean'],
  ['jsonb', 'json'],
]);

/**
 * Maps DB-specific or ORM-internal type strings to RDBMS-agnostic generic types
 * so the generated docs are portable across PostgreSQL, MySQL, SQLite, etc.
 *
 * Matching strips a trailing "(…)" parameter list (varchar(255), numeric(10,2))
 * and a MySQL "unsigned"/"signed" modifier, then looks up the base name exactly —
 * a prefix match would confuse e.g. PostgreSQL's `interval` with `int`.
 * Unrecognized types pass through unchanged.
 */
export function normalizeType(type: string): string {
  const t = type.toLowerCase().replace(/\s+/g, ' ').trim();

  // MySQL declares booleans as tinyint(1); match before the generic tinyint -> integer rule.
  if (/^tinyint\s*\(\s*1\s*\)$/.test(t)) {
    return 'boolean';
  }

  const baseName = t
    .replace(/\(.*\)/, '')
    .replace(/\b(un)?signed\b/, '')
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
    const entityIdentifier = entityIdentifiers.get(entity.className) ?? toMermaidIdentifier(entity.className);
    const entityAlias = entityIdentifier === entity.className ? '' : `["${escapeMermaidQuotedText(entity.className)}"]`;
    const attributeIdentifiers = createMermaidIdentifierRegistry(entity.columns.map((column) => column.fieldName));

    lines.push(`  ${entityIdentifier}${entityAlias} {`);
    for (const col of entity.columns) {
      const fieldIdentifier = attributeIdentifiers.get(col.fieldName) ?? toMermaidIdentifier(col.fieldName);
      lines.push(`    ${renderColumnLine(col, fieldIdentifier)}`);
    }
    lines.push('  }');
  }

  for (const rel of model.relations) {
    const fromIdentifier = entityIdentifiers.get(rel.fromEntity) ?? toMermaidIdentifier(rel.fromEntity);
    const toIdentifier = entityIdentifiers.get(rel.toEntity) ?? toMermaidIdentifier(rel.toEntity);
    lines.push(
      `  ${fromIdentifier} ${rel.fromCardinality}--${rel.toCardinality} ${toIdentifier} : "${escapeMermaidQuotedText(rel.label)}"`
    );
  }

  return lines.join('\n');
}

function createMermaidIdentifierRegistry(values: Iterable<string>): Map<string, string> {
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

  return identifiers;
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
    comment = 'discriminator';
  } else if (col.embeddedIn !== undefined) {
    comment = `[${col.embeddedIn}]`;
  } else if (col.isSelfReference) {
    comment = 'self-ref';
  }

  const commentStr = comment !== undefined ? ` "${escapeMermaidQuotedText(comment)}"` : '';
  return `${toMermaidIdentifier(normalizeType(col.type))} ${fieldIdentifier}${qualifier}${commentStr}`;
}
