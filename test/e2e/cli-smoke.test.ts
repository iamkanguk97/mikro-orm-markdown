import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Exercises the built CLI exactly as a user runs it (`node dist/cli.js ...`),
// from the repository root, against a .ts config. This is the only test that
// would have caught the cwd/tsconfig regression (H1): the helper/programmatic
// tests bypass the real bin and the working-directory-sensitive config load.

const repoRoot = path.resolve(import.meta.dirname, '../..');
const cliPath = path.join(repoRoot, 'dist', 'cli.js');
const exampleConfig = path.join('examples', 'mikro-orm.config.ts');
const dualDiscoveryConfig = path.join('test', 'fixtures', 'mikro-orm.dual.config.ts');
const dualDiscoveryTsconfig = path.join('test', 'fixtures', 'tsconfig.dual.json');

let outFile: string;

describe('CLI smoke (built bin)', () => {
  beforeAll(() => {
    // Build so we run the real shipped artifact, not the TypeScript source.
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'ignore' });
    outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-smoke-')), 'ERD.md');
  });

  afterAll(() => {
    fs.rmSync(path.dirname(outFile), { recursive: true, force: true });
  });

  it('generates markdown from a .ts config when run from the repo root', () => {
    // cwd is the repo root, not examples/ — the failure mode H1 fixed.
    execFileSync('node', [cliPath, '-c', exampleConfig, '-o', outFile, '-t', 'Smoke'], {
      cwd: repoRoot,
      stdio: 'ignore',
    });

    const output = fs.readFileSync(outFile, 'utf-8');
    expect(output.startsWith('# Smoke')).toBe(true);
    expect(output).toContain('```mermaid');
  });

  it('uses entitiesTs by default for a .ts config with dual discovery paths', () => {
    execFileSync(
      'node',
      [cliPath, '-c', dualDiscoveryConfig, '--tsconfig', dualDiscoveryTsconfig, '-o', outFile, '-t', 'Dual Discovery'],
      {
        cwd: repoRoot,
        stdio: 'ignore',
      }
    );

    const output = fs.readFileSync(outFile, 'utf-8');
    expect(output.startsWith('# Dual Discovery')).toBe(true);
    expect(output).toContain('### DualUser');
  });
});
