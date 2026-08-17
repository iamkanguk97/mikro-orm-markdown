import { EntitySchema } from '@mikro-orm/core';

/**
 * Class-side description for Book.
 *
 * @namespace Catalog
 */
export class Book {}

/**
 * Schema-side description for Book — the class wins this conflict.
 * (Class-linked EntitySchema: registers in EntitySchema.REGISTRY, detected with certainty.)
 */
export const BookSchema = new EntitySchema({
  class: Book,
  properties: {
    id: { primary: true, type: 'number' },
    title: { type: 'string' },
  },
});

/**
 * Name-only Publisher declared as EntitySchema.
 * (No class link, so it never registers in EntitySchema.REGISTRY.)
 *
 * @namespace Catalog
 */
export const PublisherSchema = new EntitySchema({
  name: 'Publisher',
  properties: {
    id: { primary: true, type: 'number' },
    name: { type: 'string' },
  },
});
