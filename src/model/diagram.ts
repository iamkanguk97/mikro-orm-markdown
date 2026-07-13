import type { EntityMetadata, EntityProperty, FormulaTable } from '@mikro-orm/core';
import { ReferenceKind } from '@mikro-orm/core';
import type { ColumnModel, ConstraintModel, DiagramModel, EntityModel, RelationEdge } from './types.js';

const FORMULA_ALIAS = 'e0';
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
          isUnique: isPropertyColumnUnique(prop),
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
        ? resolveFormulaExpr(prop.formula as (table: FormulaTable, cols: Record<string, string>) => string, owningMeta)
        : undefined;

    // Shadow property (persist: false, e.g. a cached/computed runtime value or a
    // getter-only property): MikroORM never writes or reads a DB column for it, so
    // it has no physical column to document. @Formula columns are persist: false
    // too, but they ARE meaningful to document (a real SELECT-time expression), so
    // only skip when there is no formula.
    if (prop.persist === false && formulaExpr === undefined) {
      return [];
    }

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
        isUnique: isPropertyColumnUnique(prop),
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
 * Calls the FormulaCallback with the same physical metadata shape MikroORM provides at query time.
 * String-based formulas (most common) ignore both arguments and return the literal string.
 * Function-based formulas can use the table, schema, stable alias, and physical column names.
 * Returns a visible fallback on unexpected errors so generated docs do not hide
 * that the expression could not be resolved.
 */
