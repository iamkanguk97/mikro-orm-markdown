import { type EntityMetadata, type EntityProperty, ReferenceKind } from '@mikro-orm/core';
import type { EntityJsDocInfo, JsDocResult, PropJsDocInfo, PropJsDocMap } from '../docs/jsdoc.js';
import { emitWarning, type WarnHandler } from '../messages.js';
import { buildDiagramModel } from './diagram.js';
import type { ColumnModel, EntityModel, RelationEdge } from './types.js';

// Mermaid cardinality tokens upgrading the "many" side from zero-or-more to one-or-more.
const FROM_ONE_OR_MORE = '}|';
const TO_ONE_OR_MORE = '|{';
const DEFAULT_NAMESPACE = 'default';

/** An entity with its structural model and JSDoc info merged together. */
export interface EnrichedEntity {
  model: EntityModel;
  /** Undefined if the entity has no class-level JSDoc. */
  jsDoc: EntityJsDocInfo | undefined;
  /** Per-property description map (empty map if no property JSDoc). */
  propDocs: Map<string, PropJsDocInfo>;
}

/**
 * A single namespace group, ready to render as one section of the document.
 *
 * - `erdEntities`: shown in the Mermaid ERD block (@namespace + @erd)
 * - `textEntities`: shown in the column-table sections (@namespace + @describe)
 * - `erdRelations`: relation edges where both endpoints are in `erdEntities`
 */
export interface NamespaceGroup {
  name: string;
  erdEntities: EnrichedEntity[];
  textEntities: EnrichedEntity[];
  erdRelations: RelationEdge[];
}

/** Complete document model — input to the markdown renderer. */
export interface DocumentModel {
  title: string;
  /** Optional paragraph rendered below the H1 heading. */
  description?: string;
  groups: NamespaceGroup[];
}

/**
 * Merges MikroORM structural metadata with JSDoc information and organises the
 * result into namespace groups for rendering.
 *
 * Entities with @hidden are excluded.
 * Entities with no namespace tags fall into the "default" group.
 * Groups are ordered alphabetically, with "default" always last.
 */
export function buildDocumentModel(
  metas: EntityMetadata[],
  jsDocResult: JsDocResult,
  title: string,
  description?: string,
  onWarn?: WarnHandler
): DocumentModel {
  const { entities: diagramEntities, relations } = buildDiagramModel(metas);
  const metadataByClass = new Map(metas.map((meta) => [meta.className, meta]));
  const allRelations = applyAtLeastOne(relations, metas, jsDocResult.props, onWarn);
  const hiddenClasses = collectHiddenClasses(diagramEntities, jsDocResult);

  // Build enriched entity map, filtering out @hidden entities.
  const enrichedByClass = new Map<string, EnrichedEntity>();
  for (const model of diagramEntities) {
    const jsDoc = jsDocResult.entities.get(model.className);
    if (jsDoc?.hidden) {
      continue;
    }
    enrichedByClass.set(
      model.className,
      buildEnrichedEntity(model, jsDoc, jsDocResult, metadataByClass, hiddenClasses)
    );
  }

  const groups: NamespaceGroup[] = [];
  for (const groupName of collectGroupNames(enrichedByClass.values())) {
    groups.push(buildNamespaceGroup(groupName, enrichedByClass, allRelations));
  }

  // Sort alphabetically; "default" is always last.
  groups.sort((a, b) => {
    if (a.name === DEFAULT_NAMESPACE) {
      return 1;
    }
    if (b.name === DEFAULT_NAMESPACE) {
      return -1;
    }
    return a.name.localeCompare(b.name);
  });

  return { title, groups, ...(description !== undefined && { description }) };
}

/**
 * Classes excluded via @hidden — FK columns pointing at them would otherwise
 * dangle (their edge is dropped, but the column would still reference a target
 * that no longer appears anywhere).
 */
function collectHiddenClasses(diagramEntities: EntityModel[], jsDocResult: JsDocResult): Set<string> {
  const hiddenClasses = new Set<string>();
  for (const model of diagramEntities) {
    if (jsDocResult.entities.get(model.className)?.hidden) {
      hiddenClasses.add(model.className);
    }
  }
  return hiddenClasses;
}

