import type { EntityMetadata } from '@mikro-orm/core';

/**
 * The ancestor class name for a Single Table Inheritance child, or undefined
 * when the entity does not extend another entity.
 *
 * `meta.extends` changed shape between MikroORM majors (verified against
 * @mikro-orm/core release tarballs from npm):
 *
 *  - v6 declares `extends: string` and stores the ancestor's *class name*.
 *  - v7 declares `extends?: EntityName<Entity>` and stores the ancestor
 *    *class itself*, so consumers that expect a string get a constructor.
 *
 * Both are normalized to the class name here so the rest of the pipeline keeps
 * working with strings (see `EntityModel.extendsEntity`).
 *
 * The cast is deliberate: this package type-checks against the v6 typings, where
 * `extends` is declared `string`. Without it, `typeof value === 'function'`
 * narrows to `never` and the v7 branch becomes unreachable to the compiler.
 */
export function resolveExtendsName(meta: EntityMetadata): string | undefined {
  const value = meta.extends as unknown as string | { name?: string } | undefined;

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value === '' ? undefined : value;
  }

  // v7 hands over the ancestor class; anonymous classes have an empty `name`.
  return value.name === undefined || value.name === '' ? undefined : value.name;
}
