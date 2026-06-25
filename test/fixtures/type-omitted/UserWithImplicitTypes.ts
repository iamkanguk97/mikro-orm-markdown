import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

/** Entity fixture whose property type must be read from TypeScript source. */
@Entity()
export class UserWithImplicitTypes {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  @Property()
  name!: string;
}