function resolveFormulaExpr(
  cb: (table: FormulaTable, cols: Record<string, string>) => string,
  owningMeta: EntityMetadata
): string {
  try {
    const schema = owningMeta.schema === '*' ? undefined : owningMeta.schema;
    const table: FormulaTable = {
      alias: FORMULA_ALIAS,
      name: owningMeta.tableName,
      ...(schema !== undefined && { schema }),
      qualifiedName: schema ? `${schema}.${owningMeta.tableName}` : owningMeta.tableName,
      toString: () => FORMULA_ALIAS,
    };
    const columns: Record<string, string> = {};
    for (const property of Object.values(owningMeta.properties)) {
      const fieldName = property.fieldNames?.[0];
      if (fieldName !== undefined) {
        columns[property.name] = fieldName;
      }
    }

    const result = cb(table, columns);
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
  const isCompositeOwningOneToOneUnique =
    prop.kind === ReferenceKind.ONE_TO_ONE &&
    prop.owner === true &&
    fieldNames.length > 1 &&
    (prop.unique === true || typeof prop.unique === 'string');

  return fieldNames.map((fieldName, index) => ({
    propName: prop.name,
    fieldName,
    type: fkTypes[index] ?? fkTypes[0] ?? 'integer',
    isPrimary: prop.primary === true,
    isForeignKey: true,
    isUnique: isCompositeOwningOneToOneUnique ? false : isPropertyColumnUnique(prop),
    isNullable: prop.nullable === true,
    ...(prop.comment !== undefined && { comment: prop.comment }),
    referencedEntity: prop.type,
  }));
}

function isPropertyColumnUnique(prop: EntityProperty): boolean {
  if (prop.unique === true) {
    return true;
  }
  return typeof prop.unique === 'string' && prop.persist !== false && prop.fieldNames?.length === 1;
}

interface PrimaryPhysicalField {
  ownerClassName: string;
  property: EntityProperty;
  fieldName: string;
  fieldIndex: number;
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

  const primaryFields = getPrimaryPhysicalFields(refMeta);
  const referencedColumnNames = prop.referencedColumnNames ?? [];
  return Array.from({ length: fieldNameCount }, (_value, index) => {
    const referencedColumnName = referencedColumnNames[index];
    const referencedField =
      referencedColumnName !== undefined
        ? primaryFields.find((candidate) => candidate.fieldName === referencedColumnName)
        : undefined;

    const resolvedField = referencedField ?? primaryFields[index] ?? primaryFields[0];
    return resolvedField === undefined ? 'integer' : resolveScalarType(resolvedField, metaByClass);
  });
}

/**
 * Follows entity-class-name references until a non-entity scalar type is reached.
 * Handles supertype-subtype chains where B.id is FK to A, and C.id is FK to B.
 * Physical field identity preserves composite-key alignment at each level of the chain.
 */
function resolveScalarType(
  field: PrimaryPhysicalField,
  metaByClass: Map<string, EntityMetadata>,
  visitedPath: ReadonlySet<string> = new Set<string>()
): string {
  const fieldIdentity = JSON.stringify([field.ownerClassName, field.fieldName]);
  if (visitedPath.has(fieldIdentity)) {
    return 'unknown';
  }

  const nextVisitedPath = new Set(visitedPath);
  nextVisitedPath.add(fieldIdentity);

  const type = field.property.type ?? 'integer';
  const refMeta = metaByClass.get(type);
  if (!refMeta) {
    return type;
  }
  const primaryFields = getPrimaryPhysicalFields(refMeta);
  if (primaryFields.length === 0) {
    return type;
  }
  const referencedColumnName = field.property.referencedColumnNames?.[field.fieldIndex];
  const referencedField =
    referencedColumnName !== undefined
      ? primaryFields.find((candidate) => candidate.fieldName === referencedColumnName)
      : undefined;
  const targetField = referencedField ?? primaryFields[field.fieldIndex] ?? primaryFields[0];
  return targetField === undefined ? type : resolveScalarType(targetField, metaByClass, nextVisitedPath);
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

function getPrimaryPhysicalFields(meta: EntityMetadata): PrimaryPhysicalField[] {
  return getPrimaryProps(meta).flatMap((property) => {
    const fieldNames = property.fieldNames.length > 0 ? property.fieldNames : [property.name];
    return fieldNames.map((fieldName, fieldIndex) => ({
      ownerClassName: meta.className,
      property,
      fieldName,
      fieldIndex,
    }));
  });
}

/** Collects indexes, unique constraints, and check constraints from entity and property metadata. */
function buildConstraints(meta: EntityMetadata): ConstraintModel[] {
  const result: ConstraintModel[] = [];
  const indexIdentities = new Set<string>();
  const uniqueIdentities = new Set<string>();

  for (const idx of meta.indexes ?? []) {
    const props = idx.properties;
    const constraint: ConstraintModel = {
      type: 'index',
      properties: resolveConstraintProperties(meta, props),
      ...(idx.name !== undefined && { name: idx.name }),
    };

    // Expression indexes have no property tuple until their expression is
    // modelled separately, so they cannot share this tuple-based identity.
    if (idx.expression !== undefined) {
      result.push(constraint);
      continue;
    }
    pushDistinctConstraint(result, indexIdentities, constraint);
  }

  for (const prop of Object.values(meta.properties)) {
    const fieldName = prop.fieldNames?.[0];
    if (
      (prop.index !== true && typeof prop.index !== 'string') ||
      prop.persist === false ||
      prop.fieldNames?.length !== 1 ||
      fieldName === undefined
    ) {
      continue;
    }
    pushDistinctConstraint(result, indexIdentities, {
      type: 'index',
      properties: [fieldName],
      ...(typeof prop.index === 'string' && { name: prop.index }),
    });
  }

  for (const uniq of meta.uniques ?? []) {
    const props = uniq.properties;
    pushDistinctConstraint(result, uniqueIdentities, {
      type: 'unique',
      properties: resolveConstraintProperties(meta, props),
      ...(uniq.name !== undefined && { name: uniq.name }),
    });
  }

  for (const prop of Object.values(meta.properties)) {
    const fieldNames = prop.fieldNames ?? [];
    if (
      prop.kind === ReferenceKind.ONE_TO_ONE &&
      prop.owner === true &&
      prop.persist !== false &&
      fieldNames.length > 1 &&
      (prop.unique === true || typeof prop.unique === 'string')
    ) {
      pushDistinctConstraint(result, uniqueIdentities, {
        type: 'unique',
        properties: fieldNames,
        ...(typeof prop.unique === 'string' && { name: prop.unique }),
      });
      continue;
    }

    const fieldName = fieldNames[0];
    if (
      typeof prop.unique !== 'string' ||
      prop.persist === false ||
      fieldNames.length !== 1 ||
      fieldName === undefined
    ) {
      continue;
    }
    pushDistinctConstraint(result, uniqueIdentities, {
      type: 'unique',
      name: prop.unique,
      properties: [fieldName],
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

function pushDistinctConstraint(result: ConstraintModel[], identities: Set<string>, constraint: ConstraintModel): void {
  const identity = JSON.stringify([constraint.type, constraint.name ?? null, constraint.properties]);
  if (identities.has(identity)) {
    return;
  }
  identities.add(identity);
  result.push(constraint);
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
    if (prop.type === fromEntity) {
      return null; // self-reference: shown as column comment, not a relation line
    }
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
