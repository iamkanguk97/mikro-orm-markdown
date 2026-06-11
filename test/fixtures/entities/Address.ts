import { Embeddable, Property } from '@mikro-orm/core';

/**
 * 주소 값 객체 — 실제 DB 테이블 없이 소유 엔티티 테이블에 인라인으로 저장됩니다.
 * MikroORM의 @Embeddable은 Prisma에 없는 개념으로, 이 패키지가 시각화하는 v1 차별점 중 하나입니다.
 */
@Embeddable()
export class Address {
  @Property({ type: 'string' })
  street!: string;

  @Property({ type: 'string' })
  city!: string;

  @Property({ type: 'string', nullable: true })
  zipCode?: string;
}
