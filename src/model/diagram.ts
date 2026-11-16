import type { EntityMetadata, EntityProperty, FormulaTable, IndexCallback } from '@mikro-orm/core';
import { ReferenceKind } from '@mikro-orm/core';
import { resolveExtendsName } from '../metadata/extends.js';
import { isRenderableMeta } from '../metadata/renderable.js';
import type { ColumnModel, ConstraintModel, DiagramModel, EntityModel, RelationEdge } from './types.js';

const FORMULA_ALIAS = 'e0';
const UNRESOLVED_FORMULA = '<unresolved>';
/** Used when an FK column's type cannot be resolved from the referenced entity. */
const FALLBACK_COLUMN_TYPE = 'integer';

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
    .filter((meta) => isRenderableMeta(meta))
    .map((meta) => buildEntityModel(meta, metaByClass));

  const relations: RelationEdge[] = buildRelationEdges(metas);

  return { entities, relations };
}

/**
 * STI root: the one family member that carries the discriminatorColumn —
 * MikroORM never copies it down to the children (verified on v6 and v7).
 *
 * Two signals look tempting and are both wrong:
 *  - "extends nothing": a root may inherit from a shared base (an abstract
 *    @Entity or a plain undecorated class) and still be the root.
 *  - "has no discriminatorValue": a *non-abstract* root is assigned its own
 *    value, so this would leak every subclass column into such roots.
 */
function isStiRoot(meta: EntityMetadata): boolean {
  return meta.discriminatorColumn !== undefined;
}

/**
 * MikroORM copies every child-only property onto an STI root, flagged
 * `inherited: true` (and forced nullable), and then hands those same copies to
 * any family member without a discriminatorValue — an abstract class sitting
 * between the root and its concrete children. Neither owns those columns, so
 * nothing drawn for them — columns, relation edges, constraints — may come
 * from the copies.
 *
 * No family check is needed: a concrete child never receives the copies, and
 * MikroORM sets the flag nowhere outside STI (verified on v6 and v7).
 */
function getOwnProperties(meta: EntityMetadata): EntityProperty[] {
  return Object.values(meta.properties).filter((prop) => !isCopiedFromChild(meta, prop));
}

/**
 * Whether a property of `meta` was copied up from an STI child. A copied
 * @Embedded property carries the `inherited` flag itself, but the properties
 * MikroORM then flattens out of it do not — they only point back at it through
 * `embedded: [parentName, fieldName]`, so the flag is looked up along that
 * chain (a nested embeddable adds one more link).
 */
function isCopiedFromChild(
  meta: EntityMetadata,
  prop: EntityProperty,
  visited: ReadonlySet<string> = new Set<string>()
): boolean {
  if (prop.inherited === true) {
    return true;
  }

  const parentName = prop.embedded?.[0];
  const parent = parentName === undefined ? undefined : meta.properties[parentName];
  if (parent === undefined || visited.has(prop.name)) {
    return false;
  }

  return isCopiedFromChild(meta, parent, new Set(visited).add(prop.name));
}

/** The STI root an entity belongs to (itself for a root), or undefined outside an STI family. */
function findStiRoot(meta: EntityMetadata, metaByClass: Map<string, EntityMetadata>): EntityMetadata | undefined {
  const visited = new Set<string>();
  let current: EntityMetadata | undefined = meta;

  while (current !== undefined && !visited.has(current.className)) {
    if (isStiRoot(current)) {
      return current;
    }
    visited.add(current.className);
    const parentName = resolveExtendsName(current);
    current = parentName === undefined ? undefined : metaByClass.get(parentName);
  }

  return undefined;
}

/** Tells whether a constraint naming the given properties belongs on one entity. */
type ConstraintOwnershipCheck = (props: string | string[] | undefined) => boolean;

/**
 * MikroORM merges every class-level index, unique, and check of an STI family
 * into one list shared by the root and all children, without recording which
 * class declared it. The only usable signal is the properties a constraint
 * names: one that belongs to another family member exists on the root as an
 * `inherited: true` copy and is absent from this entity's own properties.
 *
 * Returns a predicate telling whether a constraint naming `props` belongs on
 * `meta`. It deliberately keeps what it cannot attribute — raw SQL expressions
 * (no property list) and names no family member declares — because hiding a
 * real constraint is worse than repeating it.
 */
