import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { generateMarkdown } from '../../src/index.js';
import config from '../fixtures/mikro-orm.config.js';

const FIXTURES_GLOB = path.resolve(import.meta.dirname, '../fixtures/entities/*.ts');

describe('generateMarkdown', () => {
  it('returns a non-empty markdown string', async () => {
    const md = await generateMarkdown({
      orm: config,
      title: 'Integration Test',
      src: [FIXTURES_GLOB],
    });
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });

  it('includes the provided title as H1', async () => {
    const md = await generateMarkdown({ orm: config, title: 'My Schema', src: [FIXTURES_GLOB] });
    expect(md.startsWith('# My Schema')).toBe(true);
  });

  it('defaults title to "Database Schema" when not provided', async () => {
    const md = await generateMarkdown({ orm: config });
    expect(md.startsWith('# Database Schema')).toBe(true);
  });

  it('generates valid-looking Mermaid blocks', async () => {
    const md = await generateMarkdown({ orm: config, src: [FIXTURES_GLOB] });
    expect(md).toContain('```mermaid');
    expect(md).toContain('erDiagram');
    expect(md).toContain('```');
  });

  it('without src, all entities fall into "default" section', async () => {
    const md = await generateMarkdown({ orm: config, title: 'No JSDoc' });
    expect(md).toContain('## default');
    expect(md).toContain('### Author');
  });

  it('renders description paragraph below the H1 title', async () => {
    const md = await generateMarkdown({
      orm: config,
      title: 'T',
      description: '주문 도메인 스키마입니다.',
    });
    expect(md).toContain('주문 도메인 스키마입니다.');
    const titleIndex = md.indexOf('# T');
    const descIndex = md.indexOf('주문 도메인 스키마입니다.');
    expect(descIndex).toBeGreaterThan(titleIndex);
  });
});
