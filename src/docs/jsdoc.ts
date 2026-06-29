import type { JSDoc } from 'ts-morph';
import { Project } from 'ts-morph';

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

export interface JsDocResult {
  entities: EntityJsDocMap;
  props: PropJsDocMap;
  /** Number of TypeScript source files matched and loaded for JSDoc parsing. */
  sourceFileCount: number;
  /** Class declarations found in the loaded source files, including classes without JSDoc. */
  classNames: Set<string>;
}

/**
 * Parses the given TypeScript source files and extracts JSDoc descriptions
 * and custom tags (@namespace, @erd, @describe, @hidden) from entity classes
 * and their properties.
 *
 * Returns empty maps if no source files are given or no JSDoc is found.
 * Never throws — errors are reported through onWarn so missing docs don't block generation.
 */
export function loadJsDoc(filePaths: string[], onWarn?: (message: string) => void): JsDocResult {
  const entities: EntityJsDocMap = new Map();
  const props: PropJsDocMap = new Map();
  const classNames = new Set<string>();

  if (filePaths.length === 0) {
    return { entities, props, sourceFileCount: 0, classNames };
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
      onWarn?.(`Could not load JSDoc source path "${filePath}": ${formatUnknownError(err)}`);
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
        classNames.add(className);

        const classDocs = cls.getJsDocs();
        if (classDocs.length > 0) {
          entities.set(className, parseEntityJsDoc(classDocs));
        }

        const propMap = new Map<string, PropJsDocInfo>();
        for (const prop of cls.getProperties()) {
          const propDocs = prop.getJsDocs();
          if (propDocs.length === 0) {
            continue;
          }
          const info = parsePropJsDoc(propDocs);
          if (info.description !== undefined || info.atLeastOne) {
            propMap.set(prop.getName(), info);
          }
        }
        if (propMap.size > 0) {
          props.set(className, propMap);
        }
      }
    } catch (err) {
      onWarn?.(`Could not parse JSDoc source file "${sourceFile.getFilePath()}": ${formatUnknownError(err)}`);
    }
  }

  return { entities, props, sourceFileCount: sourceFiles.length, classNames };
}

function formatUnknownError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function hasGlobPattern(filePath: string): boolean {
  return /[*?[\]{}]/.test(filePath);
}

function parseEntityJsDoc(jsDocs: JSDoc[]): EntityJsDocInfo {
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

function parsePropJsDoc(jsDocs: JSDoc[]): PropJsDocInfo {
  let description: string | undefined;
  let atLeastOne = false;

  for (const doc of jsDocs) {
    const desc = doc.getDescription().trim();
    if (desc && description === undefined) {
      description = desc;
    }
    for (const tag of doc.getTags()) {
      if (tag.getTagName() === 'atLeastOne') {
        atLeastOne = true;
      }
    }
  }

  return { ...(description !== undefined && { description }), atLeastOne };
}
