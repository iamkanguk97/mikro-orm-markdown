import { EntitySchema } from '@mikro-orm/core';

/**
 * Name-only EntitySchema in a TypeScript source file. Under the auto-injected
 * TsMorphMetadataProvider the source file itself is found, but it contains no
 * class declaration to analyse, so MikroORM throws its own MetadataError
 * ("Source class for entity Catalog not found") during discovery — before the
 * unsupported-definition rejection in load.ts can run.
 */
export const CatalogSchema = new EntitySchema({
  name: 'Catalog',
  properties: {
    id: { primary: true, type: 'number' },
    title: { type: 'string' },
  },
});
