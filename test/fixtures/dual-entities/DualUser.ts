import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

/** Entity discovered only through entitiesTs in the dual-discovery CLI smoke test. */
@Entity()
export class DualUser {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  @Property({ type: 'string' })
  name!: string;
}
