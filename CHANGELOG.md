# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.5] - 2026-06-29

### Added

- `--mermaid-layout <layout>` and `--mermaid-theme <theme>` CLI options to inject Mermaid YAML frontmatter into each `erDiagram` fence
- `mermaid` option in the programmatic API (`generateMarkdown({ mermaid: { layout, theme } })`) with the same effect
- `MermaidLayout`, `MermaidTheme`, and `MermaidRenderOptions` types exported from the public API
- When neither option is set, output is identical to previous versions — no frontmatter is emitted

## [0.1.0-alpha.4] - 2026-06-29

### Fixed

- `resolveScalarType` now preserves composite primary-key column alignment through FK-as-PK chains
- `resolveScalarType` now falls back to `integer` after depth 5 instead of leaking an entity class name
- Cross-namespace ERD filtering now treats `@describe` as a home namespace when checking `@erd` guests
- Cross-namespace ERD guest entities with no visible primary-key columns are excluded instead of rendering empty boxes

### Changed

- Markdown tables and Mermaid ERDs now render database-specific scalar types as generic, database-agnostic types

## [0.1.0-alpha.3] - 2026-06-29

### Added

- `--tsconfig <path>` CLI option to override the tsconfig used when loading a `.ts` config
- `--src <paths...>` CLI option and `src` programmatic option to read JSDoc from the original `.ts` sources when entities run from compiled JavaScript
- Actual DB table name shown under each entity heading (`*Table: \`name\`*`)
- `@Enum` allowed values listed in the column description (`One of: ...`)
- STI child discriminator value shown in the Extends note
- End-to-end smoke test running the built CLI from the repo root (plus a CI step)
- Type-omitted properties (e.g. `@Property() name: string`) are now documented: when the config picks no metadata provider and `@mikro-orm/reflection` is installed, both the CLI and the programmatic API auto-use `TsMorphMetadataProvider` to read types from your TypeScript sources
- `.ts` configs default to `preferTs: true`, so MikroORM discovers your `entitiesTs` sources without extra config
- `npm pack` smoke test (`test:pack`) that installs the built tarball into a temporary project
- Metadata discovery smoke tests for SQLite, PostgreSQL, MySQL, and MariaDB drivers

### Fixed

- Auto-applying `TsMorphMetadataProvider` no longer breaks explicit-type runtime/JavaScript entity configs when TypeScript source files are unavailable; generation falls back to MikroORM's default provider if the auto provider cannot find source files and the original config can still discover metadata
- `.ts` config loading no longer depends on the current working directory — the tsconfig beside the config file is resolved and passed to `tsx`
- Discovery failures now surface the underlying cause (missing driver, bad entities glob, …) instead of only a generic message
- Parameterized SQL types (e.g. `varchar(255)`) are preserved in the markdown table instead of being sanitized
- Non-abstract STI roots are classified correctly, no longer leaking subclass columns
- `object: true` / `array: true` embeddeds render as a single JSON column
- Non-string `@Formula` return values no longer crash rendering
- `loadJsDoc` never throws on an unreadable source file
- A warning is emitted when `@atLeastOne` cannot be matched to a relation edge
- FK columns referencing a `@hidden` entity are dropped instead of dangling
- Guarded against missing `prop.type` / `prop.fieldNames` during rendering
- Discovery failures from missing decorator metadata now explain that the CLI's `tsx` loader cannot honor `emitDecoratorMetadata`, pointing at `@mikro-orm/reflection` or explicit `type:`/`entity:` attributes
- Config default exports are validated to be a plain object (primitives and arrays are rejected with a clear message)
- Abstract STI parent entities are no longer flagged as errors when `--src` does not cover their source file; a warning is now emitted instead, explaining that `@hidden`/`@namespace` tags will not apply
- `@mikro-orm/reflection` load failures (e.g. version mismatch) now emit a warning via the `onWarn` callback instead of writing directly to `process.stderr`
- Metadata cache (`temp/`) is now always disabled during doc generation regardless of which `metadataProvider` is in use, so `temp/` is never created

### Changed

- Driver-support wording clarified around metadata-based generation and automated SQL driver smoke coverage
- `@Formula` computed columns now render as nullable
- Index and unique constraint properties in the generated document now show actual DB column names (mapped through NamingStrategy) instead of TypeScript property names
- Metadata cache is always disabled for doc generation runs; a user-supplied `metadataCache: { enabled: true }` in the MikroORM config is intentionally overridden to prevent `temp/` from being created

## [0.1.0-alpha.2] - 2026-06-15

### Fixed

- Metadata discovery no longer opens a database connection
- CLI `--src` option help text was cleaned up

### Changed

- Added tag-based npm release automation and repository contribution templates
- Migrated linting and formatting setup to Biome

## [0.1.0-alpha.1] - 2026-06-11

### Added

- CLI (`mikro-orm-markdown`) with `--config`, `--out`, `--title`, `--src` options
- Programmatic API: `generateMarkdown(options)`
- Mermaid `erDiagram` generation from MikroORM entity metadata
- MikroORM-specific concept visualization:
  - `@Embedded` value object columns (flat columns with type annotation)
  - Single Table Inheritance (STI) with discriminator column and hierarchy arrows
  - `@Formula` computed columns (SQL expression shown in Key column)
  - Actual DB column names derived from NamingStrategy
  - Index and constraint documentation
- JSDoc tag-based namespace grouping (`@namespace`, `@erd`, `@describe`, `@hidden`)
- Per-entity column tables with type, key, and description
- ESM + CJS dual package output
