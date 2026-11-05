---
title: Schema-defined entities
description: JSDoc on EntitySchema and defineEntity() declarations.
---

Entities defined with [`EntitySchema`](https://mikro-orm.io/docs/entity-schema) — or MikroORM 7's `defineEntity()`, which builds on it — read JSDoc from the exported schema declaration. Descriptions and every [JSDoc tag](/mikro-orm-markdown/reference/jsdoc-tags/) work the same way:

```ts
/**
 * Blog post declared without a decorator class.
 * @namespace Blog
 */
export const PostSchema = new EntitySchema({
  name: 'Post',
  properties: {
    id: { primary: true, type: 'integer' },
    /** Post title */
    title: { type: 'string' },
  },
});
```

- **Name-only schemas** (no `class:` link, like the example above) also read property JSDoc from inside the `properties` object literal — MikroORM 7's `properties: (p) => ({...})` builder callback included. In the column table it beats the `comment` property option, which stays the fallback.
- **Class-linked schemas** (`class:`) read property JSDoc from the class. Entity-level JSDoc merges field by field with the class winning conflicts, and `@hidden` applies when either location has it.
- A warning names any schema-defined entity whose declaration could not be read — not found in the scanned sources, ambiguous, or found only in comment-stripped compiled JavaScript — so a `@hidden` written there is never dropped silently.
