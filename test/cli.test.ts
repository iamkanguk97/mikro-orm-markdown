import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadOrmOptions, toConfigImportSpecifier, writeMarkdownFile } from '../src/cli.js';

describe('CLI helpers', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir === undefined) {
      return;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function createTempDir(): Promise<string> {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mikro-orm-markdown-cli-'));
    return tempDir;
  }

  it('converts config paths to file URL import specifiers', () => {
    const specifier = toConfigImportSpecifier(path.join('config directory', 'config with spaces.js'));

    expect(specifier.startsWith('file://')).toBe(true);
    expect(specifier).toContain('config%20directory/config%20with%20spaces.js');
  });

  it('loads config files through a file URL import specifier', async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, 'config.js');
    await fs.writeFile(configPath, "export default { dbName: ':memory:', entities: [] };\n", 'utf-8');

    const options = await loadOrmOptions(configPath);

    expect(options).toMatchObject({ dbName: ':memory:', entities: [] });
  });

  it('creates missing output parent directories before writing markdown', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, 'nested', 'docs', 'ERD.md');

    await writeMarkdownFile(outPath, '# ERD\n');

    await expect(fs.readFile(outPath, 'utf-8')).resolves.toBe('# ERD\n');
  });

  it('adds output path context when writing fails', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, 'existing-directory');
    await fs.mkdir(outPath);

    await expect(writeMarkdownFile(outPath, '# ERD\n')).rejects.toThrow(`Cannot write output file: ${outPath}`);
  });
});
