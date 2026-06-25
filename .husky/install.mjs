import { existsSync } from 'node:fs';

const skipNpmCommands = new Set(['pack', 'publish']);
// npm sets npm_command; pnpm/yarn set npm_lifecycle_event for pack-like commands.
const pkgCommand = process.env.npm_command ?? process.env.npm_lifecycle_event ?? '';
const shouldSkip =
  process.env.HUSKY === '0' ||
  process.env.CI === 'true' ||
  process.env.NODE_ENV === 'production' ||
  skipNpmCommands.has(pkgCommand) ||
  !existsSync('.git');

if (!shouldSkip) {
  const { default: husky } = await import('husky');
  husky();
}
