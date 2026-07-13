import { describe, expect, it } from 'vitest';
import { generateMarkdown } from '../../src/index.js';
import config from '../fixtures/mikro-orm.config.js';
import { parseMermaidDiagram, parseMermaidFences } from './mermaid-parser.js';

describe('official Mermaid parser contract', () => {
  it('parses every generated Mermaid fence as an ER diagram', async () => {
    const markdown = await generateMarkdown({ orm: config, title: 'Parser Contract' });

    const results = await parseMermaidFences(markdown);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.diagramType === 'er')).toBe(true);
  });

  it('parses generated Mermaid fences with supported frontmatter options', async () => {
    const markdown = await generateMarkdown({
      orm: config,
      title: 'Frontmatter Parser Contract',
      mermaid: { layout: 'elk', theme: 'forest' },
    });

    const results = await parseMermaidFences(markdown);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.diagramType === 'er')).toBe(true);
  });

  it('rejects invalid Mermaid syntax', async () => {
    await expect(parseMermaidDiagram('erDiagram\n  USER {')).rejects.toBeDefined();
  });
});
