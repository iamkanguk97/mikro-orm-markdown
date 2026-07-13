import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * Entity source description
 * @namespace EntityNamespace
 */
@Entity()
export class CollisionEntity {
  /** Entity id description */
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Entity name description */
  @Property({ type: 'string' })
  name!: string;
}
