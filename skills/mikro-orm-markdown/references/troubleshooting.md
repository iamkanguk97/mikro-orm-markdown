# Troubleshooting Reference

## No entities were discovered

The MikroORM config found zero entities.

Check:

- `.ts` config: `entitiesTs` should point at TypeScript source files.
- Compiled `.js` config: `entities` should point at built JavaScript files and the project must be built first.
- Folder/glob discovery: include both `entitiesTs` and `entities` when the project runs in both TypeScript and JavaScript modes.
- Base directory assumptions: paths are resolved relative to MikroORM's configured `baseDir`.

## Please provide either 'type' or 'entity' attribute

MikroORM could not resolve a property type during metadata discovery.

Fix with one of:

- Add explicit decorator options, such as `@Property({ type: 'string' })` or `@ManyToOne({ entity: () => User })`.
- Install `@mikro-orm/reflection` at the same exact version as `@mikro-orm/core`. `mikro-orm-markdown` can then auto-use `TsMorphMetadataProvider`.

Do not rely on `emitDecoratorMetadata` alone for `.ts` config loading. The CLI loads TypeScript through `tsx`, and that path does not emit reflection metadata.

## Cannot find module '@/...'

The config or entity files likely use TypeScript path aliases and `tsx` did not load the intended `tsconfig.json`.

Fix:

```bash
mikro-orm-markdown --config ./packages/api/mikro-orm.config.ts --tsconfig ./packages/api/tsconfig.json
```

Also confirm the selected `tsconfig.json` includes the entity files and has decorator support enabled.

## JSDoc tags are missing or hidden entities appear

The entities were probably discovered from compiled JavaScript. Build tools may strip comments, so descriptions and custom tags such as `@namespace` and `@hidden` cannot be read from those files.

Prefer a `.ts` config with `entitiesTs` pointing at source files. If generation must use compiled JavaScript, pass the original TypeScript sources:

```bash
mikro-orm-markdown --config ./dist/mikro-orm.config.js --src "src/**/*.entity.ts"
```

If explicit `--src` paths match no files or omit discovered concrete entity classes, generation should fail. Fix the glob rather than ignoring the warning.

## Config default export errors

The CLI requires a default export of a plain options object.

Valid:

```typescript
export default defineConfig({ ... });
```

Invalid:

```typescript
export const config = defineConfig({ ... });
export default async () => defineConfig({ ... });
```

Resolve asynchronous config yourself and call the programmatic API instead.

## Cannot load config: Invalid or unexpected token / Unknown file extension ".ts"

A `.js` config imports `.ts` entity files. The CLI registers `tsx` only for a `.ts` config, so Node.js loads those entity files itself. The message depends on the Node.js version:

- Node.js 22.17 does not load `.ts` files by default, so every `.ts` entity fails with `Unknown file extension ".ts"`.
- Node.js 22.18 and newer strip type annotations, so schema-defined entities written in erasable-only TypeScript (type annotations only, no `enum`, runtime `namespace`, or parameter properties) load. Decorator-based entities fail with `Invalid or unexpected token`.

Fix with one of:

- Use a `.ts` config so the CLI loads it, and the entities it imports, through `tsx`.
- Import the compiled `.js` entities, and pass `--src` with the original TypeScript files so JSDoc can still be read.

## JSDoc unavailable for schema-defined entities

Entities defined with `EntitySchema` (or MikroORM 7's `defineEntity()`) render like decorator entities and read JSDoc from the exported schema declaration. This warning names the schema-defined entities whose declaration could not be read: not found in the scanned sources, ambiguous, or found only in compiled JavaScript where comments were stripped. Their descriptions, `@namespace`, and `@hidden` are not applied, so hidden entities may appear.

Common causes:

- The config lists schema objects directly (`entities: [PostSchema]`). Without path globs there is no source file to scan. Pass `--src` (or the `src` option), or discover the schemas through globs such as `entitiesTs: ['./src/**/*.schema.ts']`.
- Discovery runs from compiled JavaScript. Pass `--src` pointing at the original TypeScript files.
- The schema is not an exported variable. Declare it as `export const PostSchema = new EntitySchema({...})`; a `const` exported with `export default PostSchema` also works. `export default new EntitySchema({...})` and schemas that are never exported cannot be read.

```bash
mikro-orm-markdown --config ./mikro-orm.config.ts --src "src/**/*.schema.ts" "src/**/*.entity.ts"
```

`--src` must cover every source file the document needs, not only the schemas: each decorator-based entity class and each embeddable whose columns appear in the document. Add a glob for embeddables if they live in separate files (for example `"src/**/*.embeddable.ts"`). Once `--src` is given, a missing class stops generation with `Entities missing from the explicit src paths`.

## Empty or incomplete Mermaid output

Check:

- Entities are not all tagged with `@hidden`.
- Entities meant for diagrams are not only tagged with `@describe`.
- Relation decorators include resolvable target entities.
- Many-to-many pivot tables are intentionally hidden from entity boxes and represented as relation edges.

## Mermaid layout or theme does not work

Viewer support varies. If `elk`, `elk.stress`, or a theme does not render in the target Markdown viewer, remove `--mermaid-layout` and `--mermaid-theme` so the viewer uses its defaults.
