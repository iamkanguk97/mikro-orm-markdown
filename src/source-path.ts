import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Returns one absolute, platform-normalized representation of a source file path. */
export function normalizeSourcePath(sourcePath: string, baseDir: string = process.cwd()): string {
  // MikroORM v6 reports `EntityMetadata.path` as a filesystem path, v7 as a
  // file:// URL. Resolving a URL against baseDir would produce a bogus
  // `<baseDir>/file:/...` path and silently break every JSDoc source match.
  const filePath = sourcePath.startsWith('file:') ? fileURLToPath(sourcePath) : sourcePath;
  const normalizedPath = path.normalize(path.resolve(baseDir, filePath));

  try {
    return realpathSync.native(normalizedPath);
  } catch {
    // Compiled or bundled metadata can point at a virtual/nonexistent source.
    // Keep its lexical identity so explicit TypeScript fallback can still work.
    return normalizedPath;
  }
}
