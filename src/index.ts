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
}

/**
 * Generates a Mermaid ERD + markdown documentation document from MikroORM
 * entity metadata.
 *
 * JSDoc tags (@namespace, @erd, @describe, @hidden) and descriptions are
 * read directly from each entity's own source file — no separate path needs
 * to be specified.
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
  const { orm, title = 'Database Schema', description } = options;

  const { metas, sourcePaths } = await loadEntityMetadata(orm);
  const jsDocResult = loadJsDoc(sourcePaths);
  const docModel = buildDocumentModel(metas, jsDocResult, title, description);
  return renderMarkdown(docModel);
}
