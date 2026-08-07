import type { EntityMetadata, Options } from '@mikro-orm/core';
import { MetadataError } from '@mikro-orm/core';
import { DEFAULT_TITLE } from './defaults.js';
import { bindJsDocToEntitySources, type JsDocResult, loadJsDoc } from './docs/jsdoc.js';
import { causeChain } from './error-chain.js';
import { emitWarning, StructuredError, type WarnHandler } from './messages.js';
import { type LoadedEntityMetadata, loadEntityMetadata } from './metadata/load.js';
import { isRenderableMeta } from './metadata/renderable.js';
import { buildDocumentModel, type DocumentModel } from './model/build.js';
import { MissingTsMorphSourceError, withTsMorphMetadataProvider } from './provider.js';
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
/** True when the caller provided explicit JSDoc source paths. */
function hasExplicitSrc(src: string[] | undefined): src is string[] {
  return src !== undefined && src.length > 0;
}

export function resolveJsDocSources(sourcePaths: string[], src: string[] | undefined, onWarn?: WarnHandler): string[] {
  if (hasExplicitSrc(src)) {
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

function assertExplicitJsDocSourcesMatched(jsDocResult: JsDocResult, src: string[]): void {
  if (jsDocResult.sourceFileCount === 0) {
    throw new StructuredError({
      title: 'No JSDoc sources matched the explicit src paths',
      detail: `No source files matched the explicit src paths: ${src.join(', ')}.`,
      impact: ['Without matching TypeScript sources, JSDoc tags such as @namespace and @hidden cannot be read.'],
      fix: 'Check the --src glob/path (or the `src` option) so it matches your TypeScript entity sources.',
    });
  }
}

function collectRequiredEmbeddableClassNames(docModel: DocumentModel): Set<string> {
  const classNames = new Set<string>();

  for (const group of docModel.groups) {
    for (const entity of group.textEntities) {
      for (const column of entity.model.columns) {
        if (column.embeddedIn !== undefined && column.embeddedPropName !== undefined) {
          classNames.add(column.embeddedIn);
        }
      }
    }
  }

  return classNames;
}

function assertExplicitEntityJsDocSourceCoverage(
  metas: EntityMetadata[],
  jsDocResult: JsDocResult,
  schemaEntityClassNames: ReadonlySet<string>,
  onWarn?: WarnHandler
): void {
  // Schema-defined entities have no class declaration for --src to cover, so
  // demanding one would fail every valid config that mixes in a schema entity.
  // Their JSDoc gap is already reported by warnSchemaEntityJsDocUnavailable.
  const coverable = metas.filter((meta) => isRenderableMeta(meta) && !schemaEntityClassNames.has(meta.className));

  const missingConcrete = coverable
    .filter((meta) => !meta.abstract)
    .map((meta) => meta.className)
    .filter((className) => !jsDocResult.classNames.has(className));

  if (missingConcrete.length > 0) {
    throw missingSrcCoverageError(
      `Explicit src paths did not include source declarations for discovered entities: ${missingConcrete.join(', ')}.`,
      ['JSDoc tags such as @namespace and @hidden for the missing entities cannot be read.'],
      'Check that --src (or the `src` option) points at all TypeScript entity files.'
    );
  }

  // Abstract STI parents appear in the diagram but are often defined in a separate
  // base-class file that --src may not cover. Warn rather than error so the user
  // knows @hidden/@namespace won't apply to them.
  const missingAbstract = coverable
    .filter((meta) => meta.abstract)
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

function assertExplicitEmbeddableJsDocSourceCoverage(jsDocResult: JsDocResult, docModel: DocumentModel): void {
  const missingEmbeddables = [...collectRequiredEmbeddableClassNames(docModel)].filter(
    (className) => !jsDocResult.classNames.has(className)
  );

  if (missingEmbeddables.length > 0) {
    throw missingSrcCoverageError(
      'Explicit src paths did not include source declarations for document-contributing embeddables: ' +
        `${missingEmbeddables.join(', ')}.`,
      ['Property descriptions for the missing embeddables cannot be read.'],
      'Check that --src (or the `src` option) points at all required TypeScript source files.'
    );
  }
}

/**
 * Both explicit-src coverage failures share one title on purpose: each means
 * "your --src does not cover everything the document needs"; the detail line
 * names what exactly is missing.
 */
function missingSrcCoverageError(detail: string, impact: string[], fix: string): StructuredError {
  return new StructuredError({
    title: 'Entities missing from the explicit src paths',
    detail,
    impact,
    fix,
  });
}

/**
 * Schema-defined entities (EntitySchema, and MikroORM 7's defineEntity() which
 * is built on it) render from metadata, but JSDoc written on the schema
 * declaration itself is not read yet (#106). Warned unconditionally — even
 * when a class-linked schema's class bound its own JSDoc — so a @hidden tag
 * on the declaration can never be dropped silently (#107).
 */
function warnSchemaEntityJsDocUnavailable(loaded: LoadedEntityMetadata, onWarn?: WarnHandler): void {
  const names = [...new Set([...loaded.schemaEntityClassNames, ...loaded.unconfirmedEntityClassNames])].sort();
  if (names.length === 0) {
    return;
  }

  emitWarning(onWarn, {
    title: 'JSDoc unavailable for schema-defined entities',
    detail:
      `JSDoc on EntitySchema declarations cannot be read yet: ${names.join(', ')}. ` +
      "MikroORM 7's defineEntity() creates EntitySchema instances, so entities declared with it are affected too.",
    impact: [
      'Descriptions written on these declarations will be missing.',
      '@namespace and @hidden tags on these declarations are not applied.',
      'Entities marked @hidden may appear in the generated document.',
    ],
    fix: 'JSDoc support for schema-defined entities is tracked at https://github.com/iamkanguk97/mikro-orm-markdown/issues/106.',
  });
}

function hasMissingTsMorphSourceError(err: unknown): boolean {
  return causeChain(err).some((entry) => entry instanceof MissingTsMorphSourceError);
}

/**
 * True when MikroORM's own metadata analysis failed. The TsMorph provider
 * raises `MetadataError` ("Source class for entity X not found") for every
 * EntitySchema-defined entity in a `.ts` source, because there is no class
 * declaration to analyse. Matched by class and by `name` so the check holds
 * across both supported MikroORM majors and across duplicated
 * `@mikro-orm/core` module instances.
 */
function hasMikroOrmMetadataError(err: unknown): boolean {
  return causeChain(err).some(
    (entry) => entry instanceof MetadataError || (entry instanceof Error && entry.name === 'MetadataError')
  );
}

async function loadEntityMetadataWithTsMorphFallback(
  originalOrm: Options,
  effectiveOrm: Options,
  onWarn?: WarnHandler
): Promise<LoadedEntityMetadata> {
  try {
    return await loadEntityMetadata(effectiveOrm);
  } catch (err) {
    const wasAutoInjected = originalOrm.metadataProvider === undefined && effectiveOrm.metadataProvider !== undefined;
    // Retry without the auto-injected provider only when the failure came from
    // TsMorph source analysis: this package's own missing-source sentinel, or
    // MikroORM's MetadataError (see hasMikroOrmMetadataError). Arbitrary
    // errors keep propagating untouched.
    if (!wasAutoInjected || !(hasMissingTsMorphSourceError(err) || hasMikroOrmMetadataError(err))) {
      throw err;
    }

    let loaded: LoadedEntityMetadata;
    try {
      loaded = await loadEntityMetadata(originalOrm);
    } catch {
      // The retry exists only to recover from provider-inflicted failures;
      // when it fails too, the original error is the more accurate diagnosis.
      throw err;
    }

    emitWarning(onWarn, {
      title: 'TypeScript metadata source unavailable',
      detail:
        'The automatically selected TypeScript metadata provider could not analyse the sources for every entity, ' +
        'so generation succeeded by retrying with the original metadata provider.',
      impact: ['Type information will come from runtime decorator metadata instead of TypeScript source analysis.'],
      fix: 'Configure `entitiesTs` to point at the original TypeScript entity sources when source analysis is required.',
    });
    return loaded;
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
  const { orm, title = DEFAULT_TITLE, description, src, onWarn, mermaid } = options;

  const effectiveOrm = await withTsMorphMetadataProvider(orm);
  const loaded = await loadEntityMetadataWithTsMorphFallback(orm, effectiveOrm, onWarn);
  const { metas, sourcePaths, entitySourcePaths } = loaded;
  warnSchemaEntityJsDocUnavailable(loaded, onWarn);
  const schemaEntityClassNames = new Set([...loaded.schemaEntityClassNames, ...loaded.unconfirmedEntityClassNames]);
  const explicitSrc = hasExplicitSrc(src);
  const loadedJsDoc = loadJsDoc(resolveJsDocSources(sourcePaths, src, onWarn), onWarn);
  const jsDocResult = bindJsDocToEntitySources(loadedJsDoc, entitySourcePaths, {
    allowCompiledSourceFallback: explicitSrc,
  });
  if (explicitSrc) {
    assertExplicitJsDocSourcesMatched(jsDocResult, src);
    assertExplicitEntityJsDocSourceCoverage(metas, jsDocResult, schemaEntityClassNames, onWarn);
  }
  const docModel = buildDocumentModel(metas, jsDocResult, title, description, onWarn);
  if (explicitSrc) {
    assertExplicitEmbeddableJsDocSourceCoverage(jsDocResult, docModel);
  }
  return renderMarkdown(docModel, mermaid);
}
