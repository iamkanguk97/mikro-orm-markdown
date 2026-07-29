import type { EntityMetadata } from '@mikro-orm/core';

/**
 * True for entities that appear in the generated document. Pivot tables and
 * embeddables are not user-facing entities: pivots surface as m:n relation
 * edges and embeddables as flattened columns on their owners, so neither gets
 * an entity box or a text section of its own.
 */
export function isRenderableMeta(meta: EntityMetadata): boolean {
  return !meta.pivotTable && !meta.embeddable;
}
