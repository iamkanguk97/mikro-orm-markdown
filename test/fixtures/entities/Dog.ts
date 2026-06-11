import { Entity, Property } from '@mikro-orm/core';
import { Animal } from './Animal.js';

/**
 * 개 엔티티 — Animal 테이블에 type='dog'로 저장됩니다.
 * @namespace Animals
 */
@Entity({ discriminatorValue: 'dog' })
export class Dog extends Animal {
  @Property({ type: 'string', nullable: true })
  breed?: string;
}
