import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workDir = mkdtempSync(path.join(tmpdir(), 'mikro-orm-markdown-pack-'));

let currentStep = 'setup';

function step(name) {
  currentStep = name;
  process.stdout.write(`\n[pack-smoke] ${name}\n`);
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  });
}

function assertContains(content, needles, label) {
  for (const needle of needles) {
    if (!content.includes(needle)) {
      throw new Error(`${label} is missing expected content: ${JSON.stringify(needle)}`);
    }
  }
}

// Shared by every installed entry path: a decorator-based entity declared from
// plain JavaScript (EntitySchema is unsupported) and a JavaScript ORM config.
const ENTITY_MODULE = `import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

export class PackSmokeUser {}
Entity({ tableName: 'pack_smoke_user' })(PackSmokeUser);
PrimaryKey({ type: 'integer' })(PackSmokeUser.prototype, 'id');
Property({ type: 'string' })(PackSmokeUser.prototype, 'name');
`;

const CONFIG_MODULE = `import { SqliteDriver } from '@mikro-orm/sqlite';
import { PackSmokeUser } from './entities.mjs';

export default { driver: SqliteDriver, dbName: ':memory:', entities: [PackSmokeUser] };
`;

const ESM_SMOKE = `import { generateMarkdown } from 'mikro-orm-markdown';
import config from './mikro-orm.config.mjs';

if (typeof generateMarkdown !== 'function') throw new Error('generateMarkdown export missing');

const md = await generateMarkdown({ orm: config, title: 'Pack Smoke ESM' });
for (const needle of ['# Pack Smoke ESM', 'erDiagram', '### PackSmokeUser', '| name | string |']) {
  if (!md.includes(needle)) throw new Error('ESM generateMarkdown output is missing: ' + needle);
}
console.log('[pack-smoke] ESM API generated a real document');
`;

// CJS declares its own entity: each smoke script is a separate process, and a
// CommonJS consumer cannot import the .mjs entity module.
const CJS_SMOKE = `const { Entity, PrimaryKey, Property } = require('@mikro-orm/core');
const { SqliteDriver } = require('@mikro-orm/sqlite');
const { generateMarkdown } = require('mikro-orm-markdown');

if (typeof generateMarkdown !== 'function') throw new Error('generateMarkdown export missing');

class PackSmokeUser {}
Entity({ tableName: 'pack_smoke_user' })(PackSmokeUser);
PrimaryKey({ type: 'integer' })(PackSmokeUser.prototype, 'id');
Property({ type: 'string' })(PackSmokeUser.prototype, 'name');

generateMarkdown({
  orm: { driver: SqliteDriver, dbName: ':memory:', entities: [PackSmokeUser] },
  title: 'Pack Smoke CJS',
})
  .then((md) => {
    for (const needle of ['# Pack Smoke CJS', 'erDiagram', '### PackSmokeUser', '| name | string |']) {
      if (!md.includes(needle)) throw new Error('CJS generateMarkdown output is missing: ' + needle);
    }
    console.log('[pack-smoke] CJS API generated a real document');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
`;

try {
  step('pack the npm tarball');
  const packDir = path.join(workDir, 'pack');
  const consumerDir = path.join(workDir, 'consumer');
  mkdirSync(packDir);
  mkdirSync(consumerDir);

  const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  const [packed] = JSON.parse(packOutput);
  const tarballPath = path.join(packDir, path.basename(packed.filename));

  step('install the tarball with explicit MikroORM v6 peers');
  writeFileSync(path.join(consumerDir, 'package.json'), '{"private":true,"type":"module"}\n');
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      tarballPath,
      '@mikro-orm/core@^6.0.0',
      '@mikro-orm/sqlite@^6.0.0',
    ],
    { cwd: consumerDir }
  );

  writeFileSync(path.join(consumerDir, 'entities.mjs'), ENTITY_MODULE);
  writeFileSync(path.join(consumerDir, 'mikro-orm.config.mjs'), CONFIG_MODULE);

  step('generate through the installed ESM API');
  writeFileSync(path.join(consumerDir, 'smoke-esm.mjs'), ESM_SMOKE);
  run('node', ['smoke-esm.mjs'], { cwd: consumerDir });

  step('generate through the installed CJS API');
  writeFileSync(path.join(consumerDir, 'smoke-cjs.cjs'), CJS_SMOKE);
  run('node', ['smoke-cjs.cjs'], { cwd: consumerDir });

  const binName = process.platform === 'win32' ? 'mikro-orm-markdown.cmd' : 'mikro-orm-markdown';
  const binPath = path.join(consumerDir, 'node_modules', '.bin', binName);

  step('generate through the installed CLI binary');
  const outPath = path.join(consumerDir, 'docs', 'ERD.md');
  run(binPath, ['-c', 'mikro-orm.config.mjs', '-o', outPath, '-t', 'Pack Smoke CLI'], { cwd: consumerDir });
  assertContains(
    readFileSync(outPath, 'utf-8'),
    ['# Pack Smoke CLI', 'erDiagram', '### PackSmokeUser', '| name | string |'],
    'CLI-generated document'
  );
  process.stdout.write('[pack-smoke] installed CLI generated a real document\n');

  step('print CLI --help');
  run(binPath, ['--help'], { cwd: consumerDir });
} catch (error) {
  process.stderr.write(`\n[pack-smoke] FAILED at step: ${currentStep}\n`);
  throw error;
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
