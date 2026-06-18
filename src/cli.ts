#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Options } from '@mikro-orm/core';
import { Command } from 'commander';
import { generateMarkdown, MetadataLoadError } from './index.js';

interface CliOptions {
  config: string;
  out: string;
  title: string;
  description?: string;
}

/**
 * Loads the MikroORM Options object from a config file.
 *
 * For `.ts` config files, registers the `tsx` loader at runtime so plain
 * `node` can import TypeScript — the user only needs `tsx` installed,
 * not a special invocation (`node --import tsx ...`).
 */
async function loadOrmOptions(configPath: string): Promise<Options> {
  if (configPath.endsWith('.ts')) {
    try {
      const { register } = await import('tsx/esm/api');
      register();
    } catch {
      throw new Error('TypeScript config files require the "tsx" package.\nInstall it with: npm install -D tsx');
    }
  }

  const mod = (await import(configPath)) as { default?: unknown };

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

  await fs.writeFile(outPath, markdown, 'utf-8');
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

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
