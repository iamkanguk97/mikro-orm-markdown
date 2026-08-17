import { EntitySchema } from '@mikro-orm/core';

/**
 * Name-only EntitySchema in a TypeScript source file. Under the auto-injected
 * TsMorphMetadataProvider the source file itself is found, but it contains no
 * class declaration to analyse, so MikroORM throws its own MetadataError
 * ("Source class for entity Catalog not found") during discovery — generation
 * only proceeds through the TsMorph fallback retry.
 *
 * The tag below is the #107 regression pin: schema-declaration JSDoc is bound
 * since #106 step 4, so this entity must actually disappear from the output.
 *
 * @hidden
 */
export const CatalogSchema = new EntitySchema({
  name: 'Catalog',
  properties: {
    id: { primary: true, type: 'number' },
    title: { type: 'string' },
  },
});
