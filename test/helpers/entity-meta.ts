import { type EntityMetadata, ReferenceKind } from '@mikro-orm/core';

type EntityMetaInit = { className: string; tableName: string } & Record<string, unknown>;

/**
 * Central home for the `{} as EntityMetadata` cast. Fixtures intentionally
 * bypass MikroORM's strict metadata types (formula/index callback shapes,
 * partial property payloads), so the init shape stays loose on purpose — a
 * strictly typed builder would reject inputs the tests rely on.
 */
export function makeEntityMeta(init: EntityMetaInit): EntityMetadata {
  return Object.assign({} as EntityMetadata, init);
}

/** The scalar PK property literal shared by most hand-built fixtures. */
export function pkProperty(name = 'id', type = 'integer'): Record<string, unknown> {
  return { name, fieldNames: [name], type, kind: ReferenceKind.SCALAR, primary: true };
}

/** A minimal entity with a single integer PK. */
export function makeSimpleEntityMeta(className: string): EntityMetadata {
  return makeEntityMeta({
    className,
    tableName: className.toLowerCase(),
    primaryKeys: ['id'],
    properties: { id: pkProperty() },
  });
}
