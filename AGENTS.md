# mikro-orm-markdown — Agent Guide

Generates Mermaid ERD diagrams and Markdown documentation from MikroORM entity metadata.
Supports a programmatic API (`generateMarkdown`) and a CLI (`mikro-orm-markdown`).

## Tech Stack

| Layer | Tool |
|---|---|
| Language | TypeScript (ESM, `"type": "module"`) |
| Linter / Formatter | Biome (`biome.jsonc`) |
| Type checker | `tsc` via `tsconfig.json` / `tsconfig.test.json` |
| Test runner | Vitest |
| Bundler | tsup (CJS + ESM dual output → `dist/`) |
| Commit hook | Husky + commitlint |
| AST / JSDoc parsing | ts-morph |

## Source Layout

```text
src/
  cli.ts            # Commander-based CLI entry point
  index.ts          # Public API: generateMarkdown(), resolveJsDocSources()
  defaults.ts       # Defaults shared by the CLI and the programmatic API
  error-chain.ts    # causeChain() / errorMessage() helpers for unknown errors
  messages.ts       # Structured warning/error payloads (StructuredMessage, StructuredError)
  provider.ts       # Auto-injects TsMorphMetadataProvider when needed
  source-path.ts    # Canonicalizes entity source paths (symlinks, parent segments)
  docs/
    jsdoc.ts        # Parses JSDoc tags from .ts entity files via ts-morph
  metadata/
    load.ts         # Initialises MikroORM and extracts EntityMetadata[]
    renderable.ts   # Shared predicate: which entities appear in the document
    extends.ts      # Normalizes meta.extends across MikroORM majors (v6 name / v7 class)
  model/
    types.ts        # Internal model types (EntityModel, ColumnModel, RelationEdge, …)
    diagram.ts      # Converts EntityMetadata[] → DiagramModel (boxes, columns, edges, constraints)
    build.ts        # Merges DiagramModel + JsDocResult → DocumentModel (namespace groups)
  render/
    markdown.ts     # Renders DocumentModel → Markdown string
    mermaid.ts      # Renders DiagramModel → erDiagram fences (+ optional frontmatter)
    column-markers.ts # Column-marker labels shared by both renderers
    escape.ts       # Mermaid / Markdown string escaping helpers
```

## Development Commands

```bash
npm run build          # Production build → dist/
npm run dev            # Watch mode build
npm run lint           # Biome check (no auto-fix)
npm run lint:fix       # Biome check with auto-fix
npm run format:check   # Biome format check only
npm run format         # Biome format with auto-fix
npm run typecheck      # tsc --noEmit
npm run test           # Vitest run (all tests)
npm run test:watch     # Vitest watch
npm run test:coverage  # Vitest + v8 coverage
npm run test:pack      # Smoke-test the npm tarball + CLI binary
npm run example:erd    # Build then generate ERD.md from examples/entities/
```

**Full pre-release check sequence:**

```bash
npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build && npm run test:pack
```

## Test Layout

```text
test/
  cli.test.ts              # CLI option parsing and validation
  error-chain.test.ts      # causeChain()/errorMessage() unit tests
  messages.test.ts         # StructuredMessage / emitWarning unit tests
  provider.test.ts         # TsMorphMetadataProvider auto-injection unit tests
  source-path.test.ts      # Source path canonicalization unit tests
  e2e/cli-smoke.test.ts    # End-to-end: spawns the built CLI binary
  integration/generate.test.ts  # generateMarkdown() integration tests
  docs/jsdoc.test.ts       # JSDoc parsing unit tests
  metadata/
    load.test.ts           # Metadata loading unit tests
    renderable.test.ts     # Renderable-entity predicate unit tests
    extends.test.ts        # meta.extends normalization unit tests
  model/
    diagram.test.ts        # Diagram model builder unit tests
    build.test.ts          # Document model builder unit tests
  render/
    markdown.test.ts       # Markdown renderer unit tests
    mermaid.test.ts        # Mermaid renderer unit tests
    mermaid-parser.ts      # Shared helper: parses fences with the official Mermaid parser
    mermaid-parser.test.ts # Contract tests for generated fences against that parser
  helpers/                 # Shared test helpers (temp dirs, fixture pipeline, factories, paths)
  fixtures/                # Fixture entities and MikroORM configs
```

