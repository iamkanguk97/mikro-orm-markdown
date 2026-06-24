import { existsSync } from 'node:fs';

const skipNpmCommands = new Set(['pack', 'publish']);
const shouldSkip =
  process.env.HUSKY === '0' ||
  process.env.CI === 'true' ||
  process.env.NODE_ENV === 'production' ||
  skipNpmCommands.has(process.env.npm_command ?? '') ||
  !existsSync('.git');

if (!shouldSkip) {
  const { default: husky } = await import('husky');
  husky();
}
