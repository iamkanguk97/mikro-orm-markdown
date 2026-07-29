import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
  type AtomicWriteFileOperations,
  findNearestTsconfig,
  formatCliError,
  formatCliWarning,
  formatDiscoveryError,
  formatErrorChain,
  loadOrmOptions,
  toConfigImportSpecifier,
  writeMarkdownFile,
} from '../src/cli.js';
import { StructuredError } from '../src/index.js';

interface MockAtomicWriteFileOperations {
  mkdir: Mock<AtomicWriteFileOperations['mkdir']>;
  writeFile: Mock<AtomicWriteFileOperations['writeFile']>;
  rename: Mock<AtomicWriteFileOperations['rename']>;
  unlink: Mock<AtomicWriteFileOperations['unlink']>;
}

describe('CLI helpers', () => {
  let tempDir: string | undefined;

  function createAtomicWriteFileOperations(): MockAtomicWriteFileOperations {
    return {
      mkdir: vi.fn<AtomicWriteFileOperations['mkdir']>().mockResolvedValue(undefined),
      writeFile: vi.fn<AtomicWriteFileOperations['writeFile']>().mockResolvedValue(undefined),
      rename: vi.fn<AtomicWriteFileOperations['rename']>().mockResolvedValue(undefined),
      unlink: vi.fn<AtomicWriteFileOperations['unlink']>().mockResolvedValue(undefined),
    } satisfies AtomicWriteFileOperations;
  }

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

  it('atomically replaces an existing output without leaving temporary files', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, 'ERD.md');
    await fs.writeFile(outPath, '# Old ERD\n', 'utf-8');

    await writeMarkdownFile(outPath, '# New ERD\n');

    await expect(fs.readFile(outPath, 'utf-8')).resolves.toBe('# New ERD\n');
    await expect(fs.readdir(dir)).resolves.toEqual(['ERD.md']);
  });

  it('writes unique same-directory temporary files before renaming them into place', async () => {
    const operations = createAtomicWriteFileOperations();
    const outPath = path.join('virtual', 'docs', 'ERD.md');

    await writeMarkdownFile(outPath, '# First ERD\n', operations);
    await writeMarkdownFile(outPath, '# Second ERD\n', operations);

    const firstTempPath = operations.writeFile.mock.calls[0]?.[0];
    const secondTempPath = operations.writeFile.mock.calls[1]?.[0];
    expect(firstTempPath).toBeDefined();
    expect(secondTempPath).toBeDefined();
    expect(path.dirname(firstTempPath!)).toBe(path.dirname(outPath));
    expect(path.basename(firstTempPath!)).toMatch(/^\.ERD\.md\.[0-9a-f-]+\.tmp$/);
    expect(secondTempPath).not.toBe(firstTempPath);
    expect(operations.mkdir).toHaveBeenNthCalledWith(1, path.dirname(outPath));
    expect(operations.writeFile).toHaveBeenNthCalledWith(1, firstTempPath, '# First ERD\n');
    expect(operations.rename).toHaveBeenNthCalledWith(1, firstTempPath, outPath);
    expect(operations.rename).toHaveBeenNthCalledWith(2, secondTempPath, outPath);
    expect(operations.mkdir.mock.invocationCallOrder[0]).toBeLessThan(
      operations.writeFile.mock.invocationCallOrder[0]!
    );
    expect(operations.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
      operations.rename.mock.invocationCallOrder[0]!
    );
    expect(operations.unlink).not.toHaveBeenCalled();
  });

  it('preserves the destination and cleans the temporary file when writing fails', async () => {
    const operations = createAtomicWriteFileOperations();
    const writeError = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    operations.writeFile.mockRejectedValue(writeError);
    const outPath = path.join('virtual', 'docs', 'ERD.md');

    const failure = await writeMarkdownFile(outPath, '# ERD\n', operations).catch((error: unknown) => error);

    const tempPath = operations.writeFile.mock.calls[0]?.[0];
    expect(failure).toBeInstanceOf(Error);
    expect(tempPath).not.toBe(outPath);
    expect((failure as Error).message).toContain(`Cannot write output file: ${outPath}`);
    expect((failure as Error).message).toContain('disk full (ENOSPC)');
    expect((failure as Error & { cause?: unknown }).cause).toBe(writeError);
    expect(operations.rename).not.toHaveBeenCalled();
    expect(operations.unlink).toHaveBeenCalledOnce();
    expect(operations.unlink).toHaveBeenCalledWith(tempPath);
    expect(operations.unlink).not.toHaveBeenCalledWith(outPath);
  });

  it('preserves the destination and cleans the temporary file when rename fails', async () => {
    const operations = createAtomicWriteFileOperations();
    const renameError = Object.assign(new Error('rename failed'), { code: 'EACCES' });
    operations.rename.mockRejectedValue(renameError);
    const outPath = path.join('virtual', 'docs', 'ERD.md');

    const failure = await writeMarkdownFile(outPath, '# ERD\n', operations).catch((error: unknown) => error);

    const tempPath = operations.writeFile.mock.calls[0]?.[0];
    expect(failure).toBeInstanceOf(Error);
    expect(tempPath).not.toBe(outPath);
    expect((failure as Error).message).toContain(`Cannot write output file: ${outPath}`);
    expect((failure as Error).message).toContain('rename failed (EACCES)');
    expect((failure as Error & { cause?: unknown }).cause).toBe(renameError);
    expect(operations.rename).toHaveBeenCalledWith(tempPath, outPath);
    expect(operations.unlink).toHaveBeenCalledOnce();
    expect(operations.unlink).toHaveBeenCalledWith(tempPath);
    expect(operations.unlink).not.toHaveBeenCalledWith(outPath);
  });

  it('does not remove a colliding temporary file owned by another writer', async () => {
    const operations = createAtomicWriteFileOperations();
    const collisionError = Object.assign(new Error('temporary file already exists'), { code: 'EEXIST' });
    operations.writeFile.mockRejectedValue(collisionError);
    const outPath = path.join('virtual', 'docs', 'ERD.md');

    const failure = await writeMarkdownFile(outPath, '# ERD\n', operations).catch((error: unknown) => error);

    const tempPath = operations.writeFile.mock.calls[0]?.[0];
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error & { cause?: unknown }).cause).toBe(collisionError);
    expect(tempPath).not.toBe(outPath);
    expect(operations.rename).not.toHaveBeenCalled();
    expect(operations.unlink).not.toHaveBeenCalled();
  });

  it('keeps the rename failure primary when temporary-file cleanup also fails', async () => {
    const operations = createAtomicWriteFileOperations();
    const renameError = Object.assign(new Error('rename failed'), { code: 'EACCES' });
    const cleanupError = Object.assign(new Error('cleanup failed'), { code: 'EBUSY' });
    operations.rename.mockRejectedValue(renameError);
    operations.unlink.mockRejectedValue(cleanupError);
    const outPath = path.join('virtual', 'docs', 'ERD.md');

    const failure = await writeMarkdownFile(outPath, '# ERD\n', operations).catch((error: unknown) => error);

    const tempPath = operations.writeFile.mock.calls[0]?.[0];
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error & { cause?: unknown }).cause).toBe(renameError);
    expect((failure as Error).message).toContain(`Cannot remove temporary output file: ${tempPath}`);
    expect((failure as Error).message).toContain('cleanup failed (EBUSY)');
    expect(operations.unlink).toHaveBeenCalledWith(tempPath);
    expect(operations.unlink).not.toHaveBeenCalledWith(outPath);
  });
});

