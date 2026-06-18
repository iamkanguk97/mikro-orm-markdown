import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * Internal audit log. The hidden tag below excludes it from the entire
 * generated document, so it never appears in ERD.md even though it is a
 * real, fully mapped entity.
 * @hidden
 */
@Entity()
export class AuditLog {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** The action that was recorded. */
  @Property({ type: 'string' })
  action!: string;

  /** When the action happened. */
  @Property({ type: 'datetime' })
  at: Date = new Date();
}
