import type {
  ClassDeclaration,
  ExportedDeclarations,
  JSDoc as MorphJsDoc,
  ObjectLiteralElementLike,
  ObjectLiteralExpression,
  ParameterDeclaration,
  SourceFile,
} from 'ts-morph';
import { Node, Project, ts } from 'ts-morph';
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

/** JSDoc parsed from one exported schema declaration (`new EntitySchema({...})` or `defineEntity({...})`). */
export interface SchemaJsDocDeclaration {
  /** Entity name the declaration defines: the `class:` link's class name, or the `name:` string. */
  entityName: string;
  /** Normalized path of the file the declaration lives in (its home file, not a re-exporting barrel). */
  sourcePath: string;
  /** JSDoc written on the schema variable statement itself. */
  entity?: EntityJsDocInfo;
  /**
   * Property JSDoc read from inside the `properties` object literal. Empty for
   * class-linked schemas — the class is their property documentation site.
   */
  props: Map<string, PropJsDocInfo>;
  /** JSDoc of the `class:`-linked class declaration, resolved through its symbol (imports included). */
  linkedClass?: JsDocDeclaration;
}

export interface LoadedJsDocResult extends JsDocResult {
  /** Source-aware declarations retained so same-named classes are not conflated. */
  declarations: JsDocDeclaration[];
  /** Exported schema declarations; empty unless scanSchemaDeclarations was set. */
  schemaDeclarations: SchemaJsDocDeclaration[];
}

export interface LoadJsDocOptions {
  /**
   * Also scan exported schema declarations. Off by default so decorator-only
   * projects do exactly the same parsing work as before.
   */
  scanSchemaDeclarations?: boolean;
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
export function loadJsDoc(
  filePaths: string[],
  onWarn?: WarnHandler,
  options: LoadJsDocOptions = {}
): LoadedJsDocResult {
  const entities: EntityJsDocMap = new Map();
  const props: PropJsDocMap = new Map();
  const classNames = new Set<string>();
  const declarations: JsDocDeclaration[] = [];
  const declarationKeys = new Set<string>();
  const schemaDeclarations: SchemaJsDocDeclaration[] = [];
  const schemaDeclarationKeys = new Set<string>();

  if (filePaths.length === 0) {
    return { entities, props, sourceFileCount: 0, classNames, declarations, schemaDeclarations };
  }

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      experimentalDecorators: true,
      skipLibCheck: true,
      // Without allowJs, .js sources still surface class declarations but
      // report zero exported declarations — schema scanning needs the exports.
      allowJs: true,
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

      if (options.scanSchemaDeclarations === true) {
        for (const schemaDeclaration of collectSchemaDeclarations(sourceFile)) {
          const schemaKey = declarationIdentity(schemaDeclaration.sourcePath, schemaDeclaration.entityName);
          if (schemaDeclarationKeys.has(schemaKey)) {
            continue;
          }
          schemaDeclarationKeys.add(schemaKey);
          schemaDeclarations.push(schemaDeclaration);
        }
      }
    } catch (err) {
      onWarn?.(`Could not parse JSDoc source file "${sourceFile.getFilePath()}": ${errorMessage(err)}`);
    }
  }

  return { entities, props, sourceFileCount: sourceFiles.length, classNames, declarations, schemaDeclarations };
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

/** Result of layering schema-declaration JSDoc over the class-bound result. */
export interface SchemaJsDocBinding {
  jsDocResult: JsDocResult;
  /**
   * Schema entities whose declaration JSDoc was read with confidence: found in
   * a TypeScript source, or carrying JSDoc even in JavaScript. A compiled-JS
   * declaration without JSDoc stays out — its comments may simply have been
   * stripped by the build, and treating that as "read" could silently drop a
   * @hidden written in the original source (#107).
   */
  jsDocReadEntityNames: Set<string>;
}

