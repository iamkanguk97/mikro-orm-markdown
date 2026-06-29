import type { EntityMetadata, EntityProperty, FormulaTable } from '@mikro-orm/core';
import { ReferenceKind } from '@mikro-orm/core';
import type { ColumnModel, ConstraintModel, DiagramModel, EntityModel, RelationEdge } from '../model/types.js';
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
        // it verbatim. Guard against a missing type so downstream string
        // handling never sees undefined (matches the FK path's defaulting).
        type: prop.type ?? 'unknown',
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
    const cols = buildForeignKeyColumns(prop, metaByClass);
    if (prop.type === owningMeta.className) {
      return cols.map((col) => ({ ...col, isSelfReference: true }));
    }
    return cols;
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
  const fieldNames = prop.fieldNames && prop.fieldNames.length > 0 ? prop.fieldNames : [`${prop.name}_id`];
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

    const resolvedProp = pkProp ?? primaryProps[index] ?? primaryProps[0];
    const rawType = resolvedProp?.type ?? 'integer';
    // Pass the resolved prop's position so recursive calls follow the same column in
    // deeper entities (preserves composite-key alignment through FK-as-PK chains).
    const pkIndex = resolvedProp !== undefined ? primaryProps.indexOf(resolvedProp) : 0;
    return resolveScalarType(rawType, metaByClass, pkIndex);
  });
}

/**
 * Follows entity-class-name references until a non-entity scalar type is reached.
 * Handles supertype-subtype chains where B.id is FK to A, and C.id is FK to B.
 * pkIndex preserves composite-key column alignment at each level of the chain.
 */
function resolveScalarType(type: string, metaByClass: Map<string, EntityMetadata>, pkIndex = 0, depth = 0): string {
  if (depth >= 5) {
    return 'integer';
  }
  const refMeta = metaByClass.get(type);
  if (!refMeta) {
    return type;
  }
  const primaryProps = getPrimaryProps(refMeta);
  if (primaryProps.length === 0) {
    return type;
  }
  const targetProp = primaryProps[pkIndex] ?? primaryProps[0];
  const nextType = targetProp?.type ?? type;
  if (nextType === type) {
    return type;
  }
  return resolveScalarType(nextType, metaByClass, pkIndex, depth + 1);
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
      properties: resolveConstraintProperties(meta, props),
      ...(idx.name !== undefined && { name: idx.name }),
    });
  }

  for (const uniq of meta.uniques ?? []) {
    const props = uniq.properties;
    result.push({
      type: 'unique',
      properties: resolveConstraintProperties(meta, props),
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

function resolveConstraintProperties(meta: EntityMetadata, props: string | string[] | undefined): string[] {
  const propNames = Array.isArray(props) ? props : props !== undefined ? [props] : [];

  return propNames.flatMap((propName) => {
    const prop = meta.properties[String(propName)];
    if (prop === undefined) {
      return [String(propName)];
    }

    if (prop.fieldNames !== undefined && prop.fieldNames.length > 0) {
      return prop.fieldNames;
    }

    return [prop.name];
  });
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
    if (prop.type === fromEntity) {
      return null; // self-reference: shown as column comment, not a relation line
    }
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
 * Maps DB-specific or ORM-internal type strings to RDBMS-agnostic generic types
 * so the generated docs are portable across PostgreSQL, MySQL, SQLite, etc.
 */
export function normalizeType(type: string): string {
  const t = type.toLowerCase().trim();
  if (t === 'uuid' || t === 'text' || t === 'string' || t.startsWith('varchar')) {
    return 'string';
  }
  if (t === 'timestamptz' || t === 'timestamp' || t === 'datetime') {
    return 'datetime';
  }
  if (t === 'integer' || t === 'int' || t === 'bigint' || t === 'smallint') {
    return 'integer';
  }
  if (t === 'doubletype' || t === 'double precision' || t === 'double' || t === 'float' || t === 'decimal') {
    return 'float';
  }
  if (t === 'boolean' || t === 'bool') {
    return 'boolean';
  }
  if (t === 'jsonb') {
    return 'json';
  }
  return type;
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
