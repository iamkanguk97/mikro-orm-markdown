---
title: Troubleshooting
description: Fixes for the most common discovery and JSDoc problems.
---

## "No entities were discovered"

Your MikroORM config found zero entities. This usually means the entity path doesn't match how the CLI is loading your config:

- If you're using a `.ts` config (the CLI loads `tsx` automatically and defaults to `preferTs: true`), make sure `entitiesTs` points to your TypeScript source files.
- If you're using a compiled `.js` config, make sure `entities` points to the **built output** (e.g. `./dist/**/*.entity.js`) and that you've run your build first.
- MikroORM uses `entitiesTs` when running in TypeScript mode and `entities` otherwise — if you use folder/file-based discovery, specify both.

## "Please provide either 'type' or 'entity' attribute"

MikroORM could not resolve a property type during metadata discovery. The CLI loads `.ts` configs through `tsx`, so enabling `emitDecoratorMetadata` alone will not fix this path.

Fix it in one of these ways:

- Add explicit decorator options, such as `@Property({ type: 'string' })` or `@ManyToOne({ entity: () => User })`.
- Install `@mikro-orm/reflection` at the same exact version as `@mikro-orm/core` so the CLI can auto-use `TsMorphMetadataProvider`.

## "Cannot find module '@/...'" (path aliases)

If your config or entities use `tsconfig` path aliases (e.g. `@/entities/user`), `tsx` may fail to resolve them when it cannot find the right `tsconfig.json`. Keeping the config file at your project root (next to `tsconfig.json`) avoids this. If your config lives elsewhere, pass the right file explicitly:

```bash
mikro-orm-markdown --config ./packages/api/mikro-orm.config.ts --tsconfig ./packages/api/tsconfig.json
```

## JSDoc tags are missing, or `@hidden` entities appear

Your entities were probably discovered from compiled JavaScript. Build tools may strip comments from `.js` files, so descriptions, `@namespace`, and `@hidden` cannot be read there.

Prefer a `.ts` config with `entitiesTs` pointing at your source files. If you must run from compiled `.js`, pass the original TypeScript sources:

```bash
mikro-orm-markdown --config ./dist/mikro-orm.config.js --src "src/**/*.entity.ts"
```

See [Compiled JavaScript builds](/mikro-orm-markdown/guides/compiled-js/).

## A constraint appears on an STI class that did not declare it

In Single Table Inheritance every class shares one table, and MikroORM merges the class-level indexes, uniques, and checks of every subclass into one list without recording which class declared them.

- A constraint that names properties (`@Index({ properties: ['breed'] })`) is listed only on the classes that have all of those properties.
- A constraint written as a raw SQL `expression` is listed on the root and on every subclass, because the SQL text is not parsed to find its columns.

To keep a constraint in one subclass's section, declare it with `properties` instead of `expression` where possible. See [Single table inheritance](/mikro-orm-markdown/guides/sti/#constraints).

## A subclass-only property appears on the STI root and on other subclasses

On MikroORM v6 and on v7 before 7.1.5, a property that two or more subclasses each declare under the same name is reported as a root property. It then shows up on the root and on every subclass — column, relation edge, and property-level index or unique.

This comes from MikroORM's metadata and cannot be told apart from a property the root really declares. Upgrading to MikroORM v7.1.5 or later fixes it. See [Single table inheritance](/mikro-orm-markdown/guides/sti/#known-limitation-on-older-mikroorm-versions).

## Config file requirements

The config file must have a **default export** of a plain configuration object — see [CLI Options](/mikro-orm-markdown/reference/cli/#config-file-requirements). If you need to resolve the config asynchronously, use the [programmatic API](/mikro-orm-markdown/reference/api/).
