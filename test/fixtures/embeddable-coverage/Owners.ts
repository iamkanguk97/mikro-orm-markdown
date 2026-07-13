import { Embedded, Entity, PrimaryKey } from '@mikro-orm/core';
import { CoverageAddress } from './Address.js';

@Entity()
export class VisibleEmbeddedOwner {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  @Embedded(() => CoverageAddress)
  address!: CoverageAddress;
}

/** @hidden */
@Entity()
export class HiddenEmbeddedOwner {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  @Embedded(() => CoverageAddress)
  address!: CoverageAddress;
}

/** @erd DiagramOnly */
@Entity()
export class ErdOnlyEmbeddedOwner {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  @Embedded(() => CoverageAddress)
  address!: CoverageAddress;
}

@Entity()
export class PlainCoverageEntity {
  @PrimaryKey({ type: 'integer' })
  id!: number;
}
