import type { EntityMetadata, Options } from '@mikro-orm/core';
import { bindJsDocToEntitySources, type JsDocResult, loadJsDoc } from './docs/jsdoc.js';
import { emitWarning, StructuredError, type WarnHandler } from './messages.js';
import { type LoadedEntityMetadata, loadEntityMetadata } from './metadata/load.js';
import { buildDocumentModel } from './model/build.js';
import { withTsMorphMetadataProvider } from './provider.js';
import { renderMarkdown } from './render/markdown.js';
import type { MermaidRenderOptions } from './render/mermaid.js';

export type { StructuredMessage, WarnHandler } from './messages.js';
export { StructuredError } from './messages.js';
export { MetadataLoadError } from './metadata/load.js';
export type { MermaidLayout, MermaidRenderOptions, MermaidTheme } from './render/mermaid.js';

/** Options for the programmatic API. */
export interface GenerateMarkdownOptions {
  /** MikroORM configuration (driver, entities, dbName, …). */
  orm: Options;
  /** Title shown as the H1 heading in the generated document. */
  title?: string;
  /** Optional description paragraph rendered below the H1 heading. */
  description?: string;
  /**
   * Source globs/paths (`.ts`) to read JSDoc from. Use this when your entities
   * run from compiled JavaScript (`entities: ['./dist/**\/*.js']`): build tools
   * strip comments, so descriptions and `@namespace`/`@hidden` tags would
   * otherwise be lost. Defaults to each entity's own discovered source file.
   */
  src?: string[];
  /**
   * Receives non-fatal warnings (e.g. JSDoc cannot be read from compiled JS).
   * The first argument is always a flat, self-contained message. Handlers that
   * declare a second parameter also receive a `StructuredMessage` for long
   * guidance warnings; variadic loggers passed directly (`onWarn: console.warn`)
   * keep receiving just the string.
   */
  onWarn?: WarnHandler;
  /**
   * Optional Mermaid rendering options. When provided, a YAML frontmatter block
   * is prepended to each erDiagram fence. Omit to preserve default viewer behavior.
   */
  mermaid?: MermaidRenderOptions;
}

/** File extensions produced by a TypeScript build, where comments are stripped. */
const COMPILED_JS = /\.(c|m)?js$/i;

/**
 * Decides which files JSDoc should be read from.
 *
 * When the caller provides `src`, those paths win. Otherwise we fall back to the
 * source files MikroORM discovered each entity from — and if those are compiled
 * JavaScript, JSDoc (descriptions, `@namespace`, and crucially `@hidden`) is
 * gone, so we warn the user and point them at `src`.
 */
export function resolveJsDocSources(sourcePaths: string[], src: string[] | undefined, onWarn?: WarnHandler): string[] {
  if (src !== undefined && src.length > 0) {
    return src;
  }

  if (sourcePaths.some((p) => COMPILED_JS.test(p))) {
    emitWarning(onWarn, {
      title: 'JSDoc source unavailable',
      detail:
        'Entities were discovered from compiled JavaScript, so JSDoc comments cannot be read ' +
        '(build tools strip comments).',
      impact: [
        'Descriptions may be missing.',
        '@namespace and @hidden tags will not be applied.',
        'Hidden entities may be exposed in the generated document.',
      ],
      fix:
        'Pass --src "<glob to your .ts sources>" (or the `src` option) to read JSDoc ' +
        'from the original TypeScript files.',
    });
  }

  return sourcePaths;
}

