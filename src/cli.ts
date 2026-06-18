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
}

export function toConfigImportSpecifier(configPath: string): string {
  return pathToFileURL(path.resolve(configPath)).href;
}

/**
 * Loads the MikroORM Options object from a config file.
 *
 * For `.ts` config files, registers the `tsx` loader at runtime so plain
 * `node` can import TypeScript — the user only needs `tsx` installed,
 * not a special invocation (`node --import tsx ...`).
 */
export async function loadOrmOptions(configPath: string): Promise<Options> {
  if (configPath.endsWith('.ts')) {
    try {
      const { register } = await import('tsx/esm/api');
      register();
    } catch {
      throw new Error('TypeScript config files require the "tsx" package.\nInstall it with: npm install -D tsx');
    }
  }

  const configUrl = toConfigImportSpecifier(configPath);
  const mod = (await import(/* @vite-ignore */ configUrl)) as { default?: unknown };

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
    ormOptions = await loadOrmOptions(configPath);
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
