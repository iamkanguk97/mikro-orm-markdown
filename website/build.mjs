import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Generates the Examples page data into website/src/data/scenarios: every
// scenario document is produced by the actual CLI against the scenario's real
// MikroORM config, so the site always shows what the current code produces —
// nothing hand-written. Run it before `astro build` (see website/README.md).

const websiteDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(websiteDir, '..');
const cliPath = path.join(repoRoot, 'dist', 'cli.js');
const outDir = path.join(websiteDir, 'src', 'data', 'scenarios');

const SCENARIOS = [
  {
    id: 'full-tour',
    title: 'Full tour',
    blurb:
      'The complete examples/ schema — every relation kind, inheritance, embeddables, ' +
      '@namespace groups, and column markers in one document.',
    dir: path.join(repoRoot, 'examples'),
    entitiesDir: path.join(repoRoot, 'examples', 'entities'),
    docTitle: 'Example Schema',
    docDescription:
      'Generated from the entities in examples/entities - a tour of every feature mikro-orm-markdown can render.',
  },
  {
    id: 'relations-namespaces',
    title: 'Relations & namespaces',
    blurb:
      'Three small entities across two @namespace groups show how relations render in the ERD ' +
      'and how groups shape the document.',
    dir: path.join(websiteDir, 'scenarios', 'relations-namespaces'),
    entitiesDir: path.join(websiteDir, 'scenarios', 'relations-namespaces', 'entities'),
    docTitle: 'Org & Delivery',
    docDescription: 'Relations across two namespace groups.',
  },
  {
    id: 'hidden-entityschema',
    title: '@hidden & EntitySchema',
    blurb:
      '@hidden removes an entity (and its relations) from every output; an EntitySchema-defined ' +
      'entity renders with the JSDoc from its schema declaration, and its column descriptions ' +
      'come from the `comment` property option.',
    dir: path.join(websiteDir, 'scenarios', 'hidden-entityschema'),
    entitiesDir: path.join(websiteDir, 'scenarios', 'hidden-entityschema', 'entities'),
    docTitle: 'Visibility & EntitySchema',
    docDescription: 'What @hidden removes, and how schema-defined entities render with their declaration JSDoc.',
  },
];

if (!existsSync(cliPath)) {
  throw new Error('dist/cli.js not found - run `npm run build` before building the website.');
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const payloads = [];
for (const scenario of SCENARIOS) {
  process.stdout.write(`[website] generating scenario: ${scenario.id}\n`);
  const mdPath = path.join(outDir, `${scenario.id}.md`);
  execFileSync(
    'node',
    [cliPath, '-c', 'mikro-orm.config.ts', '-o', mdPath, '-t', scenario.docTitle, '-d', scenario.docDescription],
    { cwd: scenario.dir, stdio: 'inherit' }
  );

  const files = readdirSync(scenario.entitiesDir)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => ({ name, code: readFileSync(path.join(scenario.entitiesDir, name), 'utf-8') }));

  payloads.push({
    id: scenario.id,
    title: scenario.title,
    blurb: scenario.blurb,
    files,
    markdown: readFileSync(mdPath, 'utf-8'),
  });
  rmSync(mdPath);
}

writeFileSync(path.join(outDir, 'scenarios.json'), JSON.stringify(payloads));
process.stdout.write(`[website] built ${SCENARIOS.length} scenarios into ${outDir}\n`);
