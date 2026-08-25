import { Collection, Entity, ManyToMany, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import type { Project } from './Project.js';
import type { Team } from './Team.js';

/**
 * A person in the organisation.
 * @namespace Org
 */
@Entity()
export class Member {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Full display name. */
  @Property({ type: 'string' })
  fullName!: string;

  /** Team this member belongs to. */
  @ManyToOne({ entity: () => 'Team' })
  team!: Team;

  /** Projects this member works on (inverse side of the many-to-many). */
  @ManyToMany({ entity: () => 'Project', mappedBy: 'members' })
  projects = new Collection<Project>(this);
}
