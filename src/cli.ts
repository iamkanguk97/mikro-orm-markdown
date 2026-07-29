#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import * as syncFs from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Options } from '@mikro-orm/core';
import { Command, Option } from 'commander';
import { generateMarkdown, StructuredError, type StructuredMessage } from './index.js';
import type { MermaidLayout, MermaidRenderOptions, MermaidTheme } from './render/mermaid.js';
import { MERMAID_LAYOUTS, MERMAID_THEMES } from './render/mermaid.js';

interface CliOptions {
  config: string;
  out: string;
  title: string;
  description?: string;
  tsconfig?: string;
  src?: string[];
  mermaidLayout?: MermaidLayout;
  mermaidTheme?: MermaidTheme;
}

export interface LoadOrmOptionsOptions {
  keepTsxRegistered?: boolean;
}

let activeTsxUnregister: (() => Promise<void>) | undefined;

async function unregisterActiveTsxLoader(): Promise<void> {
  const unregister = activeTsxUnregister;
  activeTsxUnregister = undefined;
  await unregister?.();
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
export async function loadOrmOptions(
  configPath: string,
  tsconfigPath?: string,
  loadOptions: LoadOrmOptionsOptions = {}
): Promise<Options> {
  const isTypeScriptConfig = configPath.endsWith('.ts');
  let unregisterTsx: (() => Promise<void>) | undefined;
  let shouldKeepTsxRegistered = false;

  try {
    if (isTypeScriptConfig) {
      await unregisterActiveTsxLoader();

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

      unregisterTsx = register(tsconfig !== undefined ? { tsconfig } : {});
    }

    const configUrl = toConfigImportSpecifier(configPath);
    let mod: { default?: unknown };
    try {
      mod = (await import(/* @vite-ignore */ configUrl)) as { default?: unknown };
    } catch (cause) {
      if (isTypeScriptConfig) {
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
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      throw new Error(
        'Config file default export must be a configuration object, not a primitive value or array.\n' +
          'Export a plain MikroORM options object instead.'
      );
    }

    const options = config as Options;
    const withPreferTs =
      isTypeScriptConfig && options.preferTs === undefined ? { ...options, preferTs: true } : options;
    shouldKeepTsxRegistered = loadOptions.keepTsxRegistered === true;

    return withPreferTs;
  } finally {
    if (unregisterTsx !== undefined) {
      if (shouldKeepTsxRegistered) {
        activeTsxUnregister = unregisterTsx;
      } else {
        await unregisterTsx();
      }
    }
  }
}

/**
 * Renders an error together with its `cause` chain, one cause per line.
 *
 * Discovery failures wrap the real MikroORM error (missing driver, bad entities
 * glob, …) in `error.cause`. Printing only the top-level message hides the one
 * piece of information that actually tells the user what went wrong, so we walk
 * the chain and surface each underlying message.
 */
export function formatErrorChain(err: unknown): string {
  const lines: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    lines.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }

  // A non-Error cause at the end of the chain still carries information.
  if (current !== undefined && !(current instanceof Error)) {
    lines.push(String(current));
  }

  return lines.map((line, i) => (i === 0 ? line : `  ↳ caused by: ${line}`)).join('\n');
}

const REFLECTION_METADATA_HINT =
  '\n\nNote: this tool loads configs via tsx (esbuild), which does not emit ' +
  "'emitDecoratorMetadata' reflection data, so enabling it will not help here.\n" +
  "Either give each entity property an explicit 'type:'/'entity:' attribute, or " +
  "install '@mikro-orm/reflection' — this tool then reads types from your TypeScript sources automatically.";

/**
 * Formats a discovery error, appending a CLI-specific hint when the failure is
 * MikroORM's reflection-based type resolution.
 *
 * MikroORM's default `ReflectMetadataProvider` infers property types from
 * `emitDecoratorMetadata` reflection and, when it is missing, tells the user to
 * enable that tsconfig option. But the CLI loads `.ts` configs through `tsx`
 * (esbuild), which never emits that metadata — so the advice cannot help. We
 * detect that message in the cause chain and point at the options that do work.
 */
export function formatDiscoveryError(err: unknown): string {
  const chain = formatErrorChain(err);
  return chain.includes('emitDecoratorMetadata') ? chain + REFLECTION_METADATA_HINT : chain;
}

/**
 * Renders a structured message as scannable stderr sections: a prefixed
 * headline, the detail paragraph, an Impact list, and a Fix suggestion,
 * followed by a blank separator line.
 */
function renderStructuredSections(prefix: 'Warning' | 'Error', structured: StructuredMessage): string {
  const lines = [`${prefix}: ${structured.title}`, '', structured.detail];

  if (structured.impact !== undefined && structured.impact.length > 0) {
    lines.push('', 'Impact:');
    for (const item of structured.impact) {
      lines.push(`  - ${item}`);
    }
  }

  if (structured.fix !== undefined) {
    lines.push('', 'Fix:', `  ${structured.fix}`);
  }

  return `${lines.join('\n')}\n\n`;
}

/**
 * Formats a warning for CLI stderr output.
 *
 * Short warnings stay on a single `Warning: <message>` line. Long guidance
 * warnings that carry a `StructuredMessage` are rendered as sections.
 */
export function formatCliWarning(message: string, warning?: StructuredMessage): string {
  if (warning === undefined) {
    return `Warning: ${message}\n`;
  }

  return renderStructuredSections('Warning', warning);
}

/**
 * Formats a generation error for CLI stderr output.
 *
 * `StructuredError`s (guidance errors raised by this package) are rendered as
 * sections; anything else keeps the `Error: <cause chain>` format.
 */
export function formatCliError(err: unknown): string {
  if (err instanceof StructuredError) {
    return renderStructuredSections('Error', err.structured);
  }

  return `Error: ${formatDiscoveryError(err)}\n`;
}

function formatFileSystemError(cause: unknown): string {
  if (cause instanceof Error) {
    const code = 'code' in cause && typeof cause.code === 'string' ? ` (${cause.code})` : '';
    return `${cause.message}${code}`;
  }

  return String(cause);
}

function hasFileSystemErrorCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}

