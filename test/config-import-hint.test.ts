import { describe, expect, it } from 'vitest';
import { TYPESCRIPT_IMPORT_HINT, typeScriptImportHint } from '../src/config-import-hint.js';

interface NodeErrorShape {
  name?: string;
  code?: string;
  stack?: string;
}

/** Builds an error with the shape Node.js raises, as captured by probing real import failures. */
function nodeError(message: string, shape: NodeErrorShape = {}): Error {
  const err = new Error(message);
  err.name = shape.name ?? 'Error';
  if (shape.code !== undefined) {
    Object.assign(err, { code: shape.code });
  }
  err.stack =
    shape.stack ?? `${err.name}: ${message}\n    at compileSourceTextModule (node:internal/modules/esm/utils:319:16)`;
  return err;
}

const TS_IMPORTING_CONFIG = "import { Post } from './src/post.entity.ts';\nexport default { entities: [Post] };\n";
const JS_ONLY_CONFIG =
  "import { Post } from './dist/post.entity.js';\nexport default { entities: [Post], entitiesTs: ['./src/**/*.ts'] };\n";
const bareSyntaxError = (): Error => nodeError('Invalid or unexpected token', { name: 'SyntaxError' });

describe('typeScriptImportHint', () => {
  it.each([
    [
      'R1 unknown .ts extension',
      nodeError('Unknown file extension ".ts" for /abs/post.entity.ts', {
        name: 'TypeError',
        code: 'ERR_UNKNOWN_FILE_EXTENSION',
      }),
    ],
    [
      'R1 unknown .mts extension',
      nodeError('Unknown file extension ".mts" for /abs/post.entity.mts', {
        name: 'TypeError',
        code: 'ERR_UNKNOWN_FILE_EXTENSION',
      }),
    ],
    [
      'R2 unsupported TypeScript syntax',
      nodeError('TypeScript enum is not supported in strip-only mode', {
        name: 'SyntaxError',
        code: 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX',
      }),
    ],
    [
      'R3 module not found from a .ts importer',
      nodeError("Cannot find module '/abs/b.js' imported from /abs/a.ts", { code: 'ERR_MODULE_NOT_FOUND' }),
    ],
    [
      'R3 with Windows paths',
      nodeError("Cannot find module 'C:\\proj\\src\\b.js' imported from C:\\proj\\src\\a.ts", {
        code: 'ERR_MODULE_NOT_FOUND',
      }),
    ],
    [
      'R4 stack headed by a .ts location',
      nodeError('Invalid or unexpected token', {
        name: 'SyntaxError',
        stack: '/abs/deco.ts:5\n@mark\n^\n\nSyntaxError: Invalid or unexpected token',
      }),
    ],
    [
      'R4 with a Windows path',
      nodeError("Unexpected token ':'", {
        name: 'SyntaxError',
        stack: "C:\\proj\\deco.cts:1\nfunction mark(target: any) {\n\nSyntaxError: Unexpected token ':'",
      }),
    ],
    [
      'R5 missing export from a .ts specifier',
      nodeError("The requested module './deco.ts' does not provide an export named 'Post'", { name: 'SyntaxError' }),
    ],
  ])('returns the hint for %s', (_label, err) => {
    expect(typeScriptImportHint(err)).toBe(TYPESCRIPT_IMPORT_HINT);
  });

  it.each([
    ['a static import', TS_IMPORTING_CONFIG],
    ['a dynamic import', 'const load = () => import("./post.entity.mts");\n'],
    ['a require call', "const { Post } = require('./post.entity.cts');\n"],
  ])(
    'R6: returns the hint for a bare SyntaxError when the config source has %s of a TypeScript file',
    (_label, source) => {
      expect(typeScriptImportHint(bareSyntaxError(), source)).toBe(TYPESCRIPT_IMPORT_HINT);
    }
  );

  it.each([
    ['R6 without config source', bareSyntaxError(), undefined],
    ['R6 when the config only mentions .ts in a glob string', bareSyntaxError(), JS_ONLY_CONFIG],
    [
      'an unknown non-TypeScript extension',
      nodeError('Unknown file extension ".css" for /abs/a.css', {
        name: 'TypeError',
        code: 'ERR_UNKNOWN_FILE_EXTENSION',
      }),
      TS_IMPORTING_CONFIG,
    ],
    [
      'module not found from a .js importer',
      nodeError("Cannot find module '/abs/b.js' imported from /abs/config.js", { code: 'ERR_MODULE_NOT_FOUND' }),
      TS_IMPORTING_CONFIG,
    ],
    [
      'a missing package imported from a .ts file',
      nodeError("Cannot find package 'foo' imported from /abs/a.ts", { code: 'ERR_MODULE_NOT_FOUND' }),
      TS_IMPORTING_CONFIG,
    ],
    [
      'a missing export from a .js specifier',
      nodeError("The requested module './deco.js' does not provide an export named 'Post'", { name: 'SyntaxError' }),
      undefined,
    ],
    // The config imports a TypeScript file that loaded fine; these SyntaxErrors
    // say where they came from, so the config source must not be consulted.
    [
      'a SyntaxError whose stack is headed by a .js location',
      nodeError("The requested module './helpers.js' does not provide an export named 'dbNmae'", {
        name: 'SyntaxError',
        stack:
          "file:///abs/mikro-orm.config.js:2\nimport { dbNmae } from './helpers.js';\n         ^^^^^^\n" +
          "SyntaxError: The requested module './helpers.js' does not provide an export named 'dbNmae'\n" +
          '    at ModuleJob._instantiate (node:internal/modules/esm/module_job:228:21)',
      }),
      TS_IMPORTING_CONFIG,
    ],
    [
      'a SyntaxError whose stack is headed by a .cjs location',
      nodeError("Unexpected token ';'", {
        name: 'SyntaxError',
        stack:
          "/abs/broken.cjs:1\nconst = ;\n      ^\n\nSyntaxError: Unexpected token ';'\n" +
          '    at wrapSafe (node:internal/modules/cjs/loader:1486:18)',
      }),
      TS_IMPORTING_CONFIG,
    ],
    [
      'a SyntaxError raised by JSON.parse in the config',
      nodeError('Unexpected end of JSON input', {
        name: 'SyntaxError',
        stack:
          'SyntaxError: Unexpected end of JSON input\n    at JSON.parse (<anonymous>)\n' +
          '    at file:///abs/mikro-orm.config.js:3:6\n' +
          '    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)',
      }),
      TS_IMPORTING_CONFIG,
    ],
    [
      'a SyntaxError thrown by the config itself',
      nodeError('boom', {
        name: 'SyntaxError',
        stack:
          'SyntaxError: boom\n    at file:///abs/mikro-orm.config.js:2:7\n' +
          '    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)',
      }),
      TS_IMPORTING_CONFIG,
    ],
    ['an ordinary error', new Error('boom'), TS_IMPORTING_CONFIG],
    ['a thrown string', 'boom', TS_IMPORTING_CONFIG],
    ['a thrown null', null, TS_IMPORTING_CONFIG],
  ])('returns undefined for %s', (_label, err, source) => {
    expect(typeScriptImportHint(err, source)).toBeUndefined();
  });

  it('names the cause and both fixes in the hint', () => {
    expect(TYPESCRIPT_IMPORT_HINT.startsWith('\n\nNote: ')).toBe(true);
    expect(TYPESCRIPT_IMPORT_HINT).toContain('did not register tsx');
    expect(TYPESCRIPT_IMPORT_HINT).toContain('use a .ts config');
    expect(TYPESCRIPT_IMPORT_HINT).toContain('--src');
  });
});
