import type { ClassDeclaration, JSDoc as MorphJsDoc, ParameterDeclaration } from 'ts-morph';
import { Project, ts } from 'ts-morph';
import { errorMessage } from '../error-chain.js';
import { StructuredError, type WarnHandler } from '../messages.js';
import { normalizeSourcePath } from '../source-path.js';

/** JSDoc information extracted from an entity class. */
export interface EntityJsDocInfo {
  /** Class-level description (text before any @tags). */
  description?: string;
  /** Namespaces from @namespace tags — appears in both ERD and text table. */
  namespaces: string[];
  /** Namespaces from @erd tags — appears in ERD only. */
  erdNamespaces: string[];
  /** Namespaces from @describe tags — appears in text table only. */
  describeNamespaces: string[];
  /** True when @hidden tag is present — entity is excluded from all output. */
  hidden: boolean;
}

/** JSDoc information extracted from a single entity property. */
export interface PropJsDocInfo {
  /** Property description text. */
  description?: string;
  /** True when the @atLeastOne tag is present — a collection relation that must hold ≥1 elements. */
  atLeastOne: boolean;
}

/** Keyed by entity class name. */
export type EntityJsDocMap = Map<string, EntityJsDocInfo>;

/** Outer key: entity class name. Inner key: property name. */
export type PropJsDocMap = Map<string, Map<string, PropJsDocInfo>>;

/** JSDoc parsed from one concrete class declaration in one source file. */
export interface JsDocDeclaration {
  className: string;
  sourcePath: string;
  entity?: EntityJsDocInfo;
  props: Map<string, PropJsDocInfo>;
}

export interface JsDocResult {
  entities: EntityJsDocMap;
  props: PropJsDocMap;
  /** Number of TypeScript source files matched and loaded for JSDoc parsing. */
  sourceFileCount: number;
  /** Class declarations found in the loaded source files, including classes without JSDoc. */
  classNames: Set<string>;
}

export interface LoadedJsDocResult extends JsDocResult {
  /** Source-aware declarations retained so same-named classes are not conflated. */
  declarations: JsDocDeclaration[];
}

export interface BindJsDocOptions {
  /** Allow compiled or bundled metadata to bind to one unambiguous TypeScript declaration. */
  allowCompiledSourceFallback?: boolean;
}

const TYPESCRIPT_SOURCE = /\.(c|m)?tsx?$/i;

/**
 * Parses the given TypeScript source files and extracts JSDoc descriptions
 * and custom tags (@namespace, @erd, @describe, @hidden) from entity classes
 * and their properties.
 *
 * Returns empty maps if no source files are given or no JSDoc is found.
 * Never throws — errors are reported through onWarn so missing docs don't block generation.
 */
export function loadJsDoc(filePaths: string[], onWarn?: WarnHandler): LoadedJsDocResult {
  const entities: EntityJsDocMap = new Map();
  const props: PropJsDocMap = new Map();
  const classNames = new Set<string>();
  const declarations: JsDocDeclaration[] = [];
  const declarationKeys = new Set<string>();

  if (filePaths.length === 0) {
    return { entities, props, sourceFileCount: 0, classNames, declarations };
  }

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      experimentalDecorators: true,
      skipLibCheck: true,
    },
  });

  // Add each path independently so one unreadable file or bad glob (EACCES, a
  // directory, etc.) cannot abort the whole run — missing docs must never block
  // generation (the "never throws" contract).
  for (const filePath of filePaths) {
    try {
      const sourceFiles = project.addSourceFilesAtPaths(filePath);
      if (sourceFiles.length === 0 && !hasGlobPattern(filePath)) {
        onWarn?.(`No JSDoc source file matched path: ${filePath}`);
      }
    } catch (err) {
      onWarn?.(`Could not load JSDoc source path "${filePath}": ${errorMessage(err)}`);
    }
  }

  const sourceFiles = project.getSourceFiles();
  for (const sourceFile of sourceFiles) {
    try {
      for (const cls of sourceFile.getClasses()) {
        const className = cls.getName();
        if (!className) {
          continue;
        }
        const sourcePath = normalizeSourcePath(sourceFile.getFilePath());
        const declarationKey = declarationIdentity(sourcePath, className);
        if (declarationKeys.has(declarationKey)) {
          continue;
        }
        declarationKeys.add(declarationKey);
        classNames.add(className);

        const classDocs = cls.getJsDocs();
        const entity = classDocs.length > 0 ? parseEntityJsDoc(classDocs) : undefined;
        if (entity !== undefined) {
          entities.set(className, entity);
        }

        const propMap = collectPropJsDocs(cls);
        if (propMap.size > 0) {
          props.set(className, propMap);
        }

        declarations.push({
          className,
          sourcePath,
          ...(entity !== undefined && { entity }),
          props: propMap,
        });
      }
    } catch (err) {
      onWarn?.(`Could not parse JSDoc source file "${sourceFile.getFilePath()}": ${errorMessage(err)}`);
    }
  }

  return { entities, props, sourceFileCount: sourceFiles.length, classNames, declarations };
}

