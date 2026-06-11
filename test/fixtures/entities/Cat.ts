import { Entity, Property } from '@mikro-orm/core';
import { Animal } from './Animal.js';

/** 고양이 엔티티 — Animal 테이블에 type='cat'으로 저장됩니다. */
@Entity({ discriminatorValue: 'cat' })
export class Cat extends Animal {
  @Property({ type: 'boolean', nullable: true })
  indoor?: boolean;
}
