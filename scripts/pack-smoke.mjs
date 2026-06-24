import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workDir = mkdtempSync(path.join(tmpdir(), 'mikro-orm-markdown-pack-'));

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  });
}

try {
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

  writeFileSync(path.join(consumerDir, 'package.json'), '{"private":true,"type":"module"}\n');

  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath], { cwd: consumerDir });

  writeFileSync(
    path.join(consumerDir, 'smoke.mjs'),
    "import { generateMarkdown } from 'mikro-orm-markdown';\n" +
      "if (typeof generateMarkdown !== 'function') throw new Error('generateMarkdown export missing');\n"
  );
  run('node', ['smoke.mjs'], { cwd: consumerDir });

  const binName = process.platform === 'win32' ? 'mikro-orm-markdown.cmd' : 'mikro-orm-markdown';
  run(path.join(consumerDir, 'node_modules', '.bin', binName), ['--help'], { cwd: consumerDir });
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
