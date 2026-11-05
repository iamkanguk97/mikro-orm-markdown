---
title: CLI Options
description: Every mikro-orm-markdown command-line option.
---

```bash
mikro-orm-markdown --config ./mikro-orm.config.ts [options]
```

| Option | Default | Description |
| --- | --- | --- |
| `-c, --config <path>` | _(required)_ | Path to MikroORM config file |
| `-o, --out <path>` | `./ERD.md` | Output Markdown file path |
| `-t, --title <string>` | `Database Schema` | H1 heading of the generated document |
| `-d, --description <string>` | — | Optional description paragraph shown below the title |
| `--tsconfig <path>` | — | `tsconfig.json` used when loading a `.ts` config; defaults to the nearest one beside the config file |
| `--src <paths...>` | — | Original TypeScript entity source paths/globs; only needed when MikroORM discovers entities from compiled JavaScript. See [Compiled JavaScript builds](/mikro-orm-markdown/guides/compiled-js/). |
| `--exclude-columns <names...>` | — | DB column names to omit from every entity. See [Excluding columns](/mikro-orm-markdown/guides/exclude-columns/). |
| `--mermaid-layout <layout>` | — | Mermaid layout engine (`dagre` \| `elk` \| `elk.stress`). Omit to use the viewer's default. |
| `--mermaid-theme <theme>` | — | Mermaid theme (`default` \| `neutral` \| `dark` \| `forest` \| `base`). Omit to use the viewer's default. |

:::tip
For a long or multiline description, use the [programmatic API](/mikro-orm-markdown/reference/api/) instead — it accepts any string directly, without shell quoting limits.
:::

## Config file requirements

The config file must have a **default export** of a plain configuration object:

```ts
export default defineConfig({ ... }); // ✅
export const config = defineConfig({ ... }); // ❌ named export not supported
export default async () => defineConfig({ ... }); // ❌ functions/Promises not supported
```

If you need to resolve the config asynchronously, use the [programmatic API](/mikro-orm-markdown/reference/api/).
