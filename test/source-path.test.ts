import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeSourcePath } from '../src/source-path.js';

describe('normalizeSourcePath', () => {
  it('resolves relative paths and removes parent-directory segments', () => {
    const baseDir = path.resolve('/workspace/project');

    expect(normalizeSourcePath('./src/entity/../entity/User.ts', baseDir)).toBe(
      path.resolve(baseDir, 'src/entity/User.ts')
    );
  });

  it('canonicalizes symlink aliases to the same physical source identity', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-path-'));
    const sourcePath = path.join(dir, 'Entity.ts');
    const aliasPath = path.join(dir, 'EntityAlias.ts');
    fs.writeFileSync(sourcePath, 'export class Entity {}\n');
    fs.symlinkSync(sourcePath, aliasPath);

    try {
      expect(normalizeSourcePath(aliasPath)).toBe(normalizeSourcePath(sourcePath));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
