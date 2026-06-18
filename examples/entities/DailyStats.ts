import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * Aggregated daily metrics. The erd tag below places it in the Reporting
 * section's diagram only — it has no detail table in the generated document.
 * @erd Reporting
 */
@Entity()
export class DailyStats {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Timestamp marking the start of the reporting day. */
  @Property({ type: 'datetime' })
  day!: Date;

  /** Total page views for the day. */
  @Property({ type: 'integer' })
  views!: number;
}
