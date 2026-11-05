# Docs website

The documentation site for mikro-orm-markdown, deployed to GitHub Pages at
https://iamkanguk97.github.io/mikro-orm-markdown/. Built with [Astro](https://astro.build) and
[Starlight](https://starlight.astro.build), in English and Korean.

## How it works

- `src/content/docs/` holds the English pages; `src/content/docs/ko/` mirrors them in Korean
  (same file paths). The sidebar is defined in `astro.config.mjs`.
- `scenarios/<id>/` holds a real MikroORM config and entity sources for each Examples scenario;
  the *Full tour* scenario reuses the repository's `examples/` directory.
- `build.mjs` runs the built CLI (`dist/cli.js`) against every scenario and writes the sources +
  generated markdown to `src/data/scenarios/scenarios.json` (gitignored). The Examples page
  (`src/components/ScenarioViewer.astro`) renders that file, so nothing shown there is
  hand-written — it is always what the current code produces.
- Mermaid diagrams render in the browser (`src/scripts/mermaid.ts`) and follow the site's
  light/dark theme.
- The site has its own `package.json` and lockfile, separate from the library's, so its
  dependencies (including its Vite major) never affect the published package or its tests.
- `.github/workflows/pages.yml` builds and deploys the site when run manually
  (Actions → Pages → Run workflow), so merging site changes and publishing them stay separate
  decisions.

## Local development

Requires Node >= 22.23.4 (Astro 7).

```bash
npm run build                  # build the library first (dist/cli.js)
node website/build.mjs         # generate the Examples data
npm ci --prefix website        # install the site's dependencies
npm run dev --prefix website   # dev server, or `npm run build --prefix website` for website/dist
```
