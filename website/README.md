# Showcase website

A small static site (deployed to GitHub Pages) that shows what mikro-orm-markdown generates:
each scenario displays the entity sources next to the document the CLI produced from them,
with the ERD rendered live by Mermaid in the browser.

## How it works

- `scenarios/<id>/` holds a real MikroORM config and entity sources for each focused scenario;
  the *Full tour* scenario reuses the repository's `examples/` directory.
- `build.mjs` runs the built CLI (`dist/cli.js`) against every scenario and bundles the
  sources + generated markdown into `website/dist/` as static JSON. Nothing shown on the
  site is hand-written — it is always what the current code produces.
- `public/` is the static shell (`index.html`, `app.js`, `style.css`). Markdown rendering
  (marked), syntax highlighting (highlight.js), and diagrams (mermaid) load from CDN in the
  visitor's browser, so the site needs no npm dependencies of its own.
- `.github/workflows/pages.yml` builds and deploys the site to GitHub Pages on every push
  to `main`.

## Local development

```bash
npm run build            # build the library first (dist/cli.js)
node website/build.mjs   # generate website/dist
npx http-server website/dist   # or any static file server
```
