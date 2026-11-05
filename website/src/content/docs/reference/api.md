---
title: Programmatic API
description: Generate the document from your own script with generateMarkdown().
---

If you need to integrate ERD generation into a custom build script or process the output programmatically:

```ts
import { writeFile } from 'node:fs/promises';
import { generateMarkdown } from 'mikro-orm-markdown';
import ormConfig from './mikro-orm.config.js';

const markdown = await generateMarkdown({
  orm: ormConfig,
  title: 'My Database',
  description: 'Schema documentation generated from MikroORM metadata.',
});

await writeFile('./ERD.md', markdown, 'utf-8');
```

## Options

| Option | Description |
| ------ | ----------- |
| `orm` | MikroORM options object. Required. |
| `title` | H1 title. Defaults to `Database Schema`. |
| `description` | Optional paragraph below the title. Unlike the CLI flag, this can be any string without shell quoting concerns. |
| `src` | Original TypeScript entity source paths/globs. Only needed when `orm.entities` discovers compiled JavaScript. |
| `onWarn` | Callback for non-fatal warnings, such as compiled JavaScript JSDoc loss. Always receives a plain message string. Handlers that declare a second parameter also receive a structured `{ title, detail, impact, fix }` object for long guidance warnings; variadic loggers passed directly (e.g. `console.warn`) keep receiving just the string. |
| `mermaid` | Optional Mermaid rendering options. See [Mermaid rendering options](/mikro-orm-markdown/guides/mermaid-options/). |
| `excludeColumns` | DB column names to omit from every entity, e.g. `['created_at', 'updated_at']`. See [Excluding columns](/mikro-orm-markdown/guides/exclude-columns/). |

## Asynchronous configs

If your MikroORM config is asynchronous, resolve it yourself and pass the resulting options object:

```ts
const ormConfig = await createOrmConfig();
const markdown = await generateMarkdown({ orm: ormConfig });
```
