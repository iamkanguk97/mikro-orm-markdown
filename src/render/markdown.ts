import type { DocumentModel, EnrichedEntity, NamespaceGroup } from '../model/build.js';
import type { ColumnModel, ConstraintModel, DiagramModel } from '../model/types.js';
import {
  escapeMarkdownInline,
  escapeMarkdownParagraph,
  escapeMarkdownTableCell,
  renderMarkdownBlockQuote,
  renderMarkdownInlineCode,
  toMarkdownAnchor,
} from './escape.js';
import { type MermaidRenderOptions, normalizeType, renderErDiagram } from './mermaid.js';

/**
 * Renders a DocumentModel as a markdown string.
 * Each namespace group becomes a level-2 section with a Mermaid ERD block
 * followed by per-entity column tables.
 */
export function renderMarkdown(docModel: DocumentModel, mermaid?: MermaidRenderOptions): string {
  const sections: string[] = [`# ${escapeMarkdownInline(docModel.title)}`];

  if (docModel.description) {
    sections.push(escapeMarkdownParagraph(docModel.description));
  }

  // A table of contents only helps when there is more than one namespace section.
  if (docModel.groups.length > 1) {
    sections.push(renderTableOfContents(docModel.groups, resolveGroupAnchors(docModel)));
  }

  for (const group of docModel.groups) {
    sections.push(renderGroupSection(group, mermaid));
  }

  return sections.join('\n\n');
}

/**
 * Renders a bulleted markdown section: a header line, a blank line, then one
 * line per item. Shared by the Contents / Computed columns / Constraints
 * sections, which differ only in their header and per-item formatting.
 */
function renderBulletSection<T>(header: string, items: T[], renderItem: (item: T) => string): string {
  const lines = [header, ''];
  for (const item of items) {
    lines.push(renderItem(item));
  }
  return lines.join('\n');
}

/** Renders a namespace-level table of contents linking to each group's H2 section. */
function renderTableOfContents(groups: NamespaceGroup[], anchors: Map<NamespaceGroup, string>): string {
  return renderBulletSection('## Contents', groups, (group) => {
    const label = escapeMarkdownInline(group.name);
    return `- [${label}](#${anchors.get(group) ?? toMarkdownAnchor(group.name)})`;
  });
}

function resolveGroupAnchors(docModel: DocumentModel): Map<NamespaceGroup, string> {
  const seenAnchors = new Map<string, number>();
  const groupAnchors = new Map<NamespaceGroup, string>();

  resolveHeadingAnchor(docModel.title, seenAnchors);
  resolveHeadingAnchor('Contents', seenAnchors);

  for (const group of docModel.groups) {
    groupAnchors.set(group, resolveHeadingAnchor(group.name, seenAnchors));
    for (const entity of group.textEntities) {
      resolveHeadingAnchor(entity.model.className, seenAnchors);
    }
  }

  return groupAnchors;
}

function resolveHeadingAnchor(value: string, seenAnchors: Map<string, number>): string {
  const baseAnchor = toMarkdownAnchor(value);
  const previousCount = seenAnchors.get(baseAnchor) ?? 0;
  seenAnchors.set(baseAnchor, previousCount + 1);
  return previousCount === 0 ? baseAnchor : `${baseAnchor}-${previousCount}`;
}

function renderGroupSection(group: NamespaceGroup, mermaid?: MermaidRenderOptions): string {
  const parts: string[] = [`## ${escapeMarkdownInline(group.name)}`];

  if (group.erdEntities.length > 0) {
    const diagramModel: DiagramModel = {
      entities: group.erdEntities.map((e) => e.model),
      relations: group.erdRelations,
    };
    parts.push('```mermaid\n' + renderErDiagram(diagramModel, mermaid) + '\n```');
  }

  for (const entity of group.textEntities) {
    parts.push(renderEntitySection(entity));
  }

  return parts.join('\n\n');
}

