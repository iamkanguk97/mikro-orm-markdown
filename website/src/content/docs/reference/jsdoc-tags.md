---
title: JSDoc Tags
description: Control descriptions, sections, and visibility with JSDoc comments.
---

Annotate your entity classes — or exported schema declarations, see [Schema-defined entities](/mikro-orm-markdown/guides/schema-entities/) — to control sections and visibility in the generated document. JSDoc comments are read from TypeScript entity source files.

:::tip[Recommended setup]
Use a `.ts` MikroORM config with `entitiesTs` pointing at your source entities. In this setup, JSDoc is read from the original TypeScript files and `--src` is not needed.
:::

```ts
/**
 * Blog post authored by a registered user.
 * @namespace Blog
 */
@Entity()
export class Post {
  /** Post title */
  @Property()
  title!: string;
}
```

## Descriptions

Plain JSDoc text (no tag) becomes a description: text above a **class** describes the entity, and text above a **property** describes its column.

When a property has no JSDoc, its `@Property({ comment })` value (the DDL column comment) is used as the column description instead. Likewise, when a class has no JSDoc description, its `@Entity({ comment })` value (the DDL table comment, or `comment` on an `EntitySchema`) is used as the entity description.

## Tags

| Tag                 | Description                                         |
| ------------------- | --------------------------------------------------- |
| `@namespace <Name>` | Include entity in section `Name` (ERD + text table) |
| `@erd <Name>`       | Include in section `Name`'s ERD diagram only        |
| `@describe <Name>`  | Include in section `Name`'s text table only         |
| `@hidden`           | Exclude entity from the entire document             |
| `@atLeastOne`       | On a collection property: render that side as one-or-more. See [Relation cardinality](/mikro-orm-markdown/guides/cardinality/). |

Entities with no tag are placed in the `default` section. An entity can carry multiple tags to appear in more than one section.

:::note[NestJS Swagger]
These five tags are custom to `mikro-orm-markdown` — Swagger ignores them, so there is no functional conflict even when entity classes double as DTOs. (With Swagger comment introspection enabled, plain untagged JSDoc descriptions may still appear in your Swagger docs.)
:::
