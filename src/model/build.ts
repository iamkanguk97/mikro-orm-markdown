import { type EntityMetadata, ReferenceKind } from '@mikro-orm/core';
import type { EntityJsDocInfo, JsDocResult, PropJsDocInfo, PropJsDocMap } from '../docs/jsdoc.js';
import { emitWarning, type WarnHandler } from '../warnings.js';
import { buildDiagramModel } from './diagram.js';
import type { ColumnModel, EntityModel, RelationEdge } from './types.js';

// Mermaid cardinality tokens upgrading the "many" side from zero-or-more to one-or-more.
const FROM_ONE_OR_MORE = '}|';
const TO_ONE_OR_MORE = '|{';

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
  const allRelations = applyAtLeastOne(relations, metas, jsDocResult.props, onWarn);

  // Classes excluded via @hidden — FK columns pointing at them would otherwise
  // dangle (their edge is dropped, but the column would still reference a target
  // that no longer appears anywhere).
  const hiddenClasses = new Set<string>();
  for (const model of diagramEntities) {
    if (jsDocResult.entities.get(model.className)?.hidden) {
      hiddenClasses.add(model.className);
    }
  }

  // Build enriched entity map, filtering out @hidden entities.
  const enrichedByClass = new Map<string, EnrichedEntity>();
  for (const model of diagramEntities) {
    const jsDoc = jsDocResult.entities.get(model.className);
    if (jsDoc?.hidden) {
      continue;
    }
    const columns = model.columns.filter(
      (col) => !(col.isForeignKey && col.referencedEntity !== undefined && hiddenClasses.has(col.referencedEntity))
    );
    const visibleModel = removeHiddenEntityReferences(
      columns.length === model.columns.length ? model : { ...model, columns },
      hiddenClasses
    );
    const ownPropDocs = jsDocResult.props.get(model.className) ?? new Map<string, PropJsDocInfo>();
    const propDocs = withEmbeddedPropDocs(ownPropDocs, visibleModel.columns, jsDocResult.props);
    enrichedByClass.set(model.className, { model: visibleModel, jsDoc, propDocs });
  }

  // Collect all unique namespace names referenced by any entity.
  const groupNames = new Set<string>();
  let anyUntagged = false;
  for (const { jsDoc } of enrichedByClass.values()) {
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
    groupNames.add('default');
  }

  const groups: NamespaceGroup[] = [];
  for (const groupName of groupNames) {
    const isDefault = groupName === 'default';

    const erdEntities = [...enrichedByClass.values()]
      .filter(({ jsDoc }) => belongsToGroupForErd(jsDoc, groupName, isDefault))
      .map((entity): EnrichedEntity | null => {
        if (isCrossNamespaceInGroup(entity.jsDoc, groupName, isDefault)) {
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
      belongsToGroupForText(jsDoc, groupName, isDefault)
    );

    const erdClassNames = new Set(erdEntities.map((e) => e.model.className));
    const erdRelations = allRelations.filter((r) => erdClassNames.has(r.fromEntity) && erdClassNames.has(r.toEntity));

    groups.push({ name: groupName, erdEntities, textEntities, erdRelations });
  }

  // Sort alphabetically; "default" is always last.
  groups.sort((a, b) => {
    if (a.name === 'default') {
      return 1;
    }
    if (b.name === 'default') {
      return -1;
    }
    return a.name.localeCompare(b.name);
  });

  return { title, groups, ...(description !== undefined && { description }) };
}

function removeHiddenEntityReferences(model: EntityModel, hiddenClasses: Set<string>): EntityModel {
  if (model.extendsEntity === undefined || !hiddenClasses.has(model.extendsEntity)) {
    return model;
  }

  const visibleModel = { ...model };
  delete visibleModel.extendsEntity;
  return visibleModel;
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

      let edge: RelationEdge | undefined;
      // 1:N collection — the edge comes from the m:1 owning side; bump its "many" (from) side.
      if (prop.kind === ReferenceKind.ONE_TO_MANY && prop.mappedBy) {
        edge = adjusted.find(
          (e) => e.fromEntity === prop.type && e.toEntity === className && e.label === prop.mappedBy
        );
        if (edge) {
          edge.fromCardinality = FROM_ONE_OR_MORE;
        }
      }
      // M:N owning collection — edge built from this prop; the other (to) side becomes one-or-more.
      else if (prop.kind === ReferenceKind.MANY_TO_MANY && prop.owner === true) {
        edge = adjusted.find((e) => e.fromEntity === className && e.toEntity === prop.type && e.label === propName);
        if (edge) {
          edge.toCardinality = TO_ONE_OR_MORE;
        }
      }
      // M:N inverse collection — edge built from the owner; this (from) side becomes one-or-more.
      else if (prop.kind === ReferenceKind.MANY_TO_MANY && prop.mappedBy) {
        edge = adjusted.find(
          (e) => e.fromEntity === prop.type && e.toEntity === className && e.label === prop.mappedBy
        );
        if (edge) {
          edge.fromCardinality = FROM_ONE_OR_MORE;
        }
      }

      // No matching edge: a unidirectional @OneToMany (no mappedBy) or a label
      // mismatch leaves the cardinality unchanged. Warn instead of failing silently.
      if (!edge) {
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

function hasNoNamespaceTags(jsDoc: EntityJsDocInfo | undefined): boolean {
  if (!jsDoc) {
    return true;
  }
  return jsDoc.namespaces.length === 0 && jsDoc.erdNamespaces.length === 0 && jsDoc.describeNamespaces.length === 0;
}

function belongsToGroupForErd(jsDoc: EntityJsDocInfo | undefined, groupName: string, isDefault: boolean): boolean {
  if (isDefault) {
    return hasNoNamespaceTags(jsDoc);
  }
  if (!jsDoc) {
    return false;
  }
  return jsDoc.namespaces.includes(groupName) || jsDoc.erdNamespaces.includes(groupName);
}

function belongsToGroupForText(jsDoc: EntityJsDocInfo | undefined, groupName: string, isDefault: boolean): boolean {
  if (isDefault) {
    return hasNoNamespaceTags(jsDoc);
  }
  if (!jsDoc) {
    return false;
  }
  return jsDoc.namespaces.includes(groupName) || jsDoc.describeNamespaces.includes(groupName);
}

/**
 * Returns true when an entity appears in a group's ERD only via @erd while its
 * home section is another namespace. Entities with only @erd tags have no text
 * home section, so their ERD section renders the full model.
 */
function isCrossNamespaceInGroup(jsDoc: EntityJsDocInfo | undefined, groupName: string, isDefault: boolean): boolean {
  if (isDefault || !jsDoc) {
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