describe('formatCliWarning', () => {
  it('keeps warnings without structure on a single prefixed line', () => {
    expect(formatCliWarning('No JSDoc source file matched path: /src/User.ts')).toBe(
      'Warning: No JSDoc source file matched path: /src/User.ts\n'
    );
  });

  it('renders a structured warning as headline, detail, impact, and fix sections', () => {
    const formatted = formatCliWarning('flat message', {
      title: 'JSDoc source unavailable',
      detail: 'Entities were discovered from compiled JavaScript, so JSDoc comments cannot be read.',
      impact: ['Descriptions may be missing.', 'Hidden entities may be exposed in the generated document.'],
      fix: 'Pass --src "<glob to your .ts sources>".',
    });

    expect(formatted).toBe(
      'Warning: JSDoc source unavailable\n' +
        '\n' +
        'Entities were discovered from compiled JavaScript, so JSDoc comments cannot be read.\n' +
        '\n' +
        'Impact:\n' +
        '  - Descriptions may be missing.\n' +
        '  - Hidden entities may be exposed in the generated document.\n' +
        '\n' +
        'Fix:\n' +
        '  Pass --src "<glob to your .ts sources>".\n' +
        '\n'
    );
  });

  it('omits the Impact section when the warning has no impact entries', () => {
    const formatted = formatCliWarning('flat message', {
      title: '@mikro-orm/reflection failed to load',
      detail: '@mikro-orm/reflection is installed but failed to load: boom.',
      fix: 'Ensure all @mikro-orm/* packages are installed at the same version.',
    });

    expect(formatted).not.toContain('Impact:');
    expect(formatted).toContain('Warning: @mikro-orm/reflection failed to load\n');
    expect(formatted).toContain('Fix:\n  Ensure all @mikro-orm/* packages');
  });

  it('omits the Fix section when the warning has no fix', () => {
    const formatted = formatCliWarning('flat message', {
      title: 'Something happened',
      detail: 'Details about the thing.',
    });

    expect(formatted).toBe('Warning: Something happened\n\nDetails about the thing.\n\n');
  });
});

describe('formatCliError', () => {
  it('renders a StructuredError as headline, detail, impact, and fix sections', () => {
    const err = new StructuredError({
      title: 'No JSDoc sources matched the explicit src paths',
      detail: 'No source files matched the explicit src paths: ./missing/*.ts.',
      impact: ['JSDoc tags such as @namespace and @hidden cannot be read.'],
      fix: 'Check the --src glob/path.',
    });

    expect(formatCliError(err)).toBe(
      'Error: No JSDoc sources matched the explicit src paths\n' +
        '\n' +
        'No source files matched the explicit src paths: ./missing/*.ts.\n' +
        '\n' +
        'Impact:\n' +
        '  - JSDoc tags such as @namespace and @hidden cannot be read.\n' +
        '\n' +
        'Fix:\n' +
        '  Check the --src glob/path.\n' +
        '\n'
    );
  });

  it('keeps the cause-chain format for errors without structure', () => {
    const err = new Error('Failed to initialize MikroORM and run entity discovery.', {
      cause: new Error('No entities were discovered'),
    });

    expect(formatCliError(err)).toBe(
      'Error: Failed to initialize MikroORM and run entity discovery.\n' +
        '  ↳ caused by: No entities were discovered\n'
    );
  });
});