/** Binds declarations by exact normalized path, with an optional unique fallback for compiled or bundled code. */
export function bindJsDocToEntitySources(
  jsDocResult: LoadedJsDocResult,
  entitySourcePaths: ReadonlyMap<string, string>,
  options: BindJsDocOptions = {}
): JsDocResult {
  const entities: EntityJsDocMap = new Map();
  const props: PropJsDocMap = new Map();
  const classNames = new Set<string>();

  // Index the declarations once instead of scanning them per entity. Their
  // sourcePath is already normalized by loadJsDoc, so only the entity side
  // needs normalizing. First declaration wins on a duplicate identity, and
  // candidate lists keep insertion order — matching the previous find/filter.
  const declarationsByIdentity = new Map<string, JsDocDeclaration>();
  const typeScriptDeclarationsByClassName = new Map<string, JsDocDeclaration[]>();
  for (const declaration of jsDocResult.declarations) {
    const identity = declarationIdentity(declaration.sourcePath, declaration.className);
    if (!declarationsByIdentity.has(identity)) {
      declarationsByIdentity.set(identity, declaration);
    }
    if (TYPESCRIPT_SOURCE.test(declaration.sourcePath)) {
      const candidates = typeScriptDeclarationsByClassName.get(declaration.className);
      if (candidates === undefined) {
        typeScriptDeclarationsByClassName.set(declaration.className, [declaration]);
      } else {
        candidates.push(declaration);
      }
    }
  }

  for (const [className, sourcePath] of entitySourcePaths) {
    const canUseTypeScriptFallback =
      options.allowCompiledSourceFallback === true && !TYPESCRIPT_SOURCE.test(sourcePath);
    const exactDeclaration = declarationsByIdentity.get(
      declarationIdentity(normalizeSourcePath(sourcePath), className)
    );
    const fallbackCandidates = typeScriptDeclarationsByClassName.get(className) ?? [];
    if (exactDeclaration === undefined && canUseTypeScriptFallback && fallbackCandidates.length > 1) {
      const candidatePaths = fallbackCandidates.map((candidate) => candidate.sourcePath).sort();
      throw new StructuredError({
        title: 'Ambiguous JSDoc source declarations',
        detail:
          `Compiled or bundled metadata for ${className} could not be matched unambiguously because multiple ` +
          `TypeScript declarations have that class name: ${candidatePaths.join(', ')}.`,
        impact: [
          'JSDoc tags and descriptions cannot be applied safely because a candidate may be a DTO or unrelated class.',
        ],
        fix: 'Narrow --src (or the `src` option) to the entity source files, or rename same-named non-entity classes.',
      });
    }
    const declaration =
      exactDeclaration ??
      (canUseTypeScriptFallback && fallbackCandidates.length === 1 ? fallbackCandidates[0] : undefined);
    if (declaration === undefined) {
      continue;
    }

    classNames.add(className);
    if (declaration.entity !== undefined) {
      entities.set(className, declaration.entity);
    }
    if (declaration.props.size > 0) {
      props.set(className, declaration.props);
    }
  }

  return { entities, props, sourceFileCount: jsDocResult.sourceFileCount, classNames };
}

function declarationIdentity(sourcePath: string, className: string): string {
  return JSON.stringify([sourcePath, className]);
}