/** Merges one diagram entity with its JSDoc, pruning columns and constraints that reference @hidden targets. */
function buildEnrichedEntity(
  model: EntityModel,
  jsDoc: EntityJsDocInfo | undefined,
  jsDocResult: JsDocResult,
  metadataByClass: ReadonlyMap<string, EntityMetadata>,
  hiddenClasses: ReadonlySet<string>
): EnrichedEntity {
  const hiddenForeignKeyColumns = model.columns.filter(
    (column) =>
      column.isForeignKey && column.referencedEntity !== undefined && hiddenClasses.has(column.referencedEntity)
  );
  const hiddenForeignKeyFieldNames = new Set(hiddenForeignKeyColumns.map((column) => column.fieldName));
  const visibleModelWithoutHiddenForeignKeys =
    hiddenForeignKeyFieldNames.size === 0
      ? model
      : {
          ...model,
          columns: model.columns.filter((column) => !hiddenForeignKeyFieldNames.has(column.fieldName)),
          constraints: model.constraints.filter(
            (constraint) =>
              constraint.type === 'check' ||
              constraint.properties.every((property) => !hiddenForeignKeyFieldNames.has(property))
          ),
        };
  const visibleModel = removeHiddenEntityReferences(visibleModelWithoutHiddenForeignKeys, hiddenClasses);
  const stiPropDocs = withInheritedStiPropDocs(model, metadataByClass, jsDocResult.props, hiddenClasses);
  const propDocs = withEmbeddedPropDocs(stiPropDocs, visibleModel.columns, jsDocResult.props);
  return { model: visibleModel, jsDoc, propDocs };
}

/** Collects all unique namespace names referenced by any entity; untagged entities add the "default" group. */
function collectGroupNames(enriched: Iterable<EnrichedEntity>): Set<string> {
  const groupNames = new Set<string>();
  let anyUntagged = false;
  for (const { jsDoc } of enriched) {
    const allNs = [...(jsDoc?.namespaces ?? []), ...(jsDoc?.erdNamespaces ?? []), ...(jsDoc?.describeNamespaces ?? [])];
    if (allNs.length === 0) {
      anyUntagged = true;
    } else {
      for (const ns of allNs) {
        groupNames.add(ns);
      }
    }
  }
  if (anyUntagged) {
    groupNames.add(DEFAULT_NAMESPACE);
  }
  return groupNames;
}

function buildNamespaceGroup(
  groupName: string,
  enrichedByClass: ReadonlyMap<string, EnrichedEntity>,
  allRelations: RelationEdge[]
): NamespaceGroup {
  const isDefault = groupName === DEFAULT_NAMESPACE;

  const erdEntities = [...enrichedByClass.values()]
    .filter(({ jsDoc }) => belongsToGroup(jsDoc, groupName, isDefault, 'erdNamespaces'))
    .map((entity): EnrichedEntity | null => {
      if (isCrossNamespaceInGroup(entity.jsDoc, groupName)) {
        const pkColumns = entity.model.columns.filter((col) => col.isPrimary);
        // If no PK columns remain (e.g. FK-as-PK to a @hidden entity was filtered out),
        // exclude the entity entirely: an empty box with dangling arrows is misleading.
        if (pkColumns.length === 0) {
          return null;
        }
        return { ...entity, model: { ...entity.model, columns: pkColumns } };
      }
      return entity;
    })
    .filter((entity): entity is EnrichedEntity => entity !== null);

  const textEntities = [...enrichedByClass.values()].filter(({ jsDoc }) =>
    belongsToGroup(jsDoc, groupName, isDefault, 'describeNamespaces')
  );

  const erdClassNames = new Set(erdEntities.map((e) => e.model.className));
  const erdRelations = allRelations.filter((r) => erdClassNames.has(r.fromEntity) && erdClassNames.has(r.toEntity));

  return { name: groupName, erdEntities, textEntities, erdRelations };
}

