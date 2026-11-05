---
title: Installation & Requirements
description: Install mikro-orm-markdown and check what your project needs.
---

## Install

```bash
npm install -D mikro-orm-markdown
# or
pnpm add -D mikro-orm-markdown
```

## Requirements

- **Node.js >= 22.17**
- **MikroORM 6 or 7** — `@mikro-orm/core` is a peer dependency with the range `>=6.0.0 <8`.
- **A MikroORM config file** — the CLI expects a default export of a plain MikroORM options object.
- **The matching MikroORM driver package** — for example `@mikro-orm/postgresql`, `@mikro-orm/mysql`, `@mikro-orm/mariadb`, or `@mikro-orm/sqlite`. A live database connection is not required, but MikroORM still needs the driver to discover metadata.
- **Decorator or schema-defined entities** — `@Entity()` classes read JSDoc from the class. Entities defined with `EntitySchema` (or MikroORM 7's `defineEntity()`, which builds on it) render identically and read JSDoc from the exported schema declaration — see [Schema-defined entities](/mikro-orm-markdown/guides/schema-entities/).
- **On MikroORM 7, import decorators from `@mikro-orm/decorators`** — v7 moved them out of `@mikro-orm/core` into `@mikro-orm/decorators/legacy` (TypeScript `experimentalDecorators`) and `@mikro-orm/decorators/es` (ES-standard decorators). Both work with this tool; on v6 they stay in `@mikro-orm/core`.
- **Resolvable property types** — each entity property's type must be known during MikroORM discovery. Use explicit decorator options such as `type:` / `entity:`, or install `@mikro-orm/reflection` so the CLI can auto-use `TsMorphMetadataProvider` for TypeScript sources.
- **`tsx` for TypeScript config files** — required when loading a `.ts` MikroORM config through the CLI. A `.js` config needs no extra package, but it must import compiled `.js` entities: the CLI registers `tsx` only for `.ts` configs, so a `.js` config that imports `.ts` entity files fails to load. To work from TypeScript sources, use a `.ts` config.

:::caution
If you install `@mikro-orm/reflection`, keep it at the **same exact version** as `@mikro-orm/core`. MikroORM expects official `@mikro-orm/*` packages to share one version, and mismatches can fail discovery.
:::

## Agent Skill (optional)

Agent users (Claude Code and other Agent Skills-compatible tools) can optionally use the Agent Skill at [`skills/mikro-orm-markdown/`](https://github.com/iamkanguk97/mikro-orm-markdown/tree/main/skills/mikro-orm-markdown) to set up and troubleshoot this tool. It is not part of the npm package.
