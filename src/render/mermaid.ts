import { ReferenceKind } from '@mikro-orm/core';
import type { EntityMetadata, EntityProperty } from '@mikro-orm/core';
import type { ColumnModel, DiagramModel, EntityModel, RelationEdge } from '../model/types.js';

/**
 * Converts raw MikroORM EntityMetadata array into a DiagramModel.
 * Pivot entities are excluded from boxes and represented as edges instead.
 */
export function buildDiagramModel(metas: EntityMetadata[]): DiagramModel {
  const metaByClass = new Map(metas.map((m) => [m.className, m]));

  const entities: EntityModel[] = metas
    .filter((meta) => !meta.pivotTable)
    .map((meta) => buildEntityModel(meta, metaByClass));

  const relations: RelationEdge[] = buildRelationEdges(metas);

  return { entities, relations };
}

function buildEntityModel(
  meta: EntityMetadata,
  metaByClass: Map<string, EntityMetadata>,
): EntityModel {
  const columns: ColumnModel[] = [];

  for (const prop of Object.values(meta.properties)) {
    const col = buildColumn(prop, metaByClass);
    if (col !== null) columns.push(col);
  }

  return {
    className: meta.className,
    tableName: meta.tableName,
    columns,
    isPivot: false,
    isEmbeddable: meta.embeddable === true,
  };
}

/** Returns a ColumnModel for renderable properties, or null to skip. */
function buildColumn(
  prop: EntityProperty,
  metaByClass: Map<string, EntityMetadata>,
): ColumnModel | null {
  if (prop.kind === ReferenceKind.SCALAR) {
    return {
      propName: prop.name,
      fieldName: prop.fieldNames?.[0] ?? prop.name,
      type: normalizeType(prop.type),
      isPrimary: prop.primary === true,
      isForeignKey: false,
      isUnique: prop.unique === true,
      isNullable: prop.nullable === true,
    };
  }

  // FK columns: m:1 always owns the FK; 1:1 only when owner === true
  if (
    prop.kind === ReferenceKind.MANY_TO_ONE ||
    (prop.kind === ReferenceKind.ONE_TO_ONE && prop.owner === true)
  ) {
    const fkType = resolveFkType(prop.type, metaByClass);
    return {
      propName: prop.name,
      fieldName: prop.fieldNames?.[0] ?? `${prop.name}_id`,
      type: fkType,
      isPrimary: false,
      isForeignKey: true,
      isUnique: prop.unique === true,
      isNullable: prop.nullable === true,
    };
  }

  // ONE_TO_MANY, MANY_TO_MANY (both owner and inverse), EMBEDDED → no physical column
  return null;
}

/** Looks up the PK type of the referenced entity to use as FK column type. */
function resolveFkType(
  referencedClassName: string,
  metaByClass: Map<string, EntityMetadata>,
): string {
  const refMeta = metaByClass.get(referencedClassName);
  if (!refMeta) return 'integer';
  const pkProp = Object.values(refMeta.properties).find((p) => p.primary === true);
  return pkProp ? normalizeType(pkProp.type) : 'integer';
}

/** Builds edges only from owning sides to avoid duplicate arrows. */
function buildRelationEdges(metas: EntityMetadata[]): RelationEdge[] {
  const edges: RelationEdge[] = [];

  for (const meta of metas) {
    if (meta.pivotTable) continue;

    for (const prop of Object.values(meta.properties)) {
      const edge = buildEdge(meta.className, prop);
      if (edge !== null) edges.push(edge);
    }
  }

  return edges;
}

function buildEdge(fromEntity: string, prop: EntityProperty): RelationEdge | null {
  const isNullable = prop.nullable === true;

  if (prop.kind === ReferenceKind.MANY_TO_ONE) {
    // Many (Post) → One (Author): Post }o--|| Author
    return {
      fromEntity,
      toEntity: prop.type,
      fromCardinality: '}o',
      toCardinality: isNullable ? 'o|' : '||',
      label: prop.name,
    };
  }

  if (prop.kind === ReferenceKind.ONE_TO_ONE && prop.owner === true) {
    // One ↔ One (owner side): Post ||--|| Other
    return {
      fromEntity,
      toEntity: prop.type,
      fromCardinality: '||',
      toCardinality: isNullable ? 'o|' : '||',
      label: prop.name,
    };
  }

  if (prop.kind === ReferenceKind.MANY_TO_MANY && prop.owner === true) {
    // Many ↔ Many (owner side): Post }o--o{ Tag
    return {
      fromEntity,
      toEntity: prop.type,
      fromCardinality: '}o',
      toCardinality: 'o{',
      label: prop.name,
    };
  }

  // ONE_TO_MANY, MANY_TO_MANY inverse → skip (already drawn from the owning side)
  return null;
}

/**
 * Renders a DiagramModel as a Mermaid erDiagram block string.
 * The returned string starts with "erDiagram" and is ready to embed in a
 * markdown code fence.
 */
export function renderErDiagram(model: DiagramModel): string {
  const lines: string[] = ['erDiagram'];

  for (const entity of model.entities) {
    lines.push(`  ${entity.className} {`);
    for (const col of entity.columns) {
      lines.push(`    ${renderColumnLine(col)}`);
    }
    lines.push('  }');
  }

  for (const rel of model.relations) {
    lines.push(
      `  ${rel.fromEntity} ${rel.fromCardinality}--${rel.toCardinality} ${rel.toEntity} : "${rel.label}"`,
    );
  }

  return lines.join('\n');
}

function renderColumnLine(col: ColumnModel): string {
  // Priority: PK > FK > UK (a column can't be both PK and FK in practice)
  let qualifier = '';
  if (col.isPrimary) qualifier = ' PK';
  else if (col.isForeignKey) qualifier = ' FK';
  else if (col.isUnique) qualifier = ' UK';

  // When the DB column name differs from the TypeScript property name,
  // show the DB name as the column identifier and the TS name as a comment.
  // This is one of our v1 differentiators over prisma-markdown.
  const namesDiffer = col.fieldName !== col.propName;
  const comment = namesDiffer ? ` "${col.propName}"` : '';

  return `${col.type} ${col.fieldName}${qualifier}${comment}`;
}

/** Strips characters that are invalid in Mermaid type identifiers. */
function normalizeType(type: string): string {
  return type.replace(/[^a-zA-Z0-9_]/g, '_');
}
