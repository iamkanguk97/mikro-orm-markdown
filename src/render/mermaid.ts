import type { EntityMetadata, EntityProperty, FormulaTable } from '@mikro-orm/core';
import { ReferenceKind } from '@mikro-orm/core';
import type { ColumnModel, ConstraintModel, DiagramModel, EntityModel, RelationEdge } from '../model/types.js';
import { escapeMermaidQuotedText, toMermaidIdentifier } from './escape.js';

// Dummy table descriptor used when resolving formula expressions for documentation.
// String-based formulas ignore both arguments; function-based formulas use the alias.
const FORMULA_DUMMY_TABLE: FormulaTable = {
  alias: 'e0',
  name: '',
  qualifiedName: '',
  toString: () => 'e0',
};

const UNRESOLVED_FORMULA = '<unresolved>';

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
  // STI root: defines the discriminatorColumn and does not itself extend a parent.
  // A *non-abstract* root is also assigned its own discriminatorValue by MikroORM,
  // so we must not key off the absence of discriminatorValue here — that would
  // misclassify non-abstract roots and leak every subclass column into them.
  // The root's properties list includes all child-only columns (inherited=true) — filter them out.
  const isStiRoot = meta.discriminatorColumn !== undefined && !meta.extends;
  const isStiChild = Boolean(meta.extends) && meta.discriminatorValue !== undefined;

  const columns: ColumnModel[] = [];
  for (const prop of Object.values(meta.properties)) {
    if (isStiRoot && prop.inherited === true) {
      continue;
    }
    columns.push(...buildColumns(prop, metaByClass, meta));
  }

  return {
    className: meta.className,
    tableName: meta.tableName,
    columns,
    isPivot: false,
    isEmbeddable: meta.embeddable === true,
    ...(isStiRoot && { discriminatorColumn: meta.discriminatorColumn as string }),
    ...(isStiChild && { extendsEntity: meta.extends }),
    ...(isStiChild && meta.discriminatorValue !== undefined && { discriminatorValue: String(meta.discriminatorValue) }),
    constraints: buildConstraints(meta),
  };
}

/** Returns ColumnModels for renderable properties, or an empty array to skip. */
function buildColumns(
  prop: EntityProperty,
  metaByClass: Map<string, EntityMetadata>,
  owningMeta: EntityMetadata
): ColumnModel[] {
  if (prop.kind === ReferenceKind.EMBEDDED) {
    // An object/array embedded is stored as a single JSON column, so render one
    // column for it. (`array: true` implies `object: true`.) A plain inline
    // embedded has no column of its own — its fields surface as flat SCALARs.
    if (prop.object === true || prop.array === true) {
      return [
        {
          propName: prop.name,
          fieldName: prop.fieldNames?.[0] ?? prop.name,
          type: 'json',
          isPrimary: false,
          isForeignKey: false,
          isUnique: prop.unique === true,
          isNullable: prop.nullable === true,
          ...(prop.comment !== undefined && { comment: prop.comment }),
          embeddedIn: prop.array === true ? `${prop.type}[]` : prop.type,
        },
      ];
    }
    return [];
  }

  if (prop.kind === ReferenceKind.SCALAR) {
    // Flat leaf of an object/array embedded: it lives inside the single JSON
    // column rendered above, so it is not a column of its own — skip it.
    if (prop.object === true && prop.embedded !== undefined) {
      return [];
    }

    // For @Formula columns, formula is set on a SCALAR-kinded property
    const formulaExpr: string | undefined =
      prop.formula !== undefined
        ? resolveFormulaExpr(prop.formula as (table: FormulaTable, cols: Record<string, string>) => string)
        : undefined;

    // Flat embedded columns carry `embedded: [ownerPropName, embeddedPropName]`
    let embeddedIn: string | undefined;
    let embeddedPropName: string | undefined;
    if (prop.embedded !== undefined) {
      const parentPropName = prop.embedded[0];
      embeddedIn = owningMeta.properties[parentPropName]?.type;
      embeddedPropName = prop.embedded[1];
    }

    const isDiscriminator =
      owningMeta.discriminatorColumn !== undefined && prop.name === owningMeta.discriminatorColumn;

    const enumItems =
      prop.enum === true && Array.isArray(prop.items) && prop.items.length > 0
        ? prop.items.map((item) => String(item))
        : undefined;

    return [
      {
        propName: prop.name,
        fieldName: prop.fieldNames?.[0] ?? prop.name,
        // Store the original type (e.g. `varchar(255)`); the Mermaid renderer
        // sanitizes it for diagram identifiers, while the markdown table shows
        // it verbatim.
        type: prop.type,
        isPrimary: prop.primary === true,
        isForeignKey: false,
        isUnique: prop.unique === true,
        isNullable: prop.nullable === true,
        ...(prop.comment !== undefined && { comment: prop.comment }),
        ...(formulaExpr !== undefined && { formula: formulaExpr }),
        ...(embeddedIn !== undefined && { embeddedIn }),
        ...(embeddedPropName !== undefined && { embeddedPropName }),
        ...(isDiscriminator && { isDiscriminator: true }),
        ...(enumItems !== undefined && { enumItems }),
      },
    ];
  }

  // FK columns: m:1 always owns the FK; 1:1 only when owner === true
  if (prop.kind === ReferenceKind.MANY_TO_ONE || (prop.kind === ReferenceKind.ONE_TO_ONE && prop.owner === true)) {
    return buildForeignKeyColumns(prop, metaByClass);
  }

  // ONE_TO_MANY, MANY_TO_MANY (both owner and inverse) → no physical column
  return [];
}

