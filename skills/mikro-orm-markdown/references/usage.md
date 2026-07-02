# Usage Reference

## Install

Install as a dev dependency:

```bash
npm install -D mikro-orm-markdown
pnpm add -D mikro-orm-markdown
yarn add -D mikro-orm-markdown
```

For TypeScript MikroORM config files, install `tsx` if it is not already present:

```bash
npm install -D tsx
pnpm add -D tsx
yarn add -D tsx
```

The target project must also have `@mikro-orm/core` v6 or newer and the matching driver package, such as `@mikro-orm/postgresql`, `@mikro-orm/mysql`, `@mikro-orm/mariadb`, or `@mikro-orm/sqlite`.

## CLI Setup

Add a script to `package.json`:

```json
{
  "scripts": {
    "erd": "mikro-orm-markdown --config ./mikro-orm.config.ts --out ./ERD.md --title 'My Database'"
  }
}
```

Run it with the project's package manager:

```bash
npm run erd
pnpm erd
yarn erd
```

Useful CLI options:

| Option | Purpose |
| --- | --- |
| `--config <path>` | Required MikroORM config path. |
| `--out <path>` | Output Markdown path. Defaults to `./ERD.md`. |
| `--title <text>` | H1 heading. Defaults to `Database Schema`. |
| `--description <text>` | Optional paragraph below the title. |
| `--tsconfig <path>` | Explicit tsconfig for loading `.ts` configs. |
| `--src <paths...>` | Original TypeScript entity sources when discovery uses compiled JavaScript. |
| `--mermaid-layout <layout>` | `dagre`, `elk`, or `elk.stress`. |
| `--mermaid-theme <theme>` | `default`, `neutral`, `dark`, `forest`, or `base`. |

## Config Rules

The CLI expects a default export of a plain MikroORM options object:

```typescript
import { defineConfig } from '@mikro-orm/core';
import { SqliteDriver } from '@mikro-orm/sqlite';

export default defineConfig({
  entitiesTs: ['./src/**/*.entity.ts'],
  dbName: 'app',
  driver: SqliteDriver,
});
```

Do not use a named export, a function, or a Promise for the CLI path. Use the programmatic API for asynchronous config creation.

For TypeScript projects, prefer:

- `.ts` config
- `entitiesTs` pointing at source files
- `entities` pointing at built JavaScript only if the project also needs runtime JavaScript discovery

For compiled JavaScript generation, pass original TypeScript sources:

```bash
mikro-orm-markdown --config ./dist/mikro-orm.config.js --src "src/**/*.entity.ts"
```

## JSDoc Tags

Add JSDoc to entity classes and properties to shape the generated document:

| Tag | Scope | Effect |
| --- | --- | --- |
| `@namespace <Name>` | Entity class | Put entity in the named ERD and text section. |
| `@erd <Name>` | Entity class | Put entity in the named ERD section only. |
| `@describe <Name>` | Entity class | Put entity in the named text section only. |
| `@hidden` | Entity class | Exclude entity from all output. |
| `@atLeastOne` | Collection property | Render the collection side as one-or-more instead of zero-or-more. |

Plain class JSDoc becomes the entity description. Plain property JSDoc becomes the column description. If property JSDoc is absent, `@Property({ comment })` is used as a fallback column description.

Example:

```typescript
/**
 * Blog post authored by a registered user.
 * @namespace Blog
 */
@Entity()
export class Post {
  /** Post title */
  @Property({ type: 'string' })
  title!: string;
}
```

## Programmatic API

Use `generateMarkdown` when the config is asynchronous, shell quoting is inconvenient, or the output needs post-processing:

```typescript
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

Options:

| Option | Purpose |
| --- | --- |
| `orm` | Required MikroORM options object. |
| `title` | H1 heading. |
| `description` | Optional paragraph below the title. |
| `src` | Original TypeScript source paths/globs for compiled JavaScript discovery. |
| `onWarn` | Callback for non-fatal warnings. |
| `mermaid` | Optional Mermaid layout/theme config. |

## Output Review Checklist

Inspect generated Markdown for:

- Expected namespace sections and table of contents.
- At least one Mermaid `erDiagram` block when ERD output is expected.
- Correct DB table names in each entity section.
- PK, FK, UK, nullable, discriminator, embedded, formula, index, unique, and check constraint annotations where applicable.
- Correct relation cardinalities, especially nullable singular relations and `@atLeastOne` collection relations.
- No hidden entities accidentally appearing in the output.
