import type { EntityMetadata } from '@mikro-orm/core';
import type { EntityJsDocInfo, JsDocResult, PropJsDocInfo } from '../docs/jsdoc.js';
import { buildDiagramModel } from '../render/mermaid.js';
import type { EntityModel, RelationEdge } from './types.js';

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
  description?: string
): DocumentModel {
  const { entities: diagramEntities, relations: allRelations } = buildDiagramModel(metas);

  // Build enriched entity map, filtering out @hidden entities.
  const enrichedByClass = new Map<string, EnrichedEntity>();
  for (const model of diagramEntities) {
    const jsDoc = jsDocResult.entities.get(model.className);
    if (jsDoc?.hidden) {
      continue;
    }
    const propDocs = jsDocResult.props.get(model.className) ?? new Map<string, PropJsDocInfo>();
    enrichedByClass.set(model.className, { model, jsDoc, propDocs });
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

    const erdEntities = [...enrichedByClass.values()].filter(({ jsDoc }) =>
      belongsToGroupForErd(jsDoc, groupName, isDefault)
    );

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