export interface AtomicWriteFileOperations {
  mkdir(directoryPath: string): Promise<void>;
  writeFile(tempPath: string, markdown: string): Promise<void>;
  rename(tempPath: string, outPath: string): Promise<void>;
  unlink(tempPath: string): Promise<void>;
}

const nodeAtomicWriteFileOperations: AtomicWriteFileOperations = {
  async mkdir(directoryPath: string): Promise<void> {
    await fs.mkdir(directoryPath, { recursive: true });
  },
  async writeFile(tempPath: string, markdown: string): Promise<void> {
    await fs.writeFile(tempPath, markdown, { encoding: 'utf-8', flag: 'wx' });
  },
  async rename(tempPath: string, outPath: string): Promise<void> {
    await fs.rename(tempPath, outPath);
  },
  async unlink(tempPath: string): Promise<void> {
    try {
      await fs.unlink(tempPath);
    } catch (cause) {
      if (!hasFileSystemErrorCode(cause, 'ENOENT')) {
        throw cause;
      }
    }
  },
};

function createOutputWriteError(
  outPath: string,
  tempPath: string,
  cause: unknown,
  cleanupFailure?: { cause: unknown }
): Error {
  let message = `Cannot write output file: ${outPath}\n${formatFileSystemError(cause)}`;

  if (cleanupFailure !== undefined) {
    message += `\nCannot remove temporary output file: ${tempPath}\n${formatFileSystemError(cleanupFailure.cause)}`;
  }

  return new Error(message, { cause });
}

export async function writeMarkdownFile(
  outPath: string,
  markdown: string,
  operations: AtomicWriteFileOperations = nodeAtomicWriteFileOperations
): Promise<void> {
  const directoryPath = path.dirname(outPath);
  const tempPath = path.join(directoryPath, `.${path.basename(outPath)}.${randomUUID()}.tmp`);
  let shouldCleanTemp = false;

  try {
    await operations.mkdir(directoryPath);
    shouldCleanTemp = true;

    try {
      await operations.writeFile(tempPath, markdown);
    } catch (cause) {
      // Exclusive creation means an EEXIST path belongs to another writer.
      // Never remove a temporary file that this invocation did not create.
      if (hasFileSystemErrorCode(cause, 'EEXIST')) {
        shouldCleanTemp = false;
      }
      throw cause;
    }

    await operations.rename(tempPath, outPath);
    shouldCleanTemp = false;
  } catch (cause) {
    let cleanupFailure: { cause: unknown } | undefined;
    if (shouldCleanTemp) {
      try {
        await operations.unlink(tempPath);
      } catch (cleanupCause) {
        cleanupFailure = { cause: cleanupCause };
      }
    }

    throw createOutputWriteError(outPath, tempPath, cause, cleanupFailure);
  }
}

function parseMermaidOptions(opts: CliOptions): MermaidRenderOptions | undefined {
  const { mermaidLayout, mermaidTheme } = opts;

  if (mermaidLayout === undefined && mermaidTheme === undefined) {
    return undefined;
  }

  return {
    ...(mermaidLayout !== undefined && { layout: mermaidLayout }),
    ...(mermaidTheme !== undefined && { theme: mermaidTheme }),
  };
}

async function run(opts: CliOptions): Promise<void> {
  const configPath = path.resolve(opts.config);
  const outPath = path.resolve(opts.out);
  const mermaid = parseMermaidOptions(opts);

  let ormOptions: Options;
  try {
    ormOptions = await loadOrmOptions(configPath, opts.tsconfig, { keepTsxRegistered: true });
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
      ...(opts.src !== undefined && { src: opts.src }),
      ...(mermaid !== undefined && { mermaid }),
      onWarn: (message: string, warning?: StructuredMessage): void =>
        void process.stderr.write(formatCliWarning(message, warning)),
    });
  } catch (err) {
    await unregisterActiveTsxLoader();
    process.stderr.write(formatCliError(err));
    process.exit(1);
  }

  await unregisterActiveTsxLoader();

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
  .option(
    '--src <paths...>',
    'Source .ts file globs to read JSDoc from when entities run from compiled .js (comments are stripped at build time)'
  )
  .addOption(
    new Option(
      '--mermaid-layout <layout>',
      `Mermaid layout engine injected as frontmatter (${MERMAID_LAYOUTS.join('|')})`
    ).choices(MERMAID_LAYOUTS)
  )
  .addOption(
    new Option(
      '--mermaid-theme <theme>',
      `Mermaid theme injected as frontmatter (${MERMAID_THEMES.join('|')})`
    ).choices(MERMAID_THEMES)
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