function hasGlobPattern(filePath: string): boolean {
  return /[*?[\]{}]/.test(filePath);
}

function collectPropJsDocs(cls: ClassDeclaration): Map<string, PropJsDocInfo> {
  const propMap = new Map<string, PropJsDocInfo>();

  for (const prop of [...cls.getProperties(), ...cls.getGetAccessors()]) {
    const info = parsePropInfo(fromMorphJsDocs(prop.getJsDocs()));
    addPropInfo(propMap, prop.getName(), info);
  }

  for (const prop of getConstructorParameterProperties(cls)) {
    const info = parsePropInfo(fromCompilerJsDocs(ts.getJSDocCommentsAndTags(prop.compilerNode)));
    addPropInfo(propMap, prop.getName(), info);
  }

  return propMap;
}

function getConstructorParameterProperties(cls: ClassDeclaration): ParameterDeclaration[] {
  return cls
    .getConstructors()
    .flatMap((constructorDeclaration) =>
      constructorDeclaration.getParameters().filter((param) => param.isParameterProperty())
    );
}

function addPropInfo(propMap: Map<string, PropJsDocInfo>, propName: string, info: PropJsDocInfo): void {
  if (info.description !== undefined || info.atLeastOne) {
    propMap.set(propName, info);
  }
}

function parseEntityJsDoc(jsDocs: MorphJsDoc[]): EntityJsDocInfo {
  const namespaces: string[] = [];
  const erdNamespaces: string[] = [];
  const describeNamespaces: string[] = [];
  let hidden = false;
  let description: string | undefined;

  for (const doc of jsDocs) {
    const desc = doc.getDescription().trim();
    if (desc && description === undefined) {
      description = desc;
    }

    for (const tag of doc.getTags()) {
      const tagName = tag.getTagName();
      const comment = tag.getCommentText()?.trim();

      if (tagName === 'namespace' && comment) {
        namespaces.push(comment);
      } else if (tagName === 'erd' && comment) {
        erdNamespaces.push(comment);
      } else if (tagName === 'describe' && comment) {
        describeNamespaces.push(comment);
      } else if (tagName === 'hidden') {
        hidden = true;
      }
    }
  }

  return {
    ...(description !== undefined && { description }),
    namespaces,
    erdNamespaces,
    describeNamespaces,
    hidden,
  };
}

/** One JSDoc block reduced to what property parsing needs, regardless of which API produced it. */
interface JsDocBlock {
  description?: string;
  tagNames: string[];
}

function fromMorphJsDocs(jsDocs: MorphJsDoc[]): JsDocBlock[] {
  return jsDocs.map((doc) => {
    const description = doc.getDescription().trim();
    return {
      ...(description !== '' && { description }),
      tagNames: doc.getTags().map((tag) => tag.getTagName()),
    };
  });
}

/** Constructor parameter properties only surface through the raw compiler API, where a bare tag is its own block. */
function fromCompilerJsDocs(jsDocs: readonly (ts.JSDoc | ts.JSDocTag)[]): JsDocBlock[] {
  return jsDocs.map((doc) => {
    if (ts.isJSDoc(doc)) {
      const description = formatCompilerJsDocComment(doc.comment);
      return {
        ...(description !== undefined && { description }),
        tagNames: (doc.tags ?? []).map((tag) => tag.tagName.getText()),
      };
    }
    return { tagNames: [doc.tagName.getText()] };
  });
}

/** The first non-empty description wins; @atLeastOne in any block marks the property. */
function parsePropInfo(blocks: JsDocBlock[]): PropJsDocInfo {
  let description: string | undefined;
  let atLeastOne = false;

  for (const block of blocks) {
    if (block.description !== undefined && description === undefined) {
      description = block.description;
    }
    if (block.tagNames.includes('atLeastOne')) {
      atLeastOne = true;
    }
  }

  return { ...(description !== undefined && { description }), atLeastOne };
}

function formatCompilerJsDocComment(comment: ts.JSDoc['comment'] | ts.JSDocTag['comment']): string | undefined {
  if (comment === undefined) {
    return undefined;
  }
  const trimmed = ts.getTextOfJSDocComment(comment)?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}
