import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * A user-facing account — stays visible in every output.
 * @namespace Access
 */
@Entity()
export class Account {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Unique sign-in address. */
  @Property({ type: 'string', unique: true })
  email!: string;
}
