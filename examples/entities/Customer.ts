import { Embedded, Entity, Formula, Index, PrimaryKey, Property, Unique } from '@mikro-orm/core';
import { Address } from './Address.js';

/**
 * A shop customer with an embedded address and a computed display column.
 * @namespace Shop
 */
@Entity()
@Unique({ name: 'customer_email_uq', properties: ['email'] })
@Index({ name: 'customer_name_idx', properties: ['name'] })
export class Customer {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  // No JSDoc: the @Property `comment` is used as the column description instead.
  @Property({ type: 'string', comment: 'Full legal name' })
  name!: string;

  /** Billing email. */
  @Property({ type: 'string' })
  email!: string;

  /** Billing address, flattened into individual address columns on the owning table. */
  @Embedded(() => Address)
  address!: Address;

  /** Number of characters in the name, computed in SQL (no physical column). */
  @Formula('LENGTH(name)', { type: 'integer' })
  nameLength?: number;
}
