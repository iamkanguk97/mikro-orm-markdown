import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * A purchasable product.
 * @namespace Shop
 */
@Entity()
@Index({ properties: ['name'] })
export class Product {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Stock-keeping unit (unique). */
  @Property({ type: 'string', unique: true })
  sku!: string;

  /** Display name. */
  @Property({ type: 'string' })
  name!: string;

  /** Price in minor units; the DB column is price_cents per the naming strategy. */
  @Property({ type: 'integer' })
  priceCents!: number;
}