function removeHiddenEntityReferences(model: EntityModel, hiddenClasses: ReadonlySet<string>): EntityModel {
  if (model.extendsEntity === undefined || !hiddenClasses.has(model.extendsEntity)) {
    return model;
  }

  const visibleModel = { ...model };
  delete visibleModel.extendsEntity;
  return visibleModel;
}

/**
 * Merges property documentation from a visible STI ancestry chain.
 *
 * Ancestors are applied root-to-child so the nearest declaration wins, then
 * the current entity is applied last. Raw MikroORM metadata is used because an
 * abstract intermediate STI class may have `extends` without a discriminator
 * value, so it does not get an `EntityModel.extendsEntity` field. A hidden or
 * missing ancestor is a hard boundary, and the visited set keeps malformed
 * cyclic metadata from looping forever.
 */
function withInheritedStiPropDocs(
  model: EntityModel,
  metadataByClass: ReadonlyMap<string, EntityMetadata>,
  allPropDocs: PropJsDocMap,
  hiddenClasses: ReadonlySet<string>
): Map<string, PropJsDocInfo> {
  const ancestorClassNames: string[] = [];
  const visited = new Set<string>([model.className]);
  let ancestorName = metadataByClass.get(model.className)?.extends;

  while (ancestorName !== undefined && !visited.has(ancestorName) && !hiddenClasses.has(ancestorName)) {
    const ancestor = metadataByClass.get(ancestorName);
    if (ancestor === undefined) {
      break;
    }
    visited.add(ancestorName);
    ancestorClassNames.push(ancestorName);
    ancestorName = ancestor.extends;
  }

  const merged = new Map<string, PropJsDocInfo>();
  for (const ancestorClassName of ancestorClassNames.reverse()) {
    for (const [propName, info] of allPropDocs.get(ancestorClassName) ?? []) {
      merged.set(propName, info);
    }
  }
  for (const [propName, info] of allPropDocs.get(model.className) ?? []) {
    merged.set(propName, info);
  }
  return merged;
}

/**
 * Falls back to the @Embeddable class's own JSDoc for flattened embedded columns
 * (e.g. Customer's "address_street" picks up Address.street's JSDoc), since the
 * owning entity's source file never declares that synthetic property name.
 * Returns a new map; the input map is not mutated.
 */
function withEmbeddedPropDocs(
  ownPropDocs: Map<string, PropJsDocInfo>,
  columns: ColumnModel[],
  allPropDocs: PropJsDocMap
): Map<string, PropJsDocInfo> {
  const merged = new Map(ownPropDocs);
  for (const col of columns) {
    if (merged.has(col.propName) || col.embeddedIn === undefined || col.embeddedPropName === undefined) {
      continue;
    }
    const info = allPropDocs.get(col.embeddedIn)?.get(col.embeddedPropName);
    if (info) {
      merged.set(col.propName, info);
    }
  }
  return merged;
}

/**
 * Upgrades the "many" side of a relation edge to one-or-more for collection
 * properties tagged with @atLeastOne. The edge is always built from the owning
 * side, so a collection on the inverse side is matched back via its mappedBy.
 * Returns a new array; input edges are not mutated.
 */
function applyAtLeastOne(
  relations: RelationEdge[],
  metas: EntityMetadata[],
  props: PropJsDocMap,
  onWarn?: WarnHandler
): RelationEdge[] {
  const adjusted = relations.map((edge) => ({ ...edge }));
  const metaByClass = new Map(metas.map((m) => [m.className, m]));

  for (const [className, propMap] of props) {
    const meta = metaByClass.get(className);
    if (!meta) {
      continue;
    }
    for (const [propName, info] of propMap) {
      if (!info.atLeastOne) {
        continue;
      }
      const prop = meta.properties[propName];
      if (!prop) {
        continue;
      }

      const match = findAtLeastOneEdge(adjusted, className, propName, prop);
      if (match) {
        if (match.side === 'from') {
          match.edge.fromCardinality = FROM_ONE_OR_MORE;
        } else {
          match.edge.toCardinality = TO_ONE_OR_MORE;
        }
      }

      // No matching edge: a unidirectional @OneToMany (no mappedBy) or a label
      // mismatch leaves the cardinality unchanged. Warn instead of failing silently.
      if (!match) {
        emitWarning(onWarn, {
          title: '@atLeastOne had no effect',
          detail: `@atLeastOne on ${className}.${propName} had no effect: no matching relation edge was found.`,
          fix:
            'Apply @atLeastOne only to collection relations that can be matched to a rendered edge: ' +
            '@OneToMany with mappedBy, or @ManyToMany on either the owning side or an inverse mappedBy side.',
        });
      }
    }
  }

  return adjusted;
}

