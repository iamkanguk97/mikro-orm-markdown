import type { EntityMetadata, EntityProperty, FormulaTable } from '@mikro-orm/core';
import { ReferenceKind } from '@mikro-orm/core';
import type { ColumnModel, ConstraintModel, DiagramModel, EntityModel, RelationEdge } from '../model/types.js';

// Dummy table descriptor used when resolving formula expressions for documentation.
// String-based formulas ignore both arguments; function-based formulas use the alias.
const FORMULA_DUMMY_TABLE: FormulaTable = {
  alias: 'e0',
  name: '',
  qualifiedName: '',
  toString: () => 'e0',
};

/**
 * Converts raw MikroORM EntityMetadata array into a DiagramModel.
 *
 * Excluded from entity boxes:
 *  - Pivot tables (auto-generated M:N join tables) — represented as edges
 *  - @Embeddable classes — their columns appear inline inside the owning entity
 */
export function buildDiagramModel(metas: EntityMetadata[]): DiagramModel {
  const metaByClass = new Map(metas.map((m) => [m.className, m]));

  const entities: EntityModel[] = metas
    .filter((meta) => !meta.pivotTable && !meta.embeddable)
    .map((meta) => buildEntityModel(meta, metaByClass));

  const relations: RelationEdge[] = buildRelationEdges(metas);

  return { entities, relations };
}

function buildEntityModel(meta: EntityMetadata, metaByClass: Map<string, EntityMetadata>): EntityModel {
  // STI root: has discriminatorColumn, no discriminatorValue of its own.
  // Its properties list includes all child-only columns (marked inherited=true) — filter them out.
  const isStiRoot = meta.discriminatorColumn !== undefined && !meta.discriminatorValue;
  const isStiChild = Boolean(meta.extends) && meta.discriminatorValue !== undefined;

  const columns: ColumnModel[] = [];
  for (const prop of Object.values(meta.properties)) {
    if (isStiRoot && prop.inherited === true) {
      continue;
    }
    const col = buildColumn(prop, metaByClass, meta);
    if (col !== null) {
      columns.push(col);
    }
  }

  return {
    className: meta.className,
    tableName: meta.tableName,
    columns,
    isPivot: false,
    isEmbeddable: meta.embeddable === true,
    ...(isStiRoot && { discriminatorColumn: meta.discriminatorColumn as string }),
    ...(isStiChild && { extendsEntity: meta.extends }),
    constraints: buildConstraints(meta),
  };
}

