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

## Config file requirements

The config file must have a **default export** of a plain configuration object — see [CLI Options](/mikro-orm-markdown/reference/cli/#config-file-requirements). If you need to resolve the config asynchronously, use the [programmatic API](/mikro-orm-markdown/reference/api/).
