#!/usr/bin/env node

import * as syncFs from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Options } from '@mikro-orm/core';
import { Command } from 'commander';
import { generateMarkdown, MetadataLoadError } from './index.js';

interface CliOptions {
  config: string;
  out: string;
  title: string;
  description?: string;
  tsconfig?: string;
}

export function toConfigImportSpecifier(configPath: string): string {
  return pathToFileURL(path.resolve(configPath)).href;
}

/**
 * Walks up from the directory of `fromPath` looking for the nearest
 * `tsconfig.json`. Returns its absolute path, or `undefined` if none is found
 * before reaching the filesystem root.
 *
 * This lets `.ts` config loading resolve the tsconfig relative to the config
 * file itself rather than the current working directory, so the CLI behaves
 * the same regardless of where it is invoked from.
 */
export function findNearestTsconfig(fromPath: string): string | undefined {
  let dir = path.dirname(path.resolve(fromPath));

  for (;;) {
    const candidate = path.join(dir, 'tsconfig.json');
    if (syncFs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Loads the MikroORM Options object from a config file.
 *
 * For `.ts` config files, registers the `tsx` loader at runtime so plain
 * `node` can import TypeScript — the user only needs `tsx` installed,
 * not a special invocation (`node --import tsx ...`).
 *
 * The tsconfig handed to `tsx` is resolved relative to the config file (or
 * given explicitly via `tsconfigPath`), not the current working directory.
 * Without this, `tsx` picks up whatever tsconfig sits above the cwd, which may
 * not apply `emitDecoratorMetadata` to the entity files — making discovery
 * fail with a cryptic `Cannot read properties of undefined` error depending on
 * which directory the CLI was launched from.
 */
export async function loadOrmOptions(configPath: string, tsconfigPath?: string): Promise<Options> {
  if (configPath.endsWith('.ts')) {
    let register: typeof import('tsx/esm/api')['register'];
    try {
      ({ register } = await import('tsx/esm/api'));
    } catch {
      throw new Error('TypeScript config files require the "tsx" package.\nInstall it with: npm install -D tsx');
    }

    let tsconfig: string | undefined;
    if (tsconfigPath !== undefined) {
      tsconfig = path.resolve(tsconfigPath);
      if (!syncFs.existsSync(tsconfig)) {
        throw new Error(`--tsconfig file not found: ${tsconfig}`);
      }
    } else {
      tsconfig = findNearestTsconfig(configPath);
    }

    register(tsconfig !== undefined ? { tsconfig } : {});
  }

  const configUrl = toConfigImportSpecifier(configPath);
  let mod: { default?: unknown };
  try {
    mod = (await import(/* @vite-ignore */ configUrl)) as { default?: unknown };
  } catch (cause) {
    if (configPath.endsWith('.ts')) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `Failed to load TypeScript config.\n${detail}\n\n` +
          'If this looks like a decorator/metadata error, the tsconfig applied to your ' +
          'entity files is likely missing "experimentalDecorators" / "emitDecoratorMetadata".\n' +
          'Make sure a tsconfig.json with those options sits next to your config file, ' +
          'or pass one explicitly with --tsconfig <path>.',
        { cause }
      );
    }
    throw cause;
  }

  if (mod.default === undefined) {
    throw new Error('Config file must use a default export, e.g. `export default defineConfig({ ... })`.');
  }

  const config = mod.default;
  if (typeof config === 'function' || config instanceof Promise) {
    throw new Error(
      'Config file default export must be a configuration object, not a function or Promise.\n' +
        'Resolve it first, or use the programmatic API instead (see README).'
    );
  }

  return config as Options;
}

function formatFileSystemError(cause: unknown): string {
  if (cause instanceof Error) {
    const code = 'code' in cause && typeof cause.code === 'string' ? ` (${cause.code})` : '';
    return `${cause.message}${code}`;
  }

  return String(cause);
}

export async function writeMarkdownFile(outPath: string, markdown: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, markdown, 'utf-8');
  } catch (cause) {
    throw new Error(`Cannot write output file: ${outPath}\n${formatFileSystemError(cause)}`, { cause });
  }
}

async function run(opts: CliOptions): Promise<void> {
  const configPath = path.resolve(opts.config);
  const outPath = path.resolve(opts.out);

  let ormOptions: Options;
  try {
    ormOptions = await loadOrmOptions(configPath, opts.tsconfig);
  } catch (err) {
    process.stderr.write(
      `Error: Cannot load config: ${configPath}\n${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }

  let markdown: string;
  try {
    markdown = await generateMarkdown({
      orm: ormOptions,
      title: opts.title,
      ...(opts.description !== undefined && { description: opts.description }),
    });
  } catch (err) {
    const msg = err instanceof MetadataLoadError ? err.message : err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  }

  try {
    await writeMarkdownFile(outPath, markdown);
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  process.stdout.write(`✓ Written to ${path.relative(process.cwd(), outPath)}\n`);
}

const program = new Command()
  .name('mikro-orm-markdown')
  .description('Generate Mermaid ERD + markdown docs from MikroORM entities')
  .requiredOption('-c, --config <path>', 'MikroORM config file path')
  .option('-o, --out <path>', 'Output markdown file path', './ERD.md')
  .option('-t, --title <string>', 'Document title', 'Database Schema')
  .option('-d, --description <string>', 'Optional description paragraph shown below the title')
  .option(
    '--tsconfig <path>',
    'tsconfig.json to use when loading a .ts config (defaults to the nearest one beside the config file)'
  )
  .action(run);

function isDirectCliExecution(): boolean {
  const entryPoint = process.argv[1];

  if (entryPoint === undefined) {
    return false;
  }

  try {
    return syncFs.realpathSync(path.resolve(entryPoint)) === syncFs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectCliExecution()) {
  program.parseAsync(process.argv).catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
