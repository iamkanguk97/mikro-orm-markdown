/**
 * Appended after Node's own message when a non-`.ts` config fails because
 * Node.js loaded a TypeScript file the config imports. The CLI registers `tsx`
 * only for `.ts` configs, so for any other config Node handles those files by
 * itself.
 */
export const TYPESCRIPT_IMPORT_HINT =
  '\n\nNote: this config is not a .ts file, so this tool did not register tsx and Node.js loaded ' +
  'the TypeScript file it imports on its own. Node.js cannot run TypeScript-only syntax such as ' +
  "decorators and enums, does not map '.js' import paths to '.ts' files, and before 22.18 does not " +
  'load .ts files at all.\n' +
  'Either use a .ts config — this tool then loads it and the entities it imports through tsx — ' +
  'or import the compiled .js entities and pass --src with the original TypeScript files so JSDoc can still be read.';

/** R1 — Node 22.17: any `.ts` import is rejected by its extension. */
const UNKNOWN_TYPESCRIPT_EXTENSION = /^Unknown file extension "\.(?:ts|mts|cts)"/;

/**
 * R3 — Node 22.18+ / 24: a TypeScript file imports `./b.js` while only `b.ts`
 * exists. Anchored on "module" so a missing npm package ("Cannot find package")
 * imported from a `.ts` file does not match — `tsx` would not fix that.
 */
const MODULE_NOT_FOUND_FROM_TYPESCRIPT = /^Cannot find module .* imported from .*\.(?:ts|mts|cts)$/;

/**
 * R4 — a TypeScript file compiled as CommonJS (`require()`, or a package
 * without `"type": "module"`): the stack opens with `<file>.ts:<line>`.
 */
const TYPESCRIPT_STACK_LOCATION = /\.(?:ts|mts|cts):\d+$/;

/**
 * R5 — Node 22.18+ / 24, package without `"type": "module"`: a named import
 * from a TypeScript file whose syntax Node could not analyse.
 */
const MISSING_EXPORT_FROM_TYPESCRIPT =
  /^The requested module '[^']+\.(?:ts|mts|cts)' does not provide an export named /;

/**
 * R6 — matches an `import … from`, `import(…)`, or `require(…)` whose
 * specifier ends in a TypeScript extension. Requiring the import keyword keeps
 * glob strings such as `entitiesTs: ['./src/**\/*.ts']` from matching.
 */
const TYPESCRIPT_IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])[^'"\n]+\.(?:ts|mts|cts)\1/;

/** Reads a string field from an unknown thrown value without assuming it is an Error. */
function stringField(value: unknown, key: 'name' | 'code' | 'message' | 'stack'): string | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
}

/**
 * Returns {@link TYPESCRIPT_IMPORT_HINT} when `err` is the failure Node.js
 * raises on loading a TypeScript file by itself, otherwise `undefined`.
 *
 * The shapes below were captured from real `import()` rejections on Node
 * 22.17.0, 22.17.0 with `--experimental-strip-types`, and 24. `name` is
 * compared as a string, not with `instanceof`, so an error created in another
 * realm still matches.
 *
 * `configSource` is the config file's own text. It is consulted only for the
 * one shape that carries no file information at all: a decorator in an ES
 * module surfaces as a bare `SyntaxError` whose stack has only Node-internal
 * frames, identical to a genuinely broken JavaScript file. That case counts
 * only when the config itself imports a TypeScript file.
 */
export function typeScriptImportHint(err: unknown, configSource?: string): string | undefined {
  const name = stringField(err, 'name');
  const code = stringField(err, 'code');
  const message = stringField(err, 'message') ?? '';

  if (code === 'ERR_UNKNOWN_FILE_EXTENSION') {
    return UNKNOWN_TYPESCRIPT_EXTENSION.test(message) ? TYPESCRIPT_IMPORT_HINT : undefined;
  }
  // R2 — Node 22.18+ / 24: non-erasable syntax such as `enum`. The code itself is TypeScript-only.
  if (code === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX') {
    return TYPESCRIPT_IMPORT_HINT;
  }
  if (code === 'ERR_MODULE_NOT_FOUND') {
    return MODULE_NOT_FOUND_FROM_TYPESCRIPT.test(message) ? TYPESCRIPT_IMPORT_HINT : undefined;
  }
  if (name !== 'SyntaxError') {
    return undefined;
  }

  const firstStackLine = (stringField(err, 'stack') ?? '').split('\n', 1)[0]?.trimEnd() ?? '';
  if (TYPESCRIPT_STACK_LOCATION.test(firstStackLine) || MISSING_EXPORT_FROM_TYPESCRIPT.test(message)) {
    return TYPESCRIPT_IMPORT_HINT;
  }
  // R6 — only a code-less SyntaxError is ambiguous enough to need the config's own imports as evidence.
  if (code === undefined && configSource !== undefined && TYPESCRIPT_IMPORT_SPECIFIER.test(configSource)) {
    return TYPESCRIPT_IMPORT_HINT;
  }
  return undefined;
}
