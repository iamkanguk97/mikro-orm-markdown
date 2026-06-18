import { Embeddable, Property } from '@mikro-orm/core';

/**
 * Postal address value object — stored inline on the owning table with no
 * table of its own. Embeddables have no Prisma equivalent; their fields are
 * flattened into the parent (e.g. address_street, address_city).
 */
@Embeddable()
export class Address {
  /** Street line. */
  @Property({ type: 'string' })
  street!: string;

  /** City name. */
  @Property({ type: 'string' })
  city!: string;

  /** Optional postal / ZIP code. */
  @Property({ type: 'string', nullable: true })
  zipCode?: string;
}
