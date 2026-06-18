# Examples

A runnable MikroORM schema that exercises **every feature** `mikro-orm-markdown`
can render. The generated output lives in [`ERD.md`](./ERD.md) — open it to see
exactly what the entities in [`entities/`](./entities) turn into.

## Run it yourself

From the repository root:

```bash
npm run example:erd
```

This builds the package and runs the CLI against
[`mikro-orm.config.ts`](./mikro-orm.config.ts), writing [`ERD.md`](./ERD.md).

Or invoke the published CLI directly from inside this folder:

```bash
cd examples
npx mikro-orm-markdown -c mikro-orm.config.ts -o ERD.md -t "Example Schema"
```

> **Why the local [`tsconfig.json`](./tsconfig.json)?** A `.ts` config is loaded
> through `tsx`, which applies the `compilerOptions` of the nearest `tsconfig`
> that _covers_ the entity files. MikroORM entities need
> `experimentalDecorators: true`; if the files fall outside your tsconfig's
> `include`, decorators are compiled in the wrong mode and entity discovery
> fails. See the repository README's Requirements section.

## What each part demonstrates

| Feature                                   | Where to look                                  |
| ----------------------------------------- | ---------------------------------------------- |
| `@namespace` grouping (ERD + table)       | every entity (`Blog`, `Shop`, `Animals`)       |
| `@erd` — diagram only                     | `DailyStats` (Reporting section)               |
| `@describe` — table only                  | `ReportSettings` (Reporting section)           |
| `@hidden` — excluded entirely             | `AuditLog` (absent from `ERD.md`)              |
| `@atLeastOne` on `1:N`                    | `Order.items`                                  |
| `@atLeastOne` on `M:N`                    | `Post.tags`                                    |
| One-to-one (`1:1`)                        | `User.profile` ↔ `Profile.user`                |
| Many-to-one, required vs nullable         | `Post.author` (required), `Comment.author`     |
| Self-referencing relation                 | `Comment.parent`                               |
| One-to-many                               | `User.posts`, `Order.items`                    |
| Many-to-many (pivot hidden)               | `Post.tags` ↔ `Tag.posts`                      |
| `@Embedded` / `@Embeddable` (flattened)   | `Customer.address` → `address_*` (`Address`)   |
| `@Formula` (computed column)              | `Post.bodyLength`, `Customer.nameLength`       |
| Single Table Inheritance                  | `Animal` (root) + `Dog`, `Cat`                 |
| Unique column / index / unique / check    | `Product`, `Customer`, `Order`                 |
| `@Property({ comment })` description      | `Post.status`, `Customer.name`                 |
| JSDoc description (class + property)      | every entity                                   |
| DB vs TS name mismatch (naming strategy)  | `created_at` → `createdAt`, `price_cents` etc. |

## A note on JSDoc prose

Any `@word` inside an entity's JSDoc comment is parsed as a tag, and the
description ends at the first tag. Keep tag names like `@namespace` out of the
descriptive prose (write "the namespace tag", not "the `@namespace` tag"), or
the text after it will be swallowed into a tag.
