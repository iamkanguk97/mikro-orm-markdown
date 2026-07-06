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
    lines.push(`  ${toMermaidIdentifier(entity.className)} {`);
    for (const col of entity.columns) {
      lines.push(`    ${renderColumnLine(col)}`);
    }
    lines.push('  }');
  }

  for (const rel of model.relations) {
    lines.push(
      `  ${toMermaidIdentifier(rel.fromEntity)} ${rel.fromCardinality}--${rel.toCardinality} ${toMermaidIdentifier(rel.toEntity)} : "${escapeMermaidQuotedText(rel.label)}"`
    );
  }

  return lines.join('\n');
}

function renderColumnLine(col: ColumnModel): string {
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
  return `${toMermaidIdentifier(normalizeType(col.type))} ${toMermaidIdentifier(col.fieldName)}${qualifier}${commentStr}`;
}
