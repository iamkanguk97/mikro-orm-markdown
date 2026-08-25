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
    /** Display label shown on the storefront tile. */
    label: { type: 'string', comment: 'Comment fallback for the label.' },
  },
});
