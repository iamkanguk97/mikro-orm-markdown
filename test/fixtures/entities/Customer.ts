import { Embedded, Entity, Formula, PrimaryKey, Property } from '@mikro-orm/core';
import { Address } from './Address.js';

/**
 * 고객 엔티티 — @Embedded와 @Formula 데모용입니다.
 * address 컬럼들은 DB에 address_street, address_city, address_zip_code로 저장됩니다.
 * nameLength는 @Formula로 계산되며 DB에 컬럼이 없습니다.
 */
@Entity()
export class Customer {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  @Property({ type: 'string' })
  name!: string;

  @Embedded(() => Address)
  address!: Address;

  /** DB 컬럼 없이 SELECT 시 SQL로 계산되는 값 */
  @Formula('LENGTH(name)', { type: 'integer' })
  nameLength?: number;
}
