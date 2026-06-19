# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `--tsconfig <path>` CLI option to override the tsconfig used when loading a `.ts` config
- `--src <paths...>` CLI option and `src` programmatic option to read JSDoc from the original `.ts` sources when entities run from compiled JavaScript
- Actual DB table name shown under each entity heading (`*Table: \`name\`*`)
- `@Enum` allowed values listed in the column description (`One of: ...`)
- STI child discriminator value shown in the Extends note
- End-to-end smoke test running the built CLI from the repo root (plus a CI step)

### Fixed

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

### Changed

- Driver-support wording clarified: driver-agnostic, but only SQLite is covered by automated tests

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