/**
 * Finds the rendered edge a collection property's @atLeastOne applies to, and
 * which end of that edge is the collection ("many") side. Edges are always
 * built from the owning side, so an inverse collection matches back via its
 * mappedBy label.
 */
function findAtLeastOneEdge(
  adjusted: RelationEdge[],
  className: string,
  propName: string,
  prop: EntityProperty
): { edge: RelationEdge; side: 'from' | 'to' } | undefined {
  // 1:N collection — the edge comes from the m:1 owning side; bump its "many" (from) side.
  if (prop.kind === ReferenceKind.ONE_TO_MANY && prop.mappedBy) {
    const edge = adjusted.find(
      (e) => e.fromEntity === prop.type && e.toEntity === className && e.label === prop.mappedBy
    );
    return edge ? { edge, side: 'from' } : undefined;
  }
  // M:N owning collection — edge built from this prop; the other (to) side becomes one-or-more.
  if (prop.kind === ReferenceKind.MANY_TO_MANY && prop.owner === true) {
    const edge = adjusted.find((e) => e.fromEntity === className && e.toEntity === prop.type && e.label === propName);
    return edge ? { edge, side: 'to' } : undefined;
  }
  // M:N inverse collection — edge built from the owner; this (from) side becomes one-or-more.
  if (prop.kind === ReferenceKind.MANY_TO_MANY && prop.mappedBy) {
    const edge = adjusted.find(
      (e) => e.fromEntity === prop.type && e.toEntity === className && e.label === prop.mappedBy
    );
    return edge ? { edge, side: 'from' } : undefined;
  }
  return undefined;
}

function hasNoNamespaceTags(jsDoc: EntityJsDocInfo | undefined): boolean {
  if (!jsDoc) {
    return true;
  }
  return jsDoc.namespaces.length === 0 && jsDoc.erdNamespaces.length === 0 && jsDoc.describeNamespaces.length === 0;
}

/**
 * Membership test shared by the ERD and text-table sections: an entity belongs
 * to a group when @namespace or the section-specific tag (@erd / @describe)
 * names it, or — for the default group — when it carries no namespace tags.
 */
function belongsToGroup(
  jsDoc: EntityJsDocInfo | undefined,
  groupName: string,
  isDefault: boolean,
  sectionNamespaces: 'erdNamespaces' | 'describeNamespaces'
): boolean {
  const isExplicitlyIncluded =
    jsDoc !== undefined && (jsDoc.namespaces.includes(groupName) || jsDoc[sectionNamespaces].includes(groupName));
  return isExplicitlyIncluded || (isDefault && hasNoNamespaceTags(jsDoc));
}

/**
 * Returns true when an entity appears in a group's ERD only via @erd while its
 * home section is another namespace. Entities with only @erd tags have no text
 * home section, so their ERD section renders the full model.
 */
function isCrossNamespaceInGroup(jsDoc: EntityJsDocInfo | undefined, groupName: string): boolean {
  if (!jsDoc) {
    return false;
  }
  const hasHomeNamespace = jsDoc.namespaces.length > 0 || jsDoc.describeNamespaces.length > 0;
  return (
    hasHomeNamespace &&
    jsDoc.erdNamespaces.includes(groupName) &&
    !jsDoc.namespaces.includes(groupName) &&
    !jsDoc.describeNamespaces.includes(groupName)
  );
}