function renderEntitySection(entity: EnrichedEntity): string {
  const parts: string[] = [`### ${escapeMarkdownInline(entity.model.className)}`];

  // The actual DB table name is what readers of a schema doc look for first,
  // and it is not otherwise visible (the ERD and heading use the class name).
  parts.push(`*Table: ${renderMarkdownInlineCode(entity.model.tableName)}*`);

  if (entity.jsDoc?.description) {
    parts.push(renderMarkdownBlockQuote(entity.jsDoc.description));
  }

  // STI metadata note
  if (entity.model.discriminatorColumn) {
    parts.push(`*STI root — discriminator column: ${renderMarkdownInlineCode(entity.model.discriminatorColumn)}*`);
  } else if (entity.model.extendsEntity) {
    const discValue =
      entity.model.discriminatorValue !== undefined
        ? `, discriminator value: ${renderMarkdownInlineCode(entity.model.discriminatorValue)}`
        : '';
    parts.push(
      `*Extends ${renderMarkdownInlineCode(entity.model.extendsEntity)} (Single Table Inheritance${discValue})*`
    );
  }

  if (entity.model.columns.length > 0) {
    parts.push(renderColumnTable(entity));
  }

  if (entity.model.constraints.length > 0) {
    parts.push(renderConstraints(entity.model.constraints));
  }

  const computedColumns = entity.model.columns.filter((col) => col.formula !== undefined);
  if (computedColumns.length > 0) {
    parts.push(renderComputedColumns(computedColumns));
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
    const docDesc = entity.propDocs.get(col.propName)?.description ?? col.comment ?? '';
    // Surface @Enum allowed values; the table cell escapes backticks, so plain text.
    const enumDesc = col.enumItems !== undefined ? `One of: ${col.enumItems.join(', ')}` : '';
    const desc = [docDesc, enumDesc].filter((part) => part !== '').join('\n');
    return `| ${escapeMarkdownTableCell(col.fieldName)} | ${escapeMarkdownTableCell(normalizeType(col.type))} | ${escapeMarkdownTableCell(key)} | ${nullable} | ${escapeMarkdownTableCell(desc)} |`;
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
    // Show TS property name in parentheses if it differs from the DB column name.
    // A unique FK (e.g. the owning side of a 1:1) keeps its UK marker so the
    // table agrees with the Mermaid ERD, which renders this column as UK.
    return col.isUnique ? `${fkKey}, UK` : fkKey;
  }
  if (col.isUnique) {
    return 'UK';
  }
  if (col.isDiscriminator) {
    return 'discriminator';
  }
  if (col.embeddedIn !== undefined) {
    return `[${col.embeddedIn}]`;
  }
  return '';
}

function renderComputedColumns(columns: ColumnModel[]): string {
  return renderBulletSection('**Computed columns:**', columns, (col) => {
    // An empty/unresolved formula expression renders as just the column name —
    // the "Computed columns" heading already conveys that it is computed, and
    // an empty inline-code span would be broken output.
    const expr = col.formula ? `: ${renderMarkdownInlineCode(col.formula)}` : '';
    return `- ${renderMarkdownInlineCode(col.fieldName)}${expr}`;
  });
}

function renderConstraints(constraints: ConstraintModel[]): string {
  return renderBulletSection('**Constraints:**', constraints, (c) => {
    const name = c.name ? ` ${renderMarkdownInlineCode(c.name)}` : '';
    const properties = c.properties.map(escapeMarkdownInline).join(', ');
    if (c.type === 'index') {
      const expression = c.isExpressionUnresolved === true ? '<unresolved expression>' : c.expression;
      if (expression !== undefined) {
        return `- Index${name}: expression ${renderMarkdownInlineCode(expression)}`;
      }
      return `- Index${name}: (${properties})`;
    }
    if (c.type === 'unique') {
      return `- Unique${name}: (${properties})`;
    }
    return `- Check${name}: ${renderMarkdownInlineCode(c.expression ?? '')}`;
  });
}
