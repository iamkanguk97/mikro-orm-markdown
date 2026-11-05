---
title: Mermaid rendering options
description: Opt into a Mermaid layout engine or theme for the generated diagrams.
---

By default, mikro-orm-markdown does not emit Mermaid frontmatter config. This preserves each Markdown viewer's default Mermaid rendering behavior.

You can opt into Mermaid rendering options via the CLI:

```bash
mikro-orm-markdown --config ./mikro-orm.config.ts --mermaid-layout elk --mermaid-theme neutral
```

Or via the [programmatic API](/mikro-orm-markdown/reference/api/):

```ts
const markdown = await generateMarkdown({
  orm: ormConfig,
  mermaid: {
    layout: 'elk',
    theme: 'forest',
  },
});
```

When a layout or theme is set, a YAML frontmatter block is prepended to each `erDiagram` fence:

````markdown
```mermaid
---
config:
  layout: elk
  theme: forest
---
erDiagram
  ...
```
````

## Layout values

| Value | Description |
| ----- | ----------- |
| `dagre` | Mermaid's default layered layout. |
| `elk` | Alternative layout engine; can improve line routing on larger or denser ERDs. |
| `elk.stress` | ELK stress layout variant. Support varies by Mermaid version and viewer. |

## Theme values

`default`, `neutral`, `dark`, `forest`, `base`.

:::note
Viewer support for `elk` and theme values varies. If no `--mermaid-layout` or `--mermaid-theme` is provided, no frontmatter is emitted.
:::