/**
 * Binds JSDoc from exported schema declarations to schema-defined entities.
 *
 * Matching: the entity's own source path wins; otherwise a unique name match
 * among the scanned schema declarations. Ambiguity (several same-named schema
 * declarations) binds nothing, so the caller keeps warning for those entities
 * instead of guessing.
 *
 * Merge for class-linked schemas: property JSDoc comes from the class
 * unconditionally; entity-level JSDoc merges field by field with the class
 * winning conflicts; @hidden is OR'd across both locations (#106). Name-only
 * schemas take property JSDoc from inside their `properties` object literal —
 * the only documentation site they have.
 */
export function bindSchemaJsDoc(
  loadedJsDoc: LoadedJsDocResult,
  baseResult: JsDocResult,
  schemaEntitySourcePaths: ReadonlyMap<string, string | undefined>
): SchemaJsDocBinding {
  const entities = new Map(baseResult.entities);
  const props = new Map(baseResult.props);
  const jsDocReadEntityNames = new Set<string>();

  const byIdentity = new Map<string, SchemaJsDocDeclaration>();
  const byName = new Map<string, SchemaJsDocDeclaration[]>();
  for (const declaration of loadedJsDoc.schemaDeclarations) {
    byIdentity.set(declarationIdentity(declaration.sourcePath, declaration.entityName), declaration);
    const candidates = byName.get(declaration.entityName);
    if (candidates === undefined) {
      byName.set(declaration.entityName, [declaration]);
    } else {
      candidates.push(declaration);
    }
  }

  for (const [entityName, sourcePath] of schemaEntitySourcePaths) {
    const declaration = matchSchemaDeclaration(entityName, sourcePath, byIdentity, byName);
    if (declaration === undefined) {
      continue;
    }

    // The symbol-resolved linked class is definitive when present; otherwise
    // whatever the class-side binding already produced for this name stands in.
    const classEntity =
      declaration.linkedClass !== undefined ? declaration.linkedClass.entity : entities.get(entityName);
    const merged = mergeEntityJsDoc(classEntity, declaration.entity);
    if (merged !== undefined) {
      entities.set(entityName, merged);
    }
    const schemaProps = declaration.linkedClass?.props ?? declaration.props;
    if (schemaProps.size > 0) {
      props.set(entityName, schemaProps);
    }
    // declaration.props (not linked-class props) as read evidence: only JSDoc
    // surviving in the declaration's own file proves its comments weren't
    // stripped by a build.
    if (
      TYPESCRIPT_SOURCE.test(declaration.sourcePath) ||
      declaration.entity !== undefined ||
      declaration.props.size > 0
    ) {
      jsDocReadEntityNames.add(entityName);
    }
  }

  return {
    jsDocResult: { entities, props, sourceFileCount: baseResult.sourceFileCount, classNames: baseResult.classNames },
    jsDocReadEntityNames,
  };
}