function createConstraintOwnershipCheck(
  meta: EntityMetadata,
  metaByClass: Map<string, EntityMetadata>
): ConstraintOwnershipCheck {
  const root = findStiRoot(meta, metaByClass);
  if (root === undefined) {
    return () => true;
  }

  const ownNames = new Set(getOwnProperties(meta).map((prop) => prop.name));
  const belongsToAnotherMember = (name: string): boolean => {
    const rootProp = root.properties[name];
    return !ownNames.has(name) && rootProp !== undefined && isCopiedFromChild(root, rootProp);
  };

  return (props: string | string[] | undefined): boolean => !toPropertyNames(props).some(belongsToAnotherMember);
}

function toPropertyNames(props: string | string[] | undefined): string[] {
  const names = Array.isArray(props) ? props : props !== undefined ? [props] : [];
  return names.map(String);
}

function buildEntityModel(meta: EntityMetadata, metaByClass: Map<string, EntityMetadata>): EntityModel {
  const extendsEntity = resolveExtendsName(meta);
  // A root that inherits from a base class has `extends` set too, so the root check comes first.
  // An abstract class in the middle of the family has no discriminatorValue; it is
  // recognized by the root above it instead.
  const isStiChild =
    !isStiRoot(meta) &&
    extendsEntity !== undefined &&
    (meta.discriminatorValue !== undefined || findStiRoot(meta, metaByClass) !== undefined);

  const columns: ColumnModel[] = getOwnProperties(meta).flatMap((prop) => buildColumns(prop, metaByClass, meta));

  return {
    className: meta.className,
    tableName: meta.tableName,
    columns,
    ...(isStiRoot(meta) && { discriminatorColumn: meta.discriminatorColumn as string }),
    ...(isStiChild && { extendsEntity }),
    ...(isStiChild && meta.discriminatorValue !== undefined && { discriminatorValue: String(meta.discriminatorValue) }),
    ...(meta.comment !== undefined && { comment: meta.comment }),
    constraints: buildConstraints(meta, metaByClass),
  };
}

