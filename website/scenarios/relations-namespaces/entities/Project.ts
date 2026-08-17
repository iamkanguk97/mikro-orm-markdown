import { Collection, Entity, ManyToMany, PrimaryKey, Property } from '@mikro-orm/core';
import type { Member } from './Member.js';

/**
 * A deliverable that a group of members works on.
 * @namespace Delivery
 */
@Entity()
export class Project {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Project title. */
  @Property({ type: 'string' })
  title!: string;

  /** Members assigned to this project (owning side of the many-to-many). */
  @ManyToMany({ entity: () => 'Member' })
  members = new Collection<Member>(this);
}
