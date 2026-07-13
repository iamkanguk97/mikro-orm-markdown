import mermaid, { type ParseResult } from 'mermaid';

const MERMAID_FENCE_PATTERN = /^```mermaid[\t ]*\r?\n([\s\S]*?)\r?\n```[\t ]*$/gm;

export function extractMermaidDiagramSources(markdown: string): string[] {
  return Array.from(markdown.matchAll(MERMAID_FENCE_PATTERN), (match) => match[1]).filter(
    (source): source is string => source !== undefined
  );
}

export async function parseMermaidDiagram(source: string): Promise<ParseResult> {
  return mermaid.parse(source);
}

export async function parseMermaidFences(markdown: string): Promise<ParseResult[]> {
  const sources = extractMermaidDiagramSources(markdown);
  if (sources.length === 0) {
    throw new Error('Expected at least one Mermaid code fence');
  }

  const results: ParseResult[] = [];
  for (const source of sources) {
    results.push(await parseMermaidDiagram(source));
  }
  return results;
}
