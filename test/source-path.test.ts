import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeSourcePath } from '../src/source-path.js';
import { makeTempDir } from './helpers/temp-dir.js';

describe('normalizeSourcePath', () => {
  it('resolves relative paths and removes parent-directory segments', () => {
    const baseDir = path.resolve('/workspace/project');

    expect(normalizeSourcePath('./src/entity/../entity/User.ts', baseDir)).toBe(
      path.resolve(baseDir, 'src/entity/User.ts')
    );
  });

  // MikroORM v7 reports `EntityMetadata.path` as a file:// URL where v6 used a
  // filesystem path. Resolving the URL against baseDir would yield a bogus
  // `<baseDir>/file:/...` path and break every JSDoc source match.
  it('resolves a file:// URL to the same identity as its filesystem path', () => {
    const dir = makeTempDir('source-path-url-');
    const sourcePath = path.join(dir, 'Entity.ts');
    fs.writeFileSync(sourcePath, 'export class Entity {}\n');

    expect(normalizeSourcePath(pathToFileURL(sourcePath).href)).toBe(normalizeSourcePath(sourcePath));
  });

  it('ignores baseDir for an absolute file:// URL', () => {
    const dir = makeTempDir('source-path-url-base-');
    const sourcePath = path.join(dir, 'Entity.ts');
    fs.writeFileSync(sourcePath, 'export class Entity {}\n');

    const resolved = normalizeSourcePath(pathToFileURL(sourcePath).href, path.resolve('/some/other/base'));

    expect(resolved).toBe(normalizeSourcePath(sourcePath));
    expect(resolved).not.toContain('file:');
  });

  it('canonicalizes symlink aliases to the same physical source identity', () => {
    const dir = makeTempDir('source-path-');
    const sourcePath = path.join(dir, 'Entity.ts');
    const aliasPath = path.join(dir, 'EntityAlias.ts');
    fs.writeFileSync(sourcePath, 'export class Entity {}\n');
    fs.symlinkSync(sourcePath, aliasPath);

    expect(normalizeSourcePath(aliasPath)).toBe(normalizeSourcePath(sourcePath));
  });
});
