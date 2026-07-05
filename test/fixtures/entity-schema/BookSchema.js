import { EntitySchema } from '@mikro-orm/core';

export class Book {}

/** Class-linked EntitySchema: registers in EntitySchema.REGISTRY, detected with certainty. */
export const BookSchema = new EntitySchema({
  class: Book,
  properties: {
    id: { primary: true, type: 'number' },
    title: { type: 'string' },
  },
});

/** Name-only EntitySchema: no class link, so it never registers in EntitySchema.REGISTRY. */
export const PublisherSchema = new EntitySchema({
  name: 'Publisher',
  properties: {
    id: { primary: true, type: 'number' },
    name: { type: 'string' },
  },
});
