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

interface MermaidErEntity {
  id: string;
  label: string;
  alias: string;
  attributes: Array<{ name: string }>;
}

interface MermaidErRelationship {
  entityA: string;
  entityB: string;
  roleA: string;
}

interface MermaidErDatabase {
  getEntities(): Map<string, MermaidErEntity>;
  getRelationships(): MermaidErRelationship[];
}

export interface MermaidErSnapshot {
  entities: Array<{
    id: string;
    internalName: string;
    displayName: string;
    attributes: string[];
  }>;
  relationships: Array<{
    fromEntityId: string;
    toEntityId: string;
    label: string;
  }>;
}

/** Parses an ER diagram and exposes the official Mermaid parser's normalized database state. */
export async function parseMermaidErSnapshot(source: string): Promise<MermaidErSnapshot> {
  const result = await parseMermaidDiagram(source);
  if (result.diagramType !== 'er') {
    throw new Error(`Expected an ER diagram, received ${result.diagramType}`);
  }

  const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
  const database = diagram.db as unknown as MermaidErDatabase;

  return {
    entities: [...database.getEntities()].map(([internalName, entity]) => ({
      id: entity.id,
      internalName,
      displayName: entity.alias || entity.label,
      attributes: entity.attributes.map((attribute) => attribute.name),
    })),
    relationships: database.getRelationships().map((relationship) => ({
      fromEntityId: relationship.entityA,
      toEntityId: relationship.entityB,
      label: relationship.roleA,
    })),
  };
}
