const MARKDOWN_INLINE_SPECIAL_CHARS = /[\\`|*#]/g;
const MERMAID_IDENTIFIER_INVALID_CHARS = /[^a-zA-Z0-9_]/g;

function normalizeInlineText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function splitNormalizedLines(value: string): string[] {
  return value.replace(/\r\n?/g, '\n').split('\n');
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeMarkdownInline(value: string): string {
  return escapeHtmlText(normalizeInlineText(value)).replace(MARKDOWN_INLINE_SPECIAL_CHARS, '\\$&');
}

export function escapeMarkdownTableCell(value: string): string {
  return splitNormalizedLines(value)
    .map((line) => escapeMarkdownInline(line))
    .join('<br>');
}

export function renderMarkdownBlockQuote(value: string): string {
  return splitNormalizedLines(value)
    .map((line) => `> ${escapeMarkdownInline(line)}`)
    .join('\n');
}

export function renderMarkdownInlineCode(value: string): string {
  const normalized = normalizeInlineText(value);
  const backtickRuns = normalized.match(/`+/g) ?? [];
  const longestRun = Math.max(0, ...backtickRuns.map((run) => run.length));
  const fence = '`'.repeat(longestRun + 1);
  const needsPadding = normalized.startsWith('`') || normalized.endsWith('`');
  const content = needsPadding ? ` ${normalized} ` : normalized;
  return `${fence}${content}${fence}`;
}

export function toMermaidIdentifier(value: string): string {
  const normalized = normalizeInlineText(value).replace(MERMAID_IDENTIFIER_INVALID_CHARS, '_').replace(/_+/g, '_');
  const identifier = normalized === '' ? '_' : normalized;
  return /^[a-zA-Z_]/.test(identifier) ? identifier : `_${identifier}`;
}

export function escapeMermaidQuotedText(value: string): string {
  return normalizeInlineText(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Builds a GitHub-style heading anchor slug for in-document links.
 * Lowercases, drops characters other than word chars / spaces / hyphens, then
 * turns spaces into hyphens. Exact for identifier-style headings (e.g. namespace
 * names), which is the only place this is used.
 */
export function toMarkdownAnchor(value: string): string {
  return normalizeInlineText(value)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}