function matchSchemaDeclaration(
  entityName: string,
  sourcePath: string | undefined,
  byIdentity: ReadonlyMap<string, SchemaJsDocDeclaration>,
  byName: ReadonlyMap<string, SchemaJsDocDeclaration[]>
): SchemaJsDocDeclaration | undefined {
  if (sourcePath !== undefined) {
    const exact = byIdentity.get(declarationIdentity(normalizeSourcePath(sourcePath), entityName));
    if (exact !== undefined) {
      return exact;
    }
  }
  const candidates = byName.get(entityName) ?? [];
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Field-by-field merge with the class winning conflicts (the class is the
 * primary documentation site) — except @hidden, which is OR'd: accidentally
 * exposing an entity someone tried to hide is the worse failure mode.
 */
function mergeEntityJsDoc(
  fromClass: EntityJsDocInfo | undefined,
  fromSchema: EntityJsDocInfo | undefined
): EntityJsDocInfo | undefined {
  if (fromClass === undefined || fromSchema === undefined) {
    return fromClass ?? fromSchema;
  }

  const description = fromClass.description ?? fromSchema.description;
  return {
    ...(description !== undefined && { description }),
    namespaces: fromClass.namespaces.length > 0 ? fromClass.namespaces : fromSchema.namespaces,
    erdNamespaces: fromClass.erdNamespaces.length > 0 ? fromClass.erdNamespaces : fromSchema.erdNamespaces,
    describeNamespaces:
      fromClass.describeNamespaces.length > 0 ? fromClass.describeNamespaces : fromSchema.describeNamespaces,
    hidden: fromClass.hidden || fromSchema.hidden,
  };
}

/** Collects exported schema declarations; re-exports resolve to their home file. */
function collectSchemaDeclarations(sourceFile: SourceFile): SchemaJsDocDeclaration[] {
  const found: SchemaJsDocDeclaration[] = [];
  for (const declarationsForExport of sourceFile.getExportedDeclarations().values()) {
    for (const exported of declarationsForExport) {
      const schemaDeclaration = inspectSchemaExport(exported);
      if (schemaDeclaration !== undefined) {
        found.push(schemaDeclaration);
      }
    }
  }
  return found;
}

function inspectSchemaExport(exported: ExportedDeclarations): SchemaJsDocDeclaration | undefined {
  if (!Node.isVariableDeclaration(exported)) {
    return undefined;
  }
  const configArg = getSchemaConfigArgument(exported.getInitializer());
  if (configArg === undefined) {
    return undefined;
  }

  const linked = resolveLinkedClass(configArg);
  const entityName = linked?.className ?? getStringProperty(configArg, 'name');
  if (entityName === undefined) {
    return undefined;
  }

  // JSDoc sits on the VariableStatement, one level above the declaration
  // getExportedDeclarations() hands out.
  const statementDocs = exported.getVariableStatement()?.getJsDocs() ?? [];
  const entity = statementDocs.length > 0 ? parseEntityJsDoc(statementDocs) : undefined;

  // Any `class:` link — even one whose class could not be resolved — keeps the
  // class as the property documentation site, so the literal stays unread.
  const props = linked === undefined ? collectSchemaPropJsDocs(configArg) : new Map<string, PropJsDocInfo>();

  return {
    entityName,
    sourcePath: normalizeSourcePath(exported.getSourceFile().getFilePath()),
    ...(entity !== undefined && { entity }),
    props,
    ...(linked?.declaration !== undefined && { linkedClass: linked.declaration }),
  };
}

/**
 * Property JSDoc from inside the schema config's `properties` object literal —
 * the property documentation site of name-only schemas (#106). PropertyAssignment
 * nodes expose JSDoc only through the raw compiler API, like constructor
 * parameter properties.
 */
function collectSchemaPropJsDocs(configArg: ObjectLiteralExpression): Map<string, PropJsDocInfo> {
  const propMap = new Map<string, PropJsDocInfo>();
  const literal = getPropertiesLiteral(configArg);
  if (literal === undefined) {
    return propMap;
  }
  for (const member of literal.getProperties()) {
    const propName = getLiteralPropertyName(member);
    if (propName === undefined) {
      continue;
    }
    const info = parsePropInfo(fromCompilerJsDocs(ts.getJSDocCommentsAndTags(member.compilerNode)));
    addPropInfo(propMap, propName, info);
  }
  return propMap;
}

/**
 * Returns the `properties` object literal, unwrapping the builder callback of
 * MikroORM 7's defineEntity() (`properties: (p) => ({...})`) when present.
 */
function getPropertiesLiteral(configArg: ObjectLiteralExpression): ObjectLiteralExpression | undefined {
  const property = configArg.getProperty('properties');
  if (property === undefined || !Node.isPropertyAssignment(property)) {
    return undefined;
  }
  const initializer = property.getInitializer();
  const direct = asObjectLiteral(initializer);
  if (direct !== undefined) {
    return direct;
  }
  if (initializer === undefined || (!Node.isArrowFunction(initializer) && !Node.isFunctionExpression(initializer))) {
    return undefined;
  }
  const body = initializer.getBody();
  const returned = Node.isBlock(body) ? body.getStatements().find(Node.isReturnStatement)?.getExpression() : body;
  return asObjectLiteral(unwrapParentheses(returned));
}

function unwrapParentheses(node: Node | undefined): Node | undefined {
  let current = node;
  while (current !== undefined && Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

/** Spreads and computed names cannot be matched to a metadata property, so they carry no name. */
function getLiteralPropertyName(member: ObjectLiteralElementLike): string | undefined {
  if (!Node.isPropertyAssignment(member) && !Node.isShorthandPropertyAssignment(member)) {
    return undefined;
  }
  const nameNode = member.getNameNode();
  if (Node.isIdentifier(nameNode)) {
    return nameNode.getText();
  }
  return Node.isStringLiteral(nameNode) ? nameNode.getLiteralValue() : undefined;
}

/**
 * Matches `new EntitySchema({...})` and `defineEntity({...})` initializers.
 * MikroORM 7's defineEntity() builds on EntitySchema, so both spell "schema
 * declaration". Restricting candidates to these initializers is what keeps a
 * same-named DTO class or unrelated variable from ever binding.
 */
function getSchemaConfigArgument(initializer: Node | undefined): ObjectLiteralExpression | undefined {
  if (initializer === undefined) {
    return undefined;
  }
  if (Node.isNewExpression(initializer)) {
    return matchesCallee(initializer.getExpression().getText(), 'EntitySchema')
      ? asObjectLiteral(initializer.getArguments()[0])
      : undefined;
  }
  if (Node.isCallExpression(initializer)) {
    return matchesCallee(initializer.getExpression().getText(), 'defineEntity')
      ? asObjectLiteral(initializer.getArguments()[0])
      : undefined;
  }
  return undefined;
}

/** Accepts bare and namespace-qualified callees (`EntitySchema`, `orm.EntitySchema`). */
function matchesCallee(calleeText: string, name: string): boolean {
  return calleeText === name || calleeText.endsWith(`.${name}`);
}

function asObjectLiteral(node: Node | undefined): ObjectLiteralExpression | undefined {
  return node !== undefined && Node.isObjectLiteralExpression(node) ? node : undefined;
}

function getStringProperty(configArg: ObjectLiteralExpression, propertyName: string): string | undefined {
  const property = configArg.getProperty(propertyName);
  if (property === undefined || !Node.isPropertyAssignment(property)) {
    return undefined;
  }
  const value = property.getInitializer();
  return value !== undefined && Node.isStringLiteral(value) ? value.getLiteralValue() : undefined;
}

interface LinkedClassResolution {
  className: string;
  /** Present only when the identifier's symbol resolved to a class declaration. */
  declaration?: JsDocDeclaration;
}

/**
 * Follows the `class:` identifier through its symbol (import aliases included)
 * to the actual class declaration — pinning the class without name guessing.
 * Falls back to the identifier text when the symbol cannot be resolved, so the
 * entity name still comes out right even if the class JSDoc cannot be read.
 */
function resolveLinkedClass(configArg: ObjectLiteralExpression): LinkedClassResolution | undefined {
  const property = configArg.getProperty('class');
  if (property === undefined || !Node.isPropertyAssignment(property)) {
    return undefined;
  }
  const value = property.getInitializer();
  if (value === undefined || !Node.isIdentifier(value)) {
    return undefined;
  }

  const symbol = value.getSymbol();
  const resolved = symbol?.getAliasedSymbol() ?? symbol;
  const classDeclaration = resolved?.getDeclarations().find(Node.isClassDeclaration);
  if (classDeclaration === undefined) {
    return { className: value.getText() };
  }

  const className = classDeclaration.getName() ?? value.getText();
  const classDocs = classDeclaration.getJsDocs();
  const entity = classDocs.length > 0 ? parseEntityJsDoc(classDocs) : undefined;
  return {
    className,
    declaration: {
      className,
      sourcePath: normalizeSourcePath(classDeclaration.getSourceFile().getFilePath()),
      ...(entity !== undefined && { entity }),
      props: collectPropJsDocs(classDeclaration),
    },
  };
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