/**
 * Calls the FormulaCallback with a dummy table and column proxy to extract the SQL expression.
 * String-based formulas (most common) ignore their arguments and return the literal string.
 * Function-based formulas use the alias/column names from the dummy objects.
 * Returns a visible fallback on unexpected errors so generated docs do not hide
 * that the expression could not be resolved.
 */
function resolveFormulaExpr(cb: (table: FormulaTable, cols: Record<string, string>) => string): string {
  try {
    const cols = new Proxy<Record<string, string>>(
      {},
      {
        get: (_target: Record<string, string>, key: string | symbol): string => (typeof key === 'string' ? key : ''),
      }
    );
    const result = cb(FORMULA_DUMMY_TABLE, cols);
    // The callback is typed to return a string, but a misbehaving formula can
    // return anything; coerce so downstream string handling never crashes.
    return typeof result === 'string' ? result : String(result);
  } catch {
    return UNRESOLVED_FORMULA;
  }
}

function buildForeignKeyColumns(prop: EntityProperty, metaByClass: Map<string, EntityMetadata>): ColumnModel[] {
  const fieldNames = prop.fieldNames.length > 0 ? prop.fieldNames : [`${prop.name}_id`];
  const fkTypes = resolveFkTypes(prop, metaByClass, fieldNames.length);

  return fieldNames.map((fieldName, index) => ({
    propName: prop.name,
    fieldName,
    type: fkTypes[index] ?? fkTypes[0] ?? 'integer',
    isPrimary: prop.primary === true,
    isForeignKey: true,
    isUnique: prop.unique === true,
    isNullable: prop.nullable === true,
    ...(prop.comment !== undefined && { comment: prop.comment }),
    referencedEntity: prop.type,
  }));
}

/** Looks up referenced PK types to use as FK column types, preserving composite key order. */
function resolveFkTypes(
  prop: EntityProperty,
  metaByClass: Map<string, EntityMetadata>,
  fieldNameCount: number
): string[] {
  const refMeta = metaByClass.get(prop.type);
  if (!refMeta) {
    return Array.from({ length: fieldNameCount }, () => 'integer');
  }

  const primaryProps = getPrimaryProps(refMeta);
  const referencedColumnNames = prop.referencedColumnNames ?? [];
  return Array.from({ length: fieldNameCount }, (_value, index) => {
    const referencedColumnName = referencedColumnNames[index];
    const pkProp =
      referencedColumnName !== undefined
        ? primaryProps.find((candidate) => candidate.fieldNames.includes(referencedColumnName))
        : undefined;

    return (pkProp ?? primaryProps[index] ?? primaryProps[0])?.type ?? 'integer';
  });
}

function getPrimaryProps(meta: EntityMetadata): EntityProperty[] {
  const primaryKeys = meta.primaryKeys ?? [];
  const orderedPrimaryProps = primaryKeys
    .map((key) => meta.properties[String(key)])
    .filter((prop): prop is EntityProperty => prop !== undefined);

  if (orderedPrimaryProps.length > 0) {
    return orderedPrimaryProps;
  }

  return Object.values(meta.properties).filter((prop) => prop.primary === true);
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

/**
 * Builds edges only from owning sides to avoid duplicate arrows.
 * STI inheritance is not drawn as an edge — it is conveyed through table captions instead.
 */
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
  // Priority: PK > FK > UK
  let qualifier = '';
  if (col.isPrimary) {
    qualifier = ' PK';
  } else if (col.isForeignKey) {
    qualifier = ' FK';
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
  }

  const commentStr = comment !== undefined ? ` "${escapeMermaidQuotedText(comment)}"` : '';
  return `${toMermaidIdentifier(col.type)} ${toMermaidIdentifier(col.fieldName)}${qualifier}${commentStr}`;
}
