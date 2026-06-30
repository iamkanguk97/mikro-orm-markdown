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

```
src/
  cli.ts            # Commander-based CLI entry point
  index.ts          # Public API: generateMarkdown(), resolveJsDocSources()
  provider.ts       # Auto-injects TsMorphMetadataProvider when needed
  docs/
    jsdoc.ts        # Parses JSDoc tags from .ts entity files via ts-morph
  metadata/
    load.ts         # Initialises MikroORM and extracts EntityMetadata[]
  model/
    types.ts        # Internal model types (EntityModel, ColumnModel, RelationEdge, …)
    build.ts        # Converts EntityMetadata[] + JsDocResult → DocumentModel
  render/
    markdown.ts     # Renders DocumentModel → Markdown string
    mermaid.ts      # Renders DiagramModel → erDiagram fences (+ optional frontmatter)
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

```
test/
  cli.test.ts              # CLI option parsing and validation
  e2e/cli-smoke.test.ts    # End-to-end: spawns the built CLI binary
  integration/generate.test.ts  # generateMarkdown() integration tests
  docs/jsdoc.test.ts       # JSDoc parsing unit tests
  metadata/load.test.ts    # Metadata loading unit tests
  model/build.test.ts      # Model builder unit tests
  render/
    markdown.test.ts       # Markdown renderer unit tests
    mermaid.test.ts        # Mermaid renderer unit tests
  fixtures/                # Fixture entities and MikroORM configs
```

When adding a feature, add tests to the matching file. New rendering behaviour belongs in `render/*.test.ts`; new model-building behaviour in `model/build.test.ts`.

## Generation Pipeline

```
MikroORM config
  └─ loadEntityMetadata()     → EntityMetadata[]  (metadata/load.ts)
  └─ loadJsDoc()              → JsDocResult        (docs/jsdoc.ts)
  └─ buildDocumentModel()     → DocumentModel      (model/build.ts)
  └─ renderMarkdown()         → string             (render/markdown.ts)
         └─ renderMermaid()   → erDiagram fence    (render/mermaid.ts)
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

```
feat: add @atLeastOne tag support for collection relations

Refs: #42
```

## Key Constraints

- **No `src/` changes without tests.** Every behaviour change needs a corresponding test.
- **Biome enforces formatting.** Run `npm run lint:fix` before committing; the pre-commit hook runs lint-staged automatically.
- **Dual build output.** `dist/index.js` (ESM) + `dist/index.cjs` (CJS) + `dist/cli.js`. Always verify with `npm run test:pack` after build changes.
- **Peer dependencies.** `@mikro-orm/core` ≥6 and `tsx` (optional) are peers, not bundled. Do not add them to `dependencies`.
- **Node ≥18.19.0** is the minimum runtime target.
- **`src/` is pure ESM.** Use `.js` extensions on relative imports (TypeScript resolves them to `.ts` at compile time).
