---
name: mikro-orm-markdown
description: Generate Mermaid ERD diagrams and Markdown schema documentation from MikroORM entities. Use when installing, configuring, running, scripting, or debugging mikro-orm-markdown in a MikroORM TypeScript or JavaScript project, including CLI setup, programmatic API usage, entity discovery issues, JSDoc tags, Mermaid options, and generated ERD validation.
---

# MikroORM Markdown

## Overview

Use this skill to help a project generate database documentation with `mikro-orm-markdown`. The package reads MikroORM entity metadata, extracts JSDoc from entity sources, and renders a Markdown document containing Mermaid ERD diagrams and per-entity column tables.

## First Checks

Before changing files in the target project:

- Inspect `package.json` to identify the package manager and existing scripts.
- Locate the MikroORM config file and confirm it default-exports a plain options object.
- Locate entity source globs/classes and determine whether discovery uses TypeScript sources or compiled JavaScript.
- Confirm the matching MikroORM driver package is present. A live database connection is not required, but metadata discovery still needs the driver.
- Avoid changing entity schema semantics just to improve documentation unless the user explicitly wants entity changes.

## Setup Workflow

1. Install `mikro-orm-markdown` as a dev dependency using the project's package manager.
2. For a `.ts` MikroORM config, ensure `tsx` is installed as a dev dependency. The CLI loads it automatically.
3. If entity decorators omit scalar `type:` or relation `entity:` options, either add explicit decorator options or install `@mikro-orm/reflection` at the same exact version as `@mikro-orm/core`.
4. Add a script such as `erd` that calls `mikro-orm-markdown --config <config> --out <output> --title <title>`.
5. Run the script, inspect the generated Markdown, and fix metadata discovery or JSDoc coverage issues before declaring success.

See [usage details](references/usage.md) for CLI commands, programmatic API examples, JSDoc tags, and Mermaid options.

## Common Decision Points

- Prefer a `.ts` config with `entitiesTs` pointing at original TypeScript entity files. This lets JSDoc descriptions and tags be read without `--src`.
- Use `--src "src/**/*.entity.ts"` only when MikroORM discovers entities from compiled JavaScript and JSDoc would otherwise be missing.
- Use the programmatic API when the config is asynchronous, the description is multiline, or the caller needs to post-process the generated Markdown.
- Use `--mermaid-layout` or `--mermaid-theme` only when the user's Markdown viewer supports those Mermaid options.
- Treat `@atLeastOne` as a documentation hint for collection cardinality. It does not enforce a database constraint.

## Troubleshooting

When generation fails, preserve the original error message and inspect the cause chain. Most issues are one of:

- No entities discovered because `entities`/`entitiesTs` points at the wrong files for the current config mode.
- Missing property type metadata because decorators omit `type:`/`entity:` and `@mikro-orm/reflection` is not installed.
- Missing JSDoc tags because entities were discovered from compiled JavaScript without `--src`.
- Path aliases failing because the wrong `tsconfig.json` was applied.
- Unsupported `EntitySchema` entities. `mikro-orm-markdown` currently supports decorator-based `@Entity()` classes.

See [troubleshooting](references/troubleshooting.md) for error-specific fixes.

## Validation

After setup or changes:

- Run the configured generation command.
- Confirm the output file exists and contains at least one Mermaid `erDiagram` block unless the user's entity set is intentionally hidden from ERD output.
- Inspect the generated entity sections for correct table names, PK/FK/UK markers, nullable columns, constraints, JSDoc descriptions, and namespace grouping.
- If the target project has CI checks for docs or formatting, run the relevant checks before finishing.
