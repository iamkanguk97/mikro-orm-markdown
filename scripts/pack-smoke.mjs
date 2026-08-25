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

// MikroORM moved the decorators out of @mikro-orm/core into a dedicated package
// in v7, so each consumer imports them from the specifier its major provides.
const V6_DECORATORS = '@mikro-orm/core';
const V7_DECORATORS = '@mikro-orm/decorators/legacy';

// Shared by every installed entry path: a decorator-based entity declared from
// plain JavaScript and a JavaScript ORM config. Types are given explicitly, so
// no metadata provider inference is needed.
const entityModule = (decorators) => `import { Entity, PrimaryKey, Property } from '${decorators}';

export class PackSmokeUser {}
Entity({ tableName: 'pack_smoke_user' })(PackSmokeUser);
PrimaryKey({ type: 'integer' })(PackSmokeUser.prototype, 'id');
Property({ type: 'string' })(PackSmokeUser.prototype, 'name');
`;

// Each major declares the schema-defined entity through its own API — v7's
// defineEntity() is the successor built on EntitySchema — but both share the
// entity name, JSDoc and shape, so every document assertion applies to both.
const V6_SCHEMA_ENTITY_MODULE = `import { EntitySchema } from '@mikro-orm/core';

/**
 * Schema-defined tag for the pack smoke.
 *
 * @namespace Taxonomy
 */
export const PackSmokeTagSchema = new EntitySchema({
  name: 'PackSmokeTag',
  properties: {
    id: { primary: true, type: 'integer' },
    /** Human-readable tag label. */
    label: { type: 'string' },
  },
});
`;

const V7_SCHEMA_ENTITY_MODULE = `import { defineEntity } from '@mikro-orm/core';

/**
 * Schema-defined tag for the pack smoke.
 *
 * @namespace Taxonomy
 */
export const PackSmokeTagSchema = defineEntity({
  name: 'PackSmokeTag',
  properties: (p) => ({
    id: p.integer().primary(),
    /** Human-readable tag label. */
    label: p.string(),
  }),
});
`;

// The schema entity enters the config as a file-path string on purpose:
// discovered that way, v7 leaves no meta.path on it, so its JSDoc is reachable
// only through the config-string scan widening added for #106.
const CONFIG_MODULE = `import { SqliteDriver } from '@mikro-orm/sqlite';
import { PackSmokeUser } from './entities.mjs';

export default {
  driver: SqliteDriver,
  dbName: ':memory:',
  entities: [PackSmokeUser, './schema-entities.mjs'],
};
`;

// Expected in every generated document (ESM API and CLI): the decorator entity
// and the schema entity with its JSDoc description, @namespace group, and
// object-literal property JSDoc bound (v7 proves the builder-callback unwrap).
const DOCUMENT_NEEDLES = [
  'erDiagram',
  '### PackSmokeUser',
  '| name | string |',
  '## Taxonomy',
  '### PackSmokeTag',
  '> Schema-defined tag for the pack smoke.',
  '| label | string |',
  'Human-readable tag label.',
];

const ESM_SMOKE = `import { generateMarkdown } from 'mikro-orm-markdown';
import config from './mikro-orm.config.mjs';

if (typeof generateMarkdown !== 'function') throw new Error('generateMarkdown export missing');

const warnings = [];
const md = await generateMarkdown({
  orm: config,
  title: 'Pack Smoke ESM',
  onWarn: (message) => warnings.push(message),
});
for (const needle of ${JSON.stringify(['# Pack Smoke ESM', ...DOCUMENT_NEEDLES])}) {
  if (!md.includes(needle)) throw new Error('ESM generateMarkdown output is missing: ' + needle);
}
if (warnings.some((message) => message.includes('JSDoc could not be read for these schema-defined entities'))) {
  throw new Error('schema-declaration JSDoc was not bound:\\n' + warnings.join('\\n'));
}
console.log('[pack-smoke] ESM API generated a real document with schema-declaration JSDoc bound');
`;

