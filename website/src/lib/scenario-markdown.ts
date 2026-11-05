import { Marked, type Tokens } from 'marked';

// Build-time HTML rendering for one generated scenario document (Examples page).
//
// - Mermaid fences become placeholders that src/scripts/mermaid.ts renders in the browser.
// - Headings get ids and in-document `#anchor` links are rewritten to match, so the
//   document's own "Contents" list works. Ids are prefixed with the scenario id because
//   all scenarios share one page; the slug rule mirrors toMarkdownAnchor() in
//   src/render/escape.ts (GitHub-style, `-1`, `-2` suffixes for repeats).

const HTML_ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function toPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

function toSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

export function renderScenarioMarkdown(scenarioId: string, markdown: string): string {
  const slugCounts = new Map<string, number>();
  const prefixed = (anchor: string): string => `${scenarioId}--${anchor}`;

  const marked = new Marked({
    renderer: {
      code({ text, lang }: Tokens.Code): string | false {
        if (lang !== 'mermaid') {
          return false;
        }
        return `<div class="mermaid-diagram not-content" data-mermaid="${escapeAttribute(text)}"></div>`;
      },
      heading({ tokens, depth }: Tokens.Heading): string {
        const inner = this.parser.parseInline(tokens);
        const slug = toSlug(toPlainText(inner));
        const seen = slugCounts.get(slug) ?? 0;
        slugCounts.set(slug, seen + 1);
        const id = prefixed(seen === 0 ? slug : `${slug}-${seen}`);
        return `<h${depth} id="${escapeAttribute(id)}">${inner}</h${depth}>\n`;
      },
      link({ href, tokens }: Tokens.Link): string | false {
        if (!href.startsWith('#')) {
          return false;
        }
        const inner = this.parser.parseInline(tokens);
        return `<a href="#${escapeAttribute(prefixed(href.slice(1)))}">${inner}</a>`;
      },
    },
  });

  return marked.parse(markdown, { async: false });
}