When adding a feature, add tests to the matching file. New rendering behaviour belongs in `render/*.test.ts`; new diagram-model behaviour in `model/diagram.test.ts`; new document-model behaviour in `model/build.test.ts`. Reuse the shared helpers in `test/helpers/` instead of re-declaring temp dirs, fixture pipelines, or metadata factories.

## Generation Pipeline

```text
MikroORM config
  └─ loadEntityMetadata()       → EntityMetadata[]  (metadata/load.ts)
  └─ loadJsDoc()                → JsDocResult        (docs/jsdoc.ts)
  └─ buildDocumentModel()       → DocumentModel      (model/build.ts)
         └─ buildDiagramModel() → DiagramModel       (model/diagram.ts)
  └─ renderMarkdown()           → string             (render/markdown.ts)
         └─ renderErDiagram()   → erDiagram fence    (render/mermaid.ts)
```

## Supported JSDoc Tags

| Tag | Scope | Effect |
|---|---|---|
| `@namespace <name>` | Entity class | Groups entity in both ERD and text table |
| `@erd <name>` | Entity class | Groups entity in ERD only |
| `@describe <name>` | Entity class | Groups entity in text table only |
| `@hidden` | Entity class | Excludes entity from all output |
| `@atLeastOne` | Collection property | Marks relation as requiring ≥1 elements |

## Commit Conventions

Follows [Conventional Commits](https://www.conventionalcommits.org/).

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`, `revert`, `wip`

- Subject must **not** contain issue/ticket IDs (`#123`, `ECOM-123`).
- Issue references go in the footer: `Refs: #123`

```text
feat: add @atLeastOne tag support for collection relations

Refs: #42
```

## Key Constraints

- **No `src/` changes without tests.** Every behaviour change needs a corresponding test.
- **Biome enforces formatting.** Run `npm run lint:fix` before committing; the pre-commit hook runs lint-staged automatically.
- **Dual build output.** `dist/index.js` (ESM) + `dist/index.cjs` (CJS) + `dist/cli.js`. Always verify with `npm run test:pack` after build changes.
- **Peer dependencies.** `@mikro-orm/core` ≥6 <8 and `tsx` (optional) are peers, not bundled. Do not add them to `dependencies`. Both MikroORM majors are supported for decorator-based entities; `npm run test:pack` installs each one against the packed tarball (v7 is skipped below Node 22.17, which v7's own `engines` requires).
- **v6/v7 metadata differences.** MikroORM changed three metadata shapes in v7, each normalized in exactly one place — do not reintroduce direct reads: `MetadataStorage.getAll()` returns an object on v6 and a `Map` on v7 (iterate the storage instead, `src/metadata/load.ts`); `meta.extends` holds a class name on v6 and the ancestor class on v7 (`resolveExtendsName`, `src/metadata/extends.ts`); `meta.path` is a filesystem path on v6 and a `file://` URL on v7 (`normalizeSourcePath`, `src/source-path.ts`). Schema-defined entities (`EntitySchema`, and v7's `defineEntity()` which builds on it) render from metadata like decorator entities; JSDoc written on schema declarations is not read yet, so generation emits an unconditional structured warning naming them (JSDoc binding is tracked in #106).
- **Node ≥18.19.0** is the minimum runtime target.
- **`src/` is pure ESM.** Use `.js` extensions on relative imports (TypeScript resolves them to `.ts` at compile time).
- **Use `node:` specifiers for Node builtins** (`node:path`, `node:fs`, …) in both `src/` and `test/`.
