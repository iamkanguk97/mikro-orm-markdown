const MARKDOWN_INLINE_SPECIAL_CHARS = /[\\`|*#\[\]~]/g;
const MARKDOWN_EMPHASIS_UNDERSCORE = /(?<![a-zA-Z0-9])_|_(?![a-zA-Z0-9])/g;
const MARKDOWN_BULLET_LINE = /^[-+](?:\s|$)/;
const MARKDOWN_HYPHEN_ONLY_LINE = /^-[-\s]*$/;
const MARKDOWN_EQUALS_ONLY_LINE = /^=+$/;
const MARKDOWN_ORDERED_MARKER = /^(\d{1,9})([.)])(?=\s|$)/;
const MERMAID_IDENTIFIER_INVALID_CHARS = /[^a-zA-Z0-9_]/g;
const MERMAID_BARE_ATTRIBUTE_TYPE = /^[a-zA-Z_][a-zA-Z0-9_\-[\]().,]*$/;
const MERMAID_ATTRIBUTE_KEY_PREFIX = /^(?:pk|fk|uk)\b/i;
/**
 * What Mermaid reads specially inside a backtick-quoted type: any of
 * `` # & < > ~ ` % * \ $ ``, an underscore that could open or close Markdown
 * emphasis, and the colon of an icon reference such as `fa:fa-user`.
 */
const MERMAID_BACKTICK_RESERVED = /[#&<>~`%*\\$]|(?<![a-zA-Z0-9])_|_(?![a-zA-Z0-9])|(?<=\bfa[bklrs]?):(?=fa-)/g;
const MERMAID_NAMED_ENTITY_CODES: Record<string, string> = { '&': '#amp;', '<': '#lt;', '>': '#gt;' };

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
  return escapeHtmlText(normalizeInlineText(value))
    .replace(MARKDOWN_INLINE_SPECIAL_CHARS, '\\$&')
    .replace(MARKDOWN_EMPHASIS_UNDERSCORE, '\\_');
}

function escapedLines(value: string): string[] {
  return splitNormalizedLines(value).map((line) => escapeMarkdownInline(line));
}

/**
 * Escapes a line-leading list marker, ordered-list marker, hyphen-only
 * thematic-break/setext line, or equals-only setext line so a description line
 * renders as literal text instead of becoming document structure — a setext
 * heading would also take a heading anchor and capture a later Contents link.
 * Only block-level contexts (paragraphs, blockquotes) need this; table cells
 * are inline-only. Lines arrive trimmed, so `  ===  ` matches as `===`.
 */
function escapeLeadingBlockMarker(line: string): string {
  if (MARKDOWN_BULLET_LINE.test(line) || MARKDOWN_HYPHEN_ONLY_LINE.test(line) || MARKDOWN_EQUALS_ONLY_LINE.test(line)) {
    return `\\${line}`;
  }
  return line.replace(MARKDOWN_ORDERED_MARKER, '$1\\$2');
}

export function escapeMarkdownTableCell(value: string): string {
  return escapedLines(value).join('<br>');
}

/**
 * Escapes a multi-line paragraph for markdown body text, preserving line breaks
 * as hard breaks (two trailing spaces + newline) instead of collapsing them to
 * a single space. Used for the document description, which the programmatic API
 * accepts as free-form multi-line text.
 */
export function escapeMarkdownParagraph(value: string): string {
  return escapedLines(value).map(escapeLeadingBlockMarker).join('  \n');
}

export function renderMarkdownBlockQuote(value: string): string {
  return escapedLines(value)
    .map((line) => `> ${escapeLeadingBlockMarker(line)}`)
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

/**
 * Whether Mermaid would draw part of the text as Markdown emphasis because of
 * underscores, as in `_x_`. An underscore between two letters or digits never
 * does, and a single other underscore has nothing to pair with.
 */
function hasUnderscoreEmphasis(value: string): boolean {
  return (value.match(MARKDOWN_EMPHASIS_UNDERSCORE)?.length ?? 0) >= 2;
}

/**
 * Writes a column type for the attribute type slot of an erDiagram so the
 * diagram shows the type exactly as declared.
 *
 * A type made only of characters the slot accepts is written bare, so
 * `string[]` and `geometry(Point,4326)` stay as they are. Any other type is
 * wrapped in backticks, the slot's quoted form, which carries spaces, quotes
 * and every other character: `bit varying(8)` becomes `` `bit varying(8)` ``.
 * So is a type that starts with the word `pk`, `fk` or `uk` in any case, which
 * Mermaid would read as a key marker, and one whose underscores would be drawn
 * as Markdown emphasis, such as `_x_`.
 *
 * Inside backticks Mermaid still reads some text specially, so it is written
 * as entity codes: `<` and `>` (dropped as an HTML tag), `~` (a pair turns
 * into `<>`), `#` and `&` (they start an entity code), `%` (`%%{…}%%` is taken
 * out as a directive before parsing), `*`, `_`, `\` and `$` (Markdown emphasis,
 * escapes and math), the colon of an icon reference, and the backtick itself
 * (it would close the quote).
 *
 * Mermaid parses bare `[]` from 9.1 and `()` from 9.4, but `,`, `.` and the
 * backtick form only from 11.16.0; an older renderer rejects a diagram that
 * contains one. Showing the declared spelling was chosen over supporting those
 * renderers.
 */
export function toMermaidAttributeType(value: string): string {
  const normalized = normalizeInlineText(value);
  if (normalized === '') {
    return '_';
  }
  if (
    MERMAID_BARE_ATTRIBUTE_TYPE.test(normalized) &&
    !MERMAID_ATTRIBUTE_KEY_PREFIX.test(normalized) &&
    !hasUnderscoreEmphasis(normalized)
  ) {
    return normalized;
  }

  const escaped = normalized.replace(
    MERMAID_BACKTICK_RESERVED,
    (character) => MERMAID_NAMED_ENTITY_CODES[character] ?? `#${character.charCodeAt(0)};`
  );
  return `\`${escaped}\``;
}

export function escapeMermaidQuotedText(value: string): string {
  return normalizeInlineText(value).replace(/#/g, '#35;').replace(/"/g, '#quot;');
}

/**
 * Builds a GitHub-style heading anchor slug for in-document links.
 * Lowercases, drops characters other than letters / numbers / underscores /
 * spaces / hyphens, then turns spaces into hyphens. The letter/number classes
 * are Unicode-aware (\p{L}, \p{N}), so non-ASCII headings such as a Korean
 * namespace name keep their characters and match GitHub's generated anchor.
 */
export function toMarkdownAnchor(value: string): string {
  return normalizeInlineText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}
