import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import type { Order } from './Order.js';
import type { Product } from './Product.js';

/**
 * A single line item within an order.
 * @namespace Shop
 */
@Entity()
export class OrderItem {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Quantity ordered. */
  @Property({ type: 'integer' })
  quantity!: number;

  /** The parent order (required). */
  @ManyToOne({ entity: () => 'Order', nullable: false })
  order!: Order;

  /** The product being ordered (required). */
  @ManyToOne({ entity: () => 'Product', nullable: false })
  product!: Product;
}
