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

## EntitySchema entities

`EntitySchema`-defined entities are not currently supported. Use decorator-based `@Entity()` classes for projects that need `mikro-orm-markdown` output.

## Empty or incomplete Mermaid output

Check:

- Entities are not all tagged with `@hidden`.
- Entities meant for diagrams are not only tagged with `@describe`.
- Relation decorators include resolvable target entities.
- Many-to-many pivot tables are intentionally hidden from entity boxes and represented as relation edges.

## Mermaid layout or theme does not work

Viewer support varies. If `elk`, `elk.stress`, or a theme does not render in the target Markdown viewer, remove `--mermaid-layout` and `--mermaid-theme` so the viewer uses its defaults.
