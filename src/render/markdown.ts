import type { DocumentModel, EnrichedEntity, NamespaceGroup } from '../model/build.js';
import type { ColumnModel, ConstraintModel, DiagramModel } from '../model/types.js';
import {
  escapeMarkdownInline,
  escapeMarkdownTableCell,
  renderMarkdownBlockQuote,
  renderMarkdownInlineCode,
} from './escape.js';
import { renderErDiagram } from './mermaid.js';

/**
 * Renders a DocumentModel as a markdown string.
 * Each namespace group becomes a level-2 section with a Mermaid ERD block
 * followed by per-entity column tables.
 */
export function renderMarkdown(docModel: DocumentModel): string {
  const sections: string[] = [`# ${escapeMarkdownInline(docModel.title)}`];

  if (docModel.description) {
    sections.push(escapeMarkdownInline(docModel.description));
  }

  for (const group of docModel.groups) {
    sections.push(renderGroupSection(group));
  }

  return sections.join('\n\n');
}

function renderGroupSection(group: NamespaceGroup): string {
  const parts: string[] = [`## ${escapeMarkdownInline(group.name)}`];

  if (group.erdEntities.length > 0) {
    const diagramModel: DiagramModel = {
      entities: group.erdEntities.map((e) => e.model),
      relations: group.erdRelations,
    };
    parts.push('```mermaid\n' + renderErDiagram(diagramModel) + '\n```');
  }

  for (const entity of group.textEntities) {
    parts.push(renderEntitySection(entity));
  }

  return parts.join('\n\n');
}

function renderEntitySection(entity: EnrichedEntity): string {
  const parts: string[] = [`### ${escapeMarkdownInline(entity.model.className)}`];

  if (entity.jsDoc?.description) {
    parts.push(renderMarkdownBlockQuote(entity.jsDoc.description));
  }

  // STI metadata note
  if (entity.model.discriminatorColumn) {
    parts.push(`*STI root — discriminator column: ${renderMarkdownInlineCode(entity.model.discriminatorColumn)}*`);
  } else if (entity.model.extendsEntity) {
    parts.push(`*Extends ${renderMarkdownInlineCode(entity.model.extendsEntity)} (Single Table Inheritance)*`);
  }

  if (entity.model.columns.length > 0) {
    parts.push(renderColumnTable(entity));
  }

  if (entity.model.constraints.length > 0) {
    parts.push(renderConstraints(entity.model.constraints));
  }

  return parts.join('\n\n');
}

function renderColumnTable(entity: EnrichedEntity): string {
  const header = '| Column | Type | Key | Nullable | Description |';
  const sep = '|--------|------|-----|----------|-------------|';
  const rows = entity.model.columns.map((col) => {
    const key = resolveColumnKey(col);
    const nullable = col.isNullable && !col.isPrimary ? 'Y' : '';
    // JSDoc property description wins; fall back to the @Property({ comment }) DDL comment.
    const desc = entity.propDocs.get(col.propName)?.description ?? col.comment ?? '';
    return `| ${escapeMarkdownTableCell(col.fieldName)} | ${escapeMarkdownTableCell(col.type)} | ${escapeMarkdownTableCell(key)} | ${nullable} | ${escapeMarkdownTableCell(desc)} |`;
  });
  return [header, sep, ...rows].join('\n');
}

/** Returns the "Key" cell value for the column table. */
function resolveColumnKey(col: ColumnModel): string {
  const fkKey = col.fieldName !== col.propName ? `FK (${col.propName})` : 'FK';

  if (col.isPrimary && col.isForeignKey) {
    return `PK, ${fkKey}`;
  }
  if (col.isPrimary) {
    return 'PK';
  }
  if (col.isForeignKey) {
    // Show TS property name in parentheses if it differs from the DB column name
    return fkKey;
  }
  if (col.isUnique) {
    return 'UK';
  }
  if (col.formula !== undefined) {
    return `formula: ${col.formula}`;
  }
  if (col.isDiscriminator) {
    return 'discriminator';
  }
  if (col.embeddedIn !== undefined) {
    return `[${col.embeddedIn}]`;
  }
  return '';
}

function renderConstraints(constraints: ConstraintModel[]): string {
  const lines = ['**Constraints:**', ''];
  for (const c of constraints) {
    const name = c.name ? ` ${renderMarkdownInlineCode(c.name)}` : '';
    const properties = c.properties.map(escapeMarkdownInline).join(', ');
    if (c.type === 'index') {
      lines.push(`- Index${name}: (${properties})`);
    } else if (c.type === 'unique') {
      lines.push(`- Unique${name}: (${properties})`);
    } else if (c.type === 'check') {
      lines.push(`- Check${name}: ${renderMarkdownInlineCode(c.expression ?? '')}`);
    }
  }
  return lines.join('\n');
}