// CJS declares its own entity: each smoke script is a separate process, and a
// CommonJS consumer cannot import the .mjs entity module.
const cjsSmoke = (decorators) => `const { Entity, PrimaryKey, Property } = require('${decorators}');
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

/** MikroORM v7 declares `engines.node >= 22.17`, so older runtimes cannot install it. */
function supportsMikroOrmV7() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 17);
}

/**
 * Installs the tarball next to one MikroORM major and drives every installed
 * entry point (ESM API, CJS API, CLI binary) against it.
 */
function verifyConsumer({ label, dir, peers, decorators, schemaEntities, tarballPath }) {
  mkdirSync(dir);

  step(`install the tarball with explicit MikroORM ${label} peers`);
  writeFileSync(path.join(dir, 'package.json'), '{"private":true,"type":"module"}\n');
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath, ...peers], { cwd: dir });

  writeFileSync(path.join(dir, 'entities.mjs'), entityModule(decorators));
  writeFileSync(path.join(dir, 'schema-entities.mjs'), schemaEntities);
  writeFileSync(path.join(dir, 'mikro-orm.config.mjs'), CONFIG_MODULE);

  step(`generate through the installed ESM API (${label})`);
  writeFileSync(path.join(dir, 'smoke-esm.mjs'), ESM_SMOKE);
  run('node', ['smoke-esm.mjs'], { cwd: dir });

  step(`generate through the installed CJS API (${label})`);
  writeFileSync(path.join(dir, 'smoke-cjs.cjs'), cjsSmoke(decorators));
  run('node', ['smoke-cjs.cjs'], { cwd: dir });

  const binName = process.platform === 'win32' ? 'mikro-orm-markdown.cmd' : 'mikro-orm-markdown';
  const binPath = path.join(dir, 'node_modules', '.bin', binName);

  step(`generate through the installed CLI binary (${label})`);
  const outPath = path.join(dir, 'docs', 'ERD.md');
  run(binPath, ['-c', 'mikro-orm.config.mjs', '-o', outPath, '-t', 'Pack Smoke CLI'], { cwd: dir });
  assertContains(
    readFileSync(outPath, 'utf-8'),
    ['# Pack Smoke CLI', ...DOCUMENT_NEEDLES],
    `CLI-generated document (${label})`
  );
  process.stdout.write(`[pack-smoke] installed CLI generated a real document against MikroORM ${label}\n`);

  step(`print CLI --help (${label})`);
  run(binPath, ['--help'], { cwd: dir });
}

// An optional argument points at a pre-built tarball (CI consumer jobs test an
// uploaded artifact on a bare Node without the repository dev dependencies);
// without it the script packs the current build itself.
const providedTarball = process.argv[2];

try {
  const packDir = path.join(workDir, 'pack');
  mkdirSync(packDir);

  let tarballPath;
  if (providedTarball === undefined) {
    step('pack the npm tarball');
    const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
    const [packed] = JSON.parse(packOutput);
    tarballPath = path.join(packDir, path.basename(packed.filename));
  } else {
    step(`use the pre-built tarball: ${providedTarball}`);
    tarballPath = path.resolve(providedTarball);
    readFileSync(tarballPath);
  }

  verifyConsumer({
    label: 'v6',
    dir: path.join(workDir, 'consumer-v6'),
    peers: ['@mikro-orm/core@^6.0.0', '@mikro-orm/sqlite@^6.0.0'],
    decorators: V6_DECORATORS,
    schemaEntities: V6_SCHEMA_ENTITY_MODULE,
    tarballPath,
  });

  if (supportsMikroOrmV7()) {
    verifyConsumer({
      label: 'v7',
      dir: path.join(workDir, 'consumer-v7'),
      // @mikro-orm/decorators/legacy imports reflect-metadata, so the consumer
      // must have it installed even though the entity gives explicit types.
      peers: [
        '@mikro-orm/core@^7.0.0',
        '@mikro-orm/sqlite@^7.0.0',
        '@mikro-orm/decorators@^7.0.0',
        'reflect-metadata@^0.2.0',
      ],
      decorators: V7_DECORATORS,
      schemaEntities: V7_SCHEMA_ENTITY_MODULE,
      tarballPath,
    });
  } else {
    step('skip the MikroORM v7 consumer');
    process.stdout.write(
      `[pack-smoke] SKIPPED MikroORM v7: it requires Node >=22.17, running ${process.versions.node}\n`
    );
  }
} catch (error) {
  process.stderr.write(`\n[pack-smoke] FAILED at step: ${currentStep}\n`);
  throw error;
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
