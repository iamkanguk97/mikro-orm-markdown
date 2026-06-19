import type { Options } from '@mikro-orm/core';
import { loadJsDoc } from './docs/jsdoc.js';
import { loadEntityMetadata } from './metadata/load.js';
import { buildDocumentModel } from './model/build.js';
import { renderMarkdown } from './render/markdown.js';

export { MetadataLoadError } from './metadata/load.js';

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
  /** Receives non-fatal warnings (e.g. JSDoc cannot be read from compiled JS). */
  onWarn?: (message: string) => void;
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
export function resolveJsDocSources(
  sourcePaths: string[],
  src: string[] | undefined,
  onWarn?: (message: string) => void
): string[] {
  if (src !== undefined && src.length > 0) {
    return src;
  }

  if (sourcePaths.some((p) => COMPILED_JS.test(p)) && onWarn) {
    onWarn(
      'Entities were discovered from compiled JavaScript, so JSDoc descriptions ' +
        'and @namespace/@hidden tags cannot be read (build tools strip comments). ' +
        'Hidden entities may be exposed. Pass --src "<glob to your .ts sources>" ' +
        '(or the `src` option) to read JSDoc from the original TypeScript files.'
    );
  }

  return sourcePaths;
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
  const { orm, title = 'Database Schema', description, src, onWarn } = options;

  const { metas, sourcePaths } = await loadEntityMetadata(orm);
  const jsDocResult = loadJsDoc(resolveJsDocSources(sourcePaths, src, onWarn));
  const docModel = buildDocumentModel(metas, jsDocResult, title, description);
  return renderMarkdown(docModel);
}
