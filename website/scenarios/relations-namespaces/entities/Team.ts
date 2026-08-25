import { Collection, Entity, OneToMany, PrimaryKey, Property } from '@mikro-orm/core';
import type { Member } from './Member.js';

/**
 * A team that members belong to.
 * @namespace Org
 */
@Entity()
export class Team {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Display name shown in the org chart. */
  @Property({ type: 'string', unique: true })
  name!: string;

  /** Members belonging to this team. */
  @OneToMany({ entity: () => 'Member', mappedBy: 'team' })
  members = new Collection<Member>(this);
}
