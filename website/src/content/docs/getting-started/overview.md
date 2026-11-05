---
title: Overview
description: What mikro-orm-markdown generates and when to use it.
---

**mikro-orm-markdown** is a MikroORM ERD generator. It creates **Mermaid ER diagrams** and **Markdown database schema documentation** from your [MikroORM](https://mikro-orm.io) entities.

Use the CLI or the TypeScript API to document entity columns, relations, indexes, constraints, and JSDoc descriptions — without connecting to a live database.

## Features

- **Mermaid ERD diagrams** generated from MikroORM entity metadata
- **Markdown schema documentation** with per-entity column tables, actual DB column names, keys, nullability, descriptions, indexes, and constraints
- **JSDoc-driven grouping and visibility** via `@namespace`, `@erd`, `@describe`, and `@hidden`
- **No live database connection required** — uses MikroORM metadata discovery from your config
- **Works across common SQL drivers** — covered by smoke tests for SQLite, PostgreSQL, MySQL, and MariaDB

## MikroORM-specific concepts

Beyond what Prisma-based tools can express, `mikro-orm-markdown` also visualizes concepts unique to MikroORM:

- **Embeddable** — a value object stored inside the owning entity's table, either as flattened columns (e.g. `address_street`, `address_city`) or as a JSON column depending on the `@Embedded` options. No separate table is created.
- **Single Table Inheritance (STI)** — subclasses like `Dog` and `Cat` share one `animals` table. A discriminator column (e.g. `type`) distinguishes which subclass each row belongs to. See [Single table inheritance](/mikro-orm-markdown/guides/sti/).
- **@Formula** — a virtual column with no physical DB column. Its value is computed by a SQL expression at SELECT time (e.g. `LENGTH(name)`).

These show up in the generated output as annotations:

| Annotation         | Meaning                                              |
| ------------------ | ---------------------------------------------------- |
| `formula: <expr>`  | Mermaid comment for an `@Formula` computed column    |
| `[EmbeddableType]` | Flat column inlined from an `@Embedded` value object |
| `discriminator`    | STI discriminator column                             |

## Next steps

- [Install it](/mikro-orm-markdown/getting-started/installation/) and check the requirements.
- Follow the [Quick Start](/mikro-orm-markdown/getting-started/quick-start/) to generate your first `ERD.md`.
- Browse the [Examples](/mikro-orm-markdown/examples/) to see real generated output.

> Heavily inspired by [prisma-markdown](https://github.com/samchon/prisma-markdown) by [@samchon](https://github.com/samchon).
