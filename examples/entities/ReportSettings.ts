import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * Reporting configuration. The describe tag below documents it as a table in
 * the Reporting section only — it is intentionally left out of the ERD diagram.
 * @describe Reporting
 */
@Entity()
export class ReportSettings {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Email address that receives the daily report. */
  @Property({ type: 'string' })
  recipient!: string;

  /** Whether the daily report is enabled. */
  @Property({ type: 'boolean' })
  enabled: boolean = true;
}
