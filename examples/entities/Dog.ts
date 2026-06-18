import { Entity, Property } from '@mikro-orm/core';
import { Animal } from './Animal.js';

/**
 * A dog — stored in the Animal table with type = 'dog'.
 * @namespace Animals
 */
@Entity({ discriminatorValue: 'dog' })
export class Dog extends Animal {
  /** Breed, if known. */
  @Property({ type: 'string', nullable: true })
  breed?: string;
}
