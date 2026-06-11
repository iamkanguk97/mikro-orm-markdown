# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-11

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
