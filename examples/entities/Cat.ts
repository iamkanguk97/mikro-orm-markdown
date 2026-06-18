import { Entity, Property } from '@mikro-orm/core';
import { Animal } from './Animal.js';

/**
 * A cat — stored in the Animal table with type = 'cat'.
 * @namespace Animals
 */
@Entity({ discriminatorValue: 'cat' })
export class Cat extends Animal {
  /** Whether the cat is kept indoors. */
  @Property({ type: 'boolean', nullable: true })
  indoor?: boolean;
}