function assertExplicitJsDocSourceCoverage(
  metas: EntityMetadata[],
  jsDocResult: JsDocResult,
  src: string[],
  onWarn?: WarnHandler
): void {
  if (jsDocResult.sourceFileCount === 0) {
    throw new StructuredError({
      title: 'No JSDoc sources matched the explicit src paths',
      detail: `No source files matched the explicit src paths: ${src.join(', ')}.`,
      impact: ['Without matching TypeScript sources, JSDoc tags such as @namespace and @hidden cannot be read.'],
      fix: 'Check the --src glob/path (or the `src` option) so it matches your TypeScript entity sources.',
    });
  }

  const isRenderable = (meta: EntityMetadata): boolean => !meta.pivotTable && !meta.embeddable;

  const missingConcrete = metas
    .filter((meta) => isRenderable(meta) && !meta.abstract)
    .map((meta) => meta.className)
    .filter((className) => !jsDocResult.classNames.has(className));

  if (missingConcrete.length > 0) {
    throw new StructuredError({
      title: 'Entities missing from the explicit src paths',
      detail: `Explicit src paths did not include source declarations for discovered entities: ${missingConcrete.join(', ')}.`,
      impact: ['JSDoc tags such as @namespace and @hidden for the missing entities cannot be read.'],
      fix: 'Check that --src (or the `src` option) points at all TypeScript entity files.',
    });
  }

  // Abstract STI parents appear in the diagram but are often defined in a separate
  // base-class file that --src may not cover. Warn rather than error so the user
  // knows @hidden/@namespace won't apply to them.
  const missingAbstract = metas
    .filter((meta) => isRenderable(meta) && meta.abstract)
    .map((meta) => meta.className)
    .filter((className) => !jsDocResult.classNames.has(className));

  if (missingAbstract.length > 0) {
    emitWarning(onWarn, {
      title: 'Abstract STI parent entities missing from src paths',
      detail: `Abstract STI parent entities were not found in the explicit src paths: ${missingAbstract.join(', ')}.`,
      impact: ['@hidden and @namespace tags for these entities will not be applied.'],
      fix: 'Include their source files in --src to enable JSDoc tags for them.',
    });
  }
}

function errorMessages(err: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    messages.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }

  return messages;
}

function isMissingTsMorphSourceFile(err: unknown): boolean {
  return errorMessages(err).some((message) => message.includes('Source file') && message.includes('not found'));
}

async function loadEntityMetadataWithTsMorphFallback(
  originalOrm: Options,
  effectiveOrm: Options
): Promise<LoadedEntityMetadata> {
  try {
    return await loadEntityMetadata(effectiveOrm);
  } catch (err) {
    const wasAutoInjected = originalOrm.metadataProvider === undefined && effectiveOrm.metadataProvider !== undefined;
    if (!wasAutoInjected || !isMissingTsMorphSourceFile(err)) {
      throw err;
    }

    try {
      return await loadEntityMetadata(originalOrm);
    } catch {
      throw err;
    }
  }
}

/**
 * Generates a Mermaid ERD + markdown documentation document from MikroORM
 * entity metadata.
 *
 * JSDoc tags (@namespace, @erd, @describe, @hidden) and descriptions are
 * read directly from each entity's own source file — no separate path needs
 * to be specified. When entities run from compiled JavaScript (where comments
 * are stripped), pass `src` to read JSDoc from the original `.ts` files.
 *
 * @example
 * ```ts
 * import { generateMarkdown } from 'mikro-orm-markdown';
 * import ormConfig from './mikro-orm.config.js';
 *
 * const markdown = await generateMarkdown({
 *   orm: ormConfig,
 *   title: 'My Database',
 * });
 * ```
 */
export async function generateMarkdown(options: GenerateMarkdownOptions): Promise<string> {
  const { orm, title = 'Database Schema', description, src, onWarn, mermaid } = options;

  const effectiveOrm = await withTsMorphMetadataProvider(orm, onWarn);
  const { metas, sourcePaths, entitySourcePaths } = await loadEntityMetadataWithTsMorphFallback(orm, effectiveOrm);
  const loadedJsDoc = loadJsDoc(resolveJsDocSources(sourcePaths, src, onWarn), onWarn);
  const jsDocResult = bindJsDocToEntitySources(loadedJsDoc, entitySourcePaths, {
    allowCompiledSourceFallback: src !== undefined && src.length > 0,
  });
  if (src !== undefined && src.length > 0) {
    assertExplicitJsDocSourceCoverage(metas, jsDocResult, src, onWarn);
  }
  const docModel = buildDocumentModel(metas, jsDocResult, title, description, onWarn);
  return renderMarkdown(docModel, mermaid);
}
