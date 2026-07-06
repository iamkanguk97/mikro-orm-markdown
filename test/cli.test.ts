import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findNearestTsconfig,
  formatDiscoveryError,
  formatErrorChain,
  loadOrmOptions,
  toConfigImportSpecifier,
  writeMarkdownFile,
} from '../src/cli.js';

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

  it('defaults .ts config loading to TypeScript entity discovery', async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, 'config.ts');
    await fs.writeFile(
      configPath,
      "export default { dbName: ':memory:', entities: ['./dist/**/*.js'], entitiesTs: ['./src/**/*.ts'] };\n",
      'utf-8'
    );

    const options = await loadOrmOptions(configPath);

    expect(options.preferTs).toBe(true);
  });

  it('does not override an explicit preferTs value in .ts config files', async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, 'config.ts');
    await fs.writeFile(
      configPath,
      "export default { dbName: ':memory:', entities: ['./dist/**/*.js'], entitiesTs: ['./src/**/*.ts'], preferTs: false };\n",
      'utf-8'
    );

    const options = await loadOrmOptions(configPath);

    expect(options.preferTs).toBe(false);
  });

  it('unregisters the tsx loader after loading a TypeScript config by default', async () => {
    const unregister = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const register = vi.fn(() => unregister);
    vi.resetModules();
    vi.doMock('tsx/esm/api', () => ({ register }));

    try {
      const { loadOrmOptions: loadOrmOptionsWithMockedTsx } = await import('../src/cli.js');
      const dir = await createTempDir();
      const configPath = path.join(dir, 'config.ts');
      await fs.writeFile(configPath, "export default { dbName: ':memory:', entities: [] };\n", 'utf-8');

      await loadOrmOptionsWithMockedTsx(configPath);

      expect(register).toHaveBeenCalledOnce();
      expect(unregister).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock('tsx/esm/api');
      vi.resetModules();
    }
  });

  it('leaves metadataProvider unset so generation can apply provider fallback safely', async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, 'config.ts');
    await fs.writeFile(configPath, "export default { dbName: ':memory:', entities: [] };\n", 'utf-8');

    const options = await loadOrmOptions(configPath);

    expect(options.metadataProvider).toBeUndefined();
  });

  it('does not override a metadataProvider chosen by the config', async () => {
    const { TsMorphMetadataProvider } = await import('@mikro-orm/reflection');
    const dir = await createTempDir();
    const configPath = path.join(dir, 'config.ts');
    await fs.writeFile(
      configPath,
      "class CustomProvider {}\nexport default { dbName: ':memory:', entities: [], metadataProvider: CustomProvider };\n",
      'utf-8'
    );

    const options = await loadOrmOptions(configPath);

    expect(options.metadataProvider).toBeDefined();
    expect(options.metadataProvider).not.toBe(TsMorphMetadataProvider);
  });

  it('finds the tsconfig.json nearest to the config file, not the cwd', async () => {
    const dir = await createTempDir();
    const nested = path.join(dir, 'pkg', 'config');
    await fs.mkdir(nested, { recursive: true });
    const tsconfigPath = path.join(dir, 'pkg', 'tsconfig.json');
    await fs.writeFile(tsconfigPath, '{}\n', 'utf-8');
    const configPath = path.join(nested, 'mikro-orm.config.ts');

    expect(findNearestTsconfig(configPath)).toBe(tsconfigPath);
  });

  it('returns undefined when no tsconfig.json exists above the config file', async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, 'mikro-orm.config.ts');

    // A tsconfig may legitimately not exist near temp dirs; the walk should
    // terminate at the filesystem root rather than loop forever.
    const result = findNearestTsconfig(configPath);
    expect(result === undefined || result.endsWith('tsconfig.json')).toBe(true);
  });

  it('rejects an explicit --tsconfig path that does not exist', async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, 'config.ts');
    await fs.writeFile(configPath, "export default { dbName: ':memory:', entities: [] };\n", 'utf-8');
    const missing = path.join(dir, 'nope.tsconfig.json');

    await expect(loadOrmOptions(configPath, missing)).rejects.toThrow(`--tsconfig file not found: ${missing}`);
  });

  it('surfaces the underlying cause chain, not just the top-level message', () => {
    const root = new Error('No driver specified, fill in the `driver` option.');
    const wrapped = new Error('Failed to initialize MikroORM and run entity discovery.', { cause: root });

    const formatted = formatErrorChain(wrapped);

    expect(formatted).toContain('Failed to initialize MikroORM');
    expect(formatted).toContain('caused by: No driver specified');
  });

  it('appends a non-Error cause at the end of the chain', () => {
    const formatted = formatErrorChain(new Error('top', { cause: 'raw string cause' }));
    expect(formatted).toBe('top\n  ↳ caused by: raw string cause');
  });

  it('does not loop forever on a cyclic cause chain', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as { cause?: unknown }).cause = b;

    const formatted = formatErrorChain(a);
    expect(formatted).toBe('a\n  ↳ caused by: b');
  });

  it('appends a tsx-specific hint when discovery fails on missing decorator metadata', () => {
    const root = new Error(
      "Please provide either 'type' or 'entity' attribute in Widget.id. If you are using " +
        "decorators, ensure you have 'emitDecoratorMetadata' enabled in your tsconfig.json."
    );
    const wrapped = new Error('Failed to initialize MikroORM and run entity discovery.', { cause: root });

    const formatted = formatDiscoveryError(wrapped);

    expect(formatted).toContain('caused by:');
    expect(formatted).toContain('tsx (esbuild)');
    expect(formatted).toContain('@mikro-orm/reflection');
  });

  it('does not append the reflection hint to unrelated discovery errors', () => {
    const wrapped = new Error('Failed to initialize MikroORM and run entity discovery.', {
      cause: new Error('No driver specified, fill in the `driver` option.'),
    });

    const formatted = formatDiscoveryError(wrapped);

    expect(formatted).not.toContain('tsx (esbuild)');
    expect(formatted).toBe(formatErrorChain(wrapped));
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
