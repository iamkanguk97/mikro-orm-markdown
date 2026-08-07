import { EntitySchema } from '@mikro-orm/core';

/**
 * Name-only EntitySchema in a TypeScript source file. Under the auto-injected
 * TsMorphMetadataProvider the source file itself is found, but it contains no
 * class declaration to analyse, so MikroORM throws its own MetadataError
 * ("Source class for entity Catalog not found") during discovery — generation
 * only proceeds through the TsMorph fallback retry.
 *
 * The @hidden tag below is deliberate: JSDoc on schema declarations is not
 * read yet (#106), so generation must expose this entity loudly — with a
 * warning naming it — never silently (#107). Once schema JSDoc binding lands,
 * this fixture starts actually disappearing from the output.
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
