import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import type { Account } from './Account.js';

/**
 * Internal login session — `@hidden` removes it (and its relations) from the
 * ERD and the tables entirely.
 * @hidden
 */
@Entity()
export class Session {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Opaque session token. */
  @Property({ type: 'string' })
  token!: string;

  /** Account this session belongs to. */
  @ManyToOne({ entity: () => 'Account' })
  account!: Account;
}