/** Returns ColumnModels for renderable properties, or an empty array to skip. */
function buildColumns(
  prop: EntityProperty,
  metaByClass: Map<string, EntityMetadata>,
  owningMeta: EntityMetadata
): ColumnModel[] {
  if (prop.kind === ReferenceKind.EMBEDDED) {
    return buildEmbeddedColumns(prop);
  }

  if (prop.kind === ReferenceKind.SCALAR) {
    return buildScalarColumns(prop, owningMeta);
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
 * An object/array embedded is stored as a single JSON column, so render one
 * column for it. (`array: true` implies `object: true`.) A plain inline
 * embedded has no column of its own — its fields surface as flat SCALARs.
 */
function buildEmbeddedColumns(prop: EntityProperty): ColumnModel[] {
  if (prop.object !== true && prop.array !== true) {
    return [];
  }

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

function buildScalarColumns(prop: EntityProperty, owningMeta: EntityMetadata): ColumnModel[] {
  // Flat leaf of an object/array embedded: it lives inside the single JSON
  // column rendered by buildEmbeddedColumns, so it is not a column of its
  // own — skip it.
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

  const isDiscriminator = owningMeta.discriminatorColumn !== undefined && prop.name === owningMeta.discriminatorColumn;

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
    const { schema, qualifiedName } = resolveTableSchema(owningMeta);
    const table: FormulaTable = {
      alias: FORMULA_ALIAS,
      name: owningMeta.tableName,
      ...(schema !== undefined && { schema }),
      qualifiedName,
      toString: () => FORMULA_ALIAS,
    };
    const result = cb(table, buildPhysicalColumnMapping(owningMeta));
    // The callback is typed to return a string, but a misbehaving formula can
    // return anything; coerce so downstream string handling never crashes.
    return typeof result === 'string' ? result : String(result);
  } catch {
    return UNRESOLVED_FORMULA;
  }
}

/**
 * Physical table identity handed to formula/index callbacks. A `'*'` schema is
 * MikroORM's dynamic-schema wildcard, not a real schema — it stays out of the
 * qualified name.
 */
function resolveTableSchema(meta: EntityMetadata): { schema?: string; qualifiedName: string } {
  const schema = meta.schema === '*' ? undefined : meta.schema;
  return {
    ...(schema !== undefined && { schema }),
    qualifiedName: schema ? `${schema}.${meta.tableName}` : meta.tableName,
  };
}

function buildPhysicalColumnMapping(meta: EntityMetadata): Record<string, string> {
  const columns: Record<string, string> = {};
  for (const property of Object.values(meta.properties)) {
    const fieldName = property.fieldNames?.[0];
    if (fieldName !== undefined) {
      columns[property.name] = fieldName;
    }
  }
  return columns;
}

function resolveIndexExpression(
  expression: string | IndexCallback<Record<string, unknown>>,
  meta: EntityMetadata,
  indexName: string | undefined
): string | undefined {
  if (typeof expression === 'string') {
    return expression;
  }

  try {
    const { schema, qualifiedName } = resolveTableSchema(meta);
    const table = {
      name: meta.tableName,
      ...(schema !== undefined && { schema }),
      toString: (): string => qualifiedName,
    };
    const result = expression(table, buildPhysicalColumnMapping(meta), indexName ?? '');
    return typeof result === 'string' ? result : undefined;
  } catch {
    return undefined;
  }
}

function resolveIndexPredicate(indexType: unknown): string | undefined {
  if (typeof indexType !== 'object' || indexType === null || !('predicate' in indexType)) {
    return undefined;
  }

  const predicate = indexType.predicate;
  if (typeof predicate !== 'object' || predicate === null || !('toQuery' in predicate)) {
    return undefined;
  }

  const toQuery = predicate.toQuery;
  if (typeof toQuery !== 'function') {
    return undefined;
  }

  try {
    const query = toQuery.call(predicate);
    if (typeof query !== 'string') {
      return undefined;
    }

    const normalized = query.trim();
    const prefix = /^select\s+\*\s+where\s+/i.exec(normalized)?.[0];
    if (prefix === undefined) {
      return undefined;
    }

    return normalized.slice(prefix.length).trim() || undefined;
  } catch {
    return undefined;
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
    type: fkTypes[index] ?? fkTypes[0] ?? FALLBACK_COLUMN_TYPE,
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
    return Array.from({ length: fieldNameCount }, () => FALLBACK_COLUMN_TYPE);
  }

  const primaryFields = getPrimaryPhysicalFields(refMeta);
  const referencedColumnNames = prop.referencedColumnNames ?? [];
  return Array.from({ length: fieldNameCount }, (_value, index) => {
    const resolvedField = resolveReferencedPrimaryField(primaryFields, referencedColumnNames[index], index);
    return resolvedField === undefined ? FALLBACK_COLUMN_TYPE : resolveScalarType(resolvedField, metaByClass);
  });
}

/** A named referenced-column match wins; otherwise fall back positionally, then to the first PK field. */
function resolveReferencedPrimaryField(
  primaryFields: PrimaryPhysicalField[],
  referencedColumnName: string | undefined,
  index: number
): PrimaryPhysicalField | undefined {
  const referencedField =
    referencedColumnName !== undefined
      ? primaryFields.find((candidate) => candidate.fieldName === referencedColumnName)
      : undefined;
  return referencedField ?? primaryFields[index] ?? primaryFields[0];
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

  const type = field.property.type ?? FALLBACK_COLUMN_TYPE;
  const refMeta = metaByClass.get(type);
  if (!refMeta) {
    return type;
  }
  const primaryFields = getPrimaryPhysicalFields(refMeta);
  if (primaryFields.length === 0) {
    return type;
  }
  const targetField = resolveReferencedPrimaryField(
    primaryFields,
    field.property.referencedColumnNames?.[field.fieldIndex],
    field.fieldIndex
  );
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

/**
 * Collects indexes, unique constraints, and check constraints from entity and
 * property metadata. The collection order (entity indexes, property indexes,
 * entity uniques, property uniques, checks) is the rendered order and is
 * pinned by the markdown output — do not reorder. Entity- and property-level
 * declarations of the same kind share one dedup identity set so an exact
 * duplicate tuple appears only once.
 */
function buildConstraints(meta: EntityMetadata, metaByClass: Map<string, EntityMetadata>): ConstraintModel[] {
  const result: ConstraintModel[] = [];
  const indexIdentities = new Set<string>();
  const uniqueIdentities = new Set<string>();
  const isOwned = createConstraintOwnershipCheck(meta, metaByClass);

  collectEntityIndexes(meta, result, indexIdentities, isOwned);
  collectPropertyIndexes(meta, result, indexIdentities);
  collectEntityUniques(meta, result, uniqueIdentities, isOwned);
  collectPropertyUniques(meta, result, uniqueIdentities);
  collectChecks(meta, result, isOwned);

  return result;
}

function collectEntityIndexes(
  meta: EntityMetadata,
  result: ConstraintModel[],
  identities: Set<string>,
  isOwned: ConstraintOwnershipCheck
): void {
  for (const idx of meta.indexes ?? []) {
    const props = idx.properties;
    if (!isOwned(props)) {
      continue;
    }
    const predicate = resolveIndexPredicate(idx.type);
    const expression =
      idx.expression === undefined
        ? undefined
        : resolveIndexExpression(idx.expression as string | IndexCallback<Record<string, unknown>>, meta, idx.name);
    const constraint: ConstraintModel = {
      type: 'index',
      properties: resolveConstraintProperties(meta, props),
      ...(idx.name !== undefined && { name: idx.name }),
      ...(expression !== undefined && { expression }),
      ...(idx.expression !== undefined && expression === undefined && { isExpressionUnresolved: true }),
      ...(predicate !== undefined && { predicate }),
    };

    // Preserve expression declarations independently: an unresolved callback
    // does not expose enough stable information for tuple-based deduplication.
    if (idx.expression !== undefined) {
      result.push(constraint);
      continue;
    }
    pushDistinctConstraint(result, identities, constraint);
  }
}

function collectPropertyIndexes(meta: EntityMetadata, result: ConstraintModel[], identities: Set<string>): void {
  for (const prop of getOwnProperties(meta)) {
    const fieldName = prop.fieldNames?.[0];
    if (
      (prop.index !== true && typeof prop.index !== 'string') ||
      prop.persist === false ||
      prop.fieldNames?.length !== 1 ||
      fieldName === undefined
    ) {
      continue;
    }
    pushDistinctConstraint(result, identities, {
      type: 'index',
      properties: [fieldName],
      ...(typeof prop.index === 'string' && { name: prop.index }),
    });
  }
}

function collectEntityUniques(
  meta: EntityMetadata,
  result: ConstraintModel[],
  identities: Set<string>,
  isOwned: ConstraintOwnershipCheck
): void {
  for (const uniq of meta.uniques ?? []) {
    const props = uniq.properties;
    if (!isOwned(props)) {
      continue;
    }
    pushDistinctConstraint(result, identities, {
      type: 'unique',
      properties: resolveConstraintProperties(meta, props),
      ...(uniq.name !== undefined && { name: uniq.name }),
    });
  }
}

function collectPropertyUniques(meta: EntityMetadata, result: ConstraintModel[], identities: Set<string>): void {
  for (const prop of getOwnProperties(meta)) {
    const fieldNames = prop.fieldNames ?? [];
    // A composite owning 1:1's uniqueness spans all FK columns, so it is one
    // ordered multi-column constraint rather than a per-column marker.
    if (
      prop.kind === ReferenceKind.ONE_TO_ONE &&
      prop.owner === true &&
      prop.persist !== false &&
      fieldNames.length > 1 &&
      (prop.unique === true || typeof prop.unique === 'string')
    ) {
      pushDistinctConstraint(result, identities, {
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
    pushDistinctConstraint(result, identities, {
      type: 'unique',
      name: prop.unique,
      properties: [fieldName],
    });
  }
}

function collectChecks(meta: EntityMetadata, result: ConstraintModel[], isOwned: ConstraintOwnershipCheck): void {
  for (const check of meta.checks ?? []) {
    // Skip function-based check expressions (they require column reference objects at runtime)
    if (typeof check.expression !== 'string') {
      continue;
    }
    // A check declared on a property carries that property's name; a class-level one names none.
    if (!isOwned(check.property)) {
      continue;
    }
    result.push({
      type: 'check',
      properties: [],
      expression: check.expression,
      ...(check.name !== undefined && { name: check.name }),
    });
  }
}

function pushDistinctConstraint(result: ConstraintModel[], identities: Set<string>, constraint: ConstraintModel): void {
  const identity = JSON.stringify([
    constraint.type,
    constraint.name ?? null,
    constraint.properties,
    constraint.expression ?? null,
    constraint.isExpressionUnresolved ?? false,
    constraint.predicate ?? null,
  ]);
  if (identities.has(identity)) {
    return;
  }
  identities.add(identity);
  result.push(constraint);
}

function resolveConstraintProperties(meta: EntityMetadata, props: string | string[] | undefined): string[] {
  return toPropertyNames(props).flatMap((propName) => {
    const prop = meta.properties[propName];
    if (prop === undefined) {
      return [propName];
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
    if (!isRenderableMeta(meta)) {
      continue;
    }

    for (const prop of getOwnProperties(meta)) {
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
      fromCardinality: 'o|',
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
