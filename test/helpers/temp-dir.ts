import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { onTestFinished } from 'vitest';

/**
 * Creates a temp directory under os.tmpdir() and removes it automatically
 * when the calling test finishes, pass or fail. Call from inside a test body
 * (onTestFinished does not work in beforeAll/describe scope).
 */
export function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  onTestFinished(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
