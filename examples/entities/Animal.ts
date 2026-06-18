import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * Base class for all animals (Single Table Inheritance root). Dog and Cat
 * share one physical table, told apart by the type discriminator column.
 * STI has no Prisma equivalent.
 * @namespace Animals
 */
@Entity({ discriminatorColumn: 'type', abstract: true })
@Index({ name: 'animal_name_idx', properties: ['name'] })
export class Animal {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Display name. */
  @Property({ type: 'string' })
  name!: string;
}
