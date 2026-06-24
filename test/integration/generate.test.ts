import { describe, expect, it, vi } from 'vitest';
import { generateMarkdown, resolveJsDocSources } from '../../src/index.js';
import config from '../fixtures/mikro-orm.config.js';

describe('generateMarkdown', () => {
  it('returns a non-empty markdown string', async () => {
    const md = await generateMarkdown({
      orm: config,
      title: 'Integration Test',
    });
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });

  it('includes the provided title as H1', async () => {
    const md = await generateMarkdown({ orm: config, title: 'My Schema' });
    expect(md.startsWith('# My Schema')).toBe(true);
  });

  it('defaults title to "Database Schema" when not provided', async () => {
    const md = await generateMarkdown({ orm: config });
    expect(md.startsWith('# Database Schema')).toBe(true);
  });

  it('generates valid-looking Mermaid blocks', async () => {
    const md = await generateMarkdown({ orm: config });
    expect(md).toContain('```mermaid');
    expect(md).toContain('erDiagram');
    expect(md).toContain('```');
  });

  it('automatically derives JSDoc namespaces from entity source files without extra config', async () => {
    const md = await generateMarkdown({ orm: config, title: 'Auto JSDoc' });
    expect(md).toContain('## Blog');
    expect(md).toContain('### Author');
    expect(md).toContain('> 글 작성자');
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

  it('rejects explicit src paths that match no source files', async () => {
    await expect(
      generateMarkdown({
        orm: config,
        src: ['./test/fixtures/entities/no-match-*.ts'],
      })
    ).rejects.toThrow('No source files matched the explicit src paths');
  });

  it('rejects explicit src paths that omit discovered entity declarations', async () => {
    await expect(
      generateMarkdown({
        orm: config,
        src: ['./test/fixtures/entities/Author.ts'],
      })
    ).rejects.toThrow('Explicit src paths did not include source declarations for discovered entities');
  });
});

describe('resolveJsDocSources', () => {
  it('prefers explicit src paths over discovered source paths', () => {
    const onWarn = vi.fn();
    const result = resolveJsDocSources(['/build/User.js'], ['./src/**/*.ts'], onWarn);
    expect(result).toEqual(['./src/**/*.ts']);
    expect(onWarn).not.toHaveBeenCalled();
  });

  it('warns when entities were discovered from compiled JavaScript and no src is given', () => {
    const onWarn = vi.fn();
    const result = resolveJsDocSources(['/build/User.js', '/build/Post.cjs'], undefined, onWarn);
    expect(result).toEqual(['/build/User.js', '/build/Post.cjs']);
    expect(onWarn).toHaveBeenCalledOnce();
    expect(String(onWarn.mock.calls[0]?.[0])).toContain('--src');
  });

  it('does not warn when discovered sources are TypeScript files', () => {
    const onWarn = vi.fn();
    const result = resolveJsDocSources(['/src/User.ts'], undefined, onWarn);
    expect(result).toEqual(['/src/User.ts']);
    expect(onWarn).not.toHaveBeenCalled();
  });
});
