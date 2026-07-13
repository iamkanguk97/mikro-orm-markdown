import { realpathSync } from 'node:fs';
import * as path from 'node:path';

/** Returns one absolute, platform-normalized representation of a source file path. */
export function normalizeSourcePath(sourcePath: string, baseDir: string = process.cwd()): string {
  const normalizedPath = path.normalize(path.resolve(baseDir, sourcePath));

  try {
    return realpathSync.native(normalizedPath);
  } catch {
    // Compiled or bundled metadata can point at a virtual/nonexistent source.
    // Keep its lexical identity so explicit TypeScript fallback can still work.
    return normalizedPath;
  }
}
