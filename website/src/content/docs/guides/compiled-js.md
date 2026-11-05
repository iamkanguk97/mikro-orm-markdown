---
title: Compiled JavaScript builds
description: When and how to use --src with configs that discover compiled .js entities.
---

If your MikroORM config discovers entities from compiled `.js` files, such as `entities: ['./dist/**/*.js']`, entity structure can still be discovered, but JSDoc comments may have been stripped.

That means descriptions and tags such as `@namespace` and `@hidden` cannot be read from those `.js` files.

Use `--src` only in this case:

```bash
mikro-orm-markdown \
  --config ./dist/mikro-orm.config.js \
  --src "src/**/*.entity.ts"
```

If `--src` matches no files or omits discovered entity declarations, generation fails instead of silently producing incomplete documentation.

:::tip
Prefer a `.ts` config with `entitiesTs` pointing at your source files. Then JSDoc is read from the original TypeScript and `--src` is not needed.
:::
