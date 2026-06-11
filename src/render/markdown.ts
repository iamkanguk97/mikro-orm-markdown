import type { EnrichedEntity, DocumentModel, NamespaceGroup } from '../model/build.js';
import type { ColumnModel, ConstraintModel, DiagramModel } from '../model/types.js';
import { renderErDiagram } from './mermaid.js';

/**
 * Renders a DocumentModel as a markdown string.
 * Each namespace group becomes a level-2 section with a Mermaid ERD block
 * followed by per-entity column tables.
 */
export function renderMarkdown(docModel: DocumentModel): string {
  const sections: string[] = [`# ${docModel.title}`];

  for (const group of docModel.groups) {
    sections.push(renderGroupSection(group));
  }

  return sections.join('\n\n');
}

function renderGroupSection(group: NamespaceGroup): string {
  const parts: string[] = [`## ${group.name}`];

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
  const parts: string[] = [`### ${entity.model.className}`];

  if (entity.jsDoc?.description) {
    parts.push(`> ${entity.jsDoc.description}`);
  }

  // STI metadata note
  if (entity.model.discriminatorColumn) {
    parts.push(
      `*STI root — discriminator column: \`${entity.model.discriminatorColumn}\`*`,
    );
  } else if (entity.model.extendsEntity) {
    parts.push(`*Extends \`${entity.model.extendsEntity}\` (Single Table Inheritance)*`);
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
  const header = '| Column | Type | Key | Description |';
  const sep = '|--------|------|-----|-------------|';
  const rows = entity.model.columns.map((col) => {
    const key = resolveColumnKey(col);
    const desc = buildColumnDescription(col, entity);
    return `| ${col.fieldName} | ${col.type} | ${key} | ${desc} |`;
  });
  return [header, sep, ...rows].join('\n');
}

/** Returns the "Key" cell value for the column table. */
function resolveColumnKey(col: ColumnModel): string {
  if (col.isPrimary) return 'PK';
  if (col.isForeignKey) {
    // Show TS property name in parentheses if it differs from the DB column name
    return col.fieldName !== col.propName ? `FK (${col.propName})` : 'FK';
  }
  if (col.isUnique) return 'UK';
  if (col.formula !== undefined) return `formula: ${col.formula}`;
  if (col.isDiscriminator) return 'discriminator';
  if (col.embeddedIn !== undefined) return `[${col.embeddedIn}]`;
  return '';
}

/** Builds the "Description" cell — JSDoc description + nullable marker. */
function buildColumnDescription(col: ColumnModel, entity: EnrichedEntity): string {
  const jsDocDesc = entity.propDocs.get(col.propName)?.description ?? '';
  const nullable = col.isNullable && !col.isPrimary ? ' *(nullable)*' : '';
  return `${jsDocDesc}${nullable}`.trim();
}

function renderConstraints(constraints: ConstraintModel[]): string {
  const lines = ['**Constraints:**', ''];
  for (const c of constraints) {
    const name = c.name ? ` \`${c.name}\`` : '';
    if (c.type === 'index') {
      lines.push(`- Index${name}: (${c.properties.join(', ')})`);
    } else if (c.type === 'unique') {
      lines.push(`- Unique${name}: (${c.properties.join(', ')})`);
    } else if (c.type === 'check') {
      lines.push(`- Check${name}: \`${c.expression ?? ''}\``);
    }
  }
  return lines.join('\n');
}
