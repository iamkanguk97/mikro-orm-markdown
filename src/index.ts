import type { Options } from '@mikro-orm/core';
import { loadJsDoc } from './docs/jsdoc.js';
import { loadEntityMetadata } from './metadata/load.js';
import { buildDocumentModel } from './model/build.js';
import { renderMarkdown } from './render/markdown.js';

export type { GenerateOptions } from './model/types.js';
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
   * Glob patterns for TypeScript entity source files.
   * Used for JSDoc extraction (@namespace, @hidden, descriptions).
   * Omit to skip JSDoc parsing — all entities go into the "default" section.
   */
  src?: string[];
}

/**
 * Generates a Mermaid ERD + markdown documentation document from MikroORM
 * entity metadata.
 *
 * @example
 * ```ts
 * import { generateMarkdown } from 'mikro-orm-markdown';
 * import ormConfig from './mikro-orm.config.js';
 *
 * const markdown = await generateMarkdown({
 *   orm: ormConfig,
 *   title: 'My Database',
 *   src: ['src/entities/*.ts'],
 * });
 * ```
 */
export async function generateMarkdown(options: GenerateMarkdownOptions): Promise<string> {
  const { orm, title = 'Database Schema', description, src = [] } = options;

  const metas = await loadEntityMetadata(orm);
  const jsDocResult = loadJsDoc(src);
  const docModel = buildDocumentModel(metas, jsDocResult, title, description);
  return renderMarkdown(docModel);
}
