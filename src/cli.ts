#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Options } from '@mikro-orm/core';
import { Command } from 'commander';
import { MetadataLoadError, generateMarkdown } from './index.js';

interface CliOptions {
  config: string;
  out: string;
  title: string;
  description?: string;
  src: string[];
}

async function run(opts: CliOptions): Promise<void> {
  const configPath = path.resolve(opts.config);
  const outPath = path.resolve(opts.out);

  let ormOptions: Options;
  try {
    const mod = (await import(configPath)) as { default?: unknown };
    ormOptions = mod.default ?? mod;
  } catch (err) {
    const hint = configPath.endsWith('.ts')
      ? '\nHint: TypeScript configs require tsx or ts-node:\n  npx tsx ./node_modules/.bin/mikro-orm-markdown ...'
      : '';
    process.stderr.write(
      `Error: Cannot load config: ${configPath}\n${err instanceof Error ? err.message : String(err)}${hint}\n`,
    );
    process.exit(1);
  }

  let markdown: string;
  try {
    markdown = await generateMarkdown({
      orm: ormOptions,
      title: opts.title,
      src: opts.src,
      ...(opts.description !== undefined && { description: opts.description }),
    });
  } catch (err) {
    const msg =
      err instanceof MetadataLoadError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
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
  .option(
    '-s, --src <glob>',
    'Glob pattern for entity source files, repeatable (for JSDoc extraction)',
    (val: string, prev: string[]) => [...prev, val],
    [] as string[],
  )
  .action(run);

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
