---
title: Excluding columns
description: Drop repetitive columns such as audit timestamps from every entity.
---

Audit columns inherited from a shared base entity (`created_at`, `updated_at`, …) repeat on every table. List their DB column names to drop them from every ERD box and column table:

```bash
mikro-orm-markdown --config ./mikro-orm.config.ts --exclude-columns created_at updated_at deleted_at
```

Or with the [programmatic API](/mikro-orm-markdown/reference/api/):

```ts
const markdown = await generateMarkdown({
  orm: ormConfig,
  excludeColumns: ['created_at', 'updated_at', 'deleted_at'],
});
```

## How matching works

- Names are matched exactly against the DB column name (as shown in the output), not the TypeScript property name. Flattened embedded columns such as `address_street` can be listed too.
- Excluding a foreign key column also removes its relation edge from the ERD. For a composite foreign key, list all of its columns; listing only some leaves the key untouched and emits a warning.
- An entity that `@erd` places in another namespace's diagram is drawn there with only its primary-key columns. Excluding all of them (for example `--exclude-columns id`) removes that entity, and its relation edges, from the other namespace's diagram; its own section is unaffected apart from the dropped columns.
- Index, unique, and check constraints are always kept, even when they cover an excluded column — they describe the real schema, so `UNIQUE (email, deleted_at)` still renders after `deleted_at` is excluded.
