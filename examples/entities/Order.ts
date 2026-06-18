import { Check, Collection, Entity, ManyToOne, OneToMany, PrimaryKey, Property } from '@mikro-orm/core';
import type { Customer } from './Customer.js';
import type { OrderItem } from './OrderItem.js';

/**
 * A customer order containing at least one line item.
 * @namespace Shop
 */
@Entity()
@Check({ name: 'order_total_non_negative', expression: 'total_cents >= 0' })
export class Order {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Order total in minor units (cents). */
  @Property({ type: 'integer' })
  totalCents!: number;

  /** When the order was placed. */
  @Property({ type: 'datetime' })
  placedAt: Date = new Date();

  /** Customer who placed the order (required). */
  @ManyToOne({ entity: () => 'Customer', nullable: false })
  customer!: Customer;

  /**
   * Line items in this order; an order must have at least one.
   * @atLeastOne
   */
  @OneToMany({ entity: () => 'OrderItem', mappedBy: 'order' })
  items = new Collection<OrderItem>(this);
}
