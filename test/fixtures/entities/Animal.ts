import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * STI 루트 엔티티 — Dog, Cat이 이 테이블을 공유합니다.
 * discriminatorColumn: 'type'으로 어떤 서브클래스인지 구분합니다.
 * MikroORM의 Single Table Inheritance(단일 테이블 상속)은 Prisma에 없는 개념입니다.
 * @namespace Animals
 */
@Entity({ discriminatorColumn: 'type', abstract: true })
@Index({ name: 'animal_name_idx', properties: ['name'] })
export class Animal {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  @Property({ type: 'string' })
  name!: string;
}
