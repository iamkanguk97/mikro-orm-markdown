import { EntitySchema } from '@mikro-orm/core';

/**
 * Featured storefront showcase.
 *
 * @namespace Storefront
 */
export const ShowcaseSchema = new EntitySchema({
  name: 'Showcase',
  properties: {
    id: { primary: true, type: 'number' },
    label: { type: 'string' },
  },
});