/** Returns a ColumnModel for renderable properties, or null to skip. */
function buildColumn(
  prop: EntityProperty,
  metaByClass: Map<string, EntityMetadata>,
  owningMeta: EntityMetadata
): ColumnModel | null {
  // Skip the EMBEDDED group reference — individual flat columns appear as SCALAR entries
  if (prop.kind === ReferenceKind.EMBEDDED) {
    return null;
  }

  if (prop.kind === ReferenceKind.SCALAR) {
    // For @Formula columns, formula is set on a SCALAR-kinded property
    const formulaExpr: string | undefined =
      prop.formula !== undefined
        ? resolveFormulaExpr(prop.formula as (table: FormulaTable, cols: Record<string, string>) => string)
        : undefined;

    // Flat embedded columns carry `embedded: [ownerPropName, embeddedPropName]`
    let embeddedIn: string | undefined;
    if (prop.embedded !== undefined) {
      const parentPropName = prop.embedded[0];
      embeddedIn = owningMeta.properties[parentPropName]?.type;
    }

    const isDiscriminator =
      owningMeta.discriminatorColumn !== undefined && prop.name === owningMeta.discriminatorColumn;

    return {
      propName: prop.name,
      fieldName: prop.fieldNames?.[0] ?? prop.name,
      type: normalizeType(prop.type),
      isPrimary: prop.primary === true,
      isForeignKey: false,
      isUnique: prop.unique === true,
      isNullable: prop.nullable === true,
      ...(formulaExpr !== undefined && { formula: formulaExpr }),
      ...(embeddedIn !== undefined && { embeddedIn }),
      ...(isDiscriminator && { isDiscriminator: true }),
    };
  }

  // FK columns: m:1 always owns the FK; 1:1 only when owner === true
  if (prop.kind === ReferenceKind.MANY_TO_ONE || (prop.kind === ReferenceKind.ONE_TO_ONE && prop.owner === true)) {
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

  // ONE_TO_MANY, MANY_TO_MANY (both owner and inverse) → no physical column
  return null;
}

/**
 * Calls the FormulaCallback with a dummy table and column proxy to extract the SQL expression.
 * String-based formulas (most common) ignore their arguments and return the literal string.
 * Function-based formulas use the alias/column names from the dummy objects.
 * Returns empty string on unexpected errors.
 */
function resolveFormulaExpr(cb: (table: FormulaTable, cols: Record<string, string>) => string): string {
  try {
    const cols = new Proxy<Record<string, string>>(
      {},
      {
        get: (_target: Record<string, string>, key: string | symbol): string => (typeof key === 'string' ? key : ''),
      }
    );
    return cb(FORMULA_DUMMY_TABLE, cols);
  } catch {
    return '';
  }
}

/** Looks up the PK type of the referenced entity to use as FK column type. */
function resolveFkType(referencedClassName: string, metaByClass: Map<string, EntityMetadata>): string {
  const refMeta = metaByClass.get(referencedClassName);
  if (!refMeta) {
    return 'integer';
  }
  const pkProp = Object.values(refMeta.properties).find((p) => p.primary === true);
  return pkProp ? normalizeType(pkProp.type) : 'integer';
}

/** Collects indexes, unique constraints, and check constraints from entity-level metadata. */
function buildConstraints(meta: EntityMetadata): ConstraintModel[] {
  const result: ConstraintModel[] = [];

  for (const idx of meta.indexes ?? []) {
    const props = idx.properties;
    result.push({
      type: 'index',
      properties: Array.isArray(props) ? props.map(String) : props ? [String(props)] : [],
      ...(idx.name !== undefined && { name: idx.name }),
    });
  }

  for (const uniq of meta.uniques ?? []) {
    const props = uniq.properties;
    result.push({
      type: 'unique',
      properties: Array.isArray(props) ? props.map(String) : props ? [String(props)] : [],
      ...(uniq.name !== undefined && { name: uniq.name }),
    });
  }

  for (const check of meta.checks ?? []) {
    // Skip function-based check expressions (they require column reference objects at runtime)
    if (typeof check.expression !== 'string') {
      continue;
    }
    result.push({
      type: 'check',
      properties: [],
      expression: check.expression,
      ...(check.name !== undefined && { name: check.name }),
    });
  }

  return result;
}

/** Builds edges only from owning sides to avoid duplicate arrows. Includes STI inheritance. */
function buildRelationEdges(metas: EntityMetadata[]): RelationEdge[] {
  const edges: RelationEdge[] = [];

  for (const meta of metas) {
    if (meta.pivotTable || meta.embeddable) {
      continue;
    }

    for (const prop of Object.values(meta.properties)) {
      const edge = buildEdge(meta.className, prop);
      if (edge !== null) {
        edges.push(edge);
      }
    }
  }

  return edges;
}

function buildEdge(fromEntity: string, prop: EntityProperty): RelationEdge | null {
  const isNullable = prop.nullable === true;

  if (prop.kind === ReferenceKind.MANY_TO_ONE) {
    return {
      fromEntity,
      toEntity: prop.type,
      fromCardinality: '}o',
      toCardinality: isNullable ? 'o|' : '||',
      label: prop.name,
    };
  }

  if (prop.kind === ReferenceKind.ONE_TO_ONE && prop.owner === true) {
    return {
      fromEntity,
      toEntity: prop.type,
      fromCardinality: '||',
      toCardinality: isNullable ? 'o|' : '||',
      label: prop.name,
    };
  }

  if (prop.kind === ReferenceKind.MANY_TO_MANY && prop.owner === true) {
    return {
      fromEntity,
      toEntity: prop.type,
      fromCardinality: '}o',
      toCardinality: 'o{',
      label: prop.name,
    };
  }

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
    lines.push(`  ${rel.fromEntity} ${rel.fromCardinality}--${rel.toCardinality} ${rel.toEntity} : "${rel.label}"`);
  }

  return lines.join('\n');
}

function renderColumnLine(col: ColumnModel): string {
  // Priority: PK > FK > UK
  let qualifier = '';
  if (col.isPrimary) {
    qualifier = ' PK';
  } else if (col.isForeignKey) {
    qualifier = ' FK';
  } else if (col.isUnique) {
    qualifier = ' UK';
  }

  // Comment priority (v1 differentiators over prisma-markdown):
  //   1. @Formula SQL expression  — "formula: LENGTH(name)"
  //   2. STI discriminator column — "discriminator"
  //   3. Embedded source type     — "[Address]"
  //   4. DB/TS name mismatch      — "<tsPropName>"
  let comment: string | undefined;
  if (col.formula !== undefined) {
    comment = col.formula ? `formula: ${col.formula}` : 'formula';
  } else if (col.isDiscriminator) {
    comment = 'discriminator';
  } else if (col.embeddedIn !== undefined) {
    comment = `[${col.embeddedIn}]`;
  } else if (col.fieldName !== col.propName) {
    comment = col.propName;
  }

  const commentStr = comment !== undefined ? ` "${comment}"` : '';
  return `${col.type} ${col.fieldName}${qualifier}${commentStr}`;
}

/** Strips characters that are invalid in Mermaid type identifiers. */
function normalizeType(type: string): string {
  return type.replace(/[^a-zA-Z0-9_]/g, '_');
}
