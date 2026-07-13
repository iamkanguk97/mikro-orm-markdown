import { Embeddable, Property } from '@mikro-orm/core';

@Embeddable()
export class CoverageAddress {
  /** Street description from the embeddable source. */
  @Property({ type: 'string' })
  street!: string;
}

@Embeddable()
export class UnusedCoverageAddress {
  @Property({ type: 'string' })
  value!: string;
}
