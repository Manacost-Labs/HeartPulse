import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporaryRoot = mkdtempSync(join(tmpdir(), 'hs-arena-responsive-qa-'));
const distDirectory = join(temporaryRoot, 'dist');

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal || code})`));
    });
  });
}

try {
  console.log(`[responsive-qa] Isolated build: ${distDirectory}`);
  await run(process.execPath, [
    'node_modules/vite/bin/vite.js',
    'build',
    '--outDir', distDirectory,
    '--emptyOutDir',
  ]);
  await run(process.execPath, ['scripts/prerender.js'], {
    ...process.env,
    PRERENDER_SKIP_REMOTE: '1',
    PRERENDER_DIST_DIR: distDirectory,
  });
  await run(process.execPath, ['scripts/browser-qa-ci.mjs'], {
    ...process.env,
    QA_PREVIEW_DIST_DIR: distDirectory,
    QA_RESPONSIVE_SCOPE: process.env.QA_RESPONSIVE_SCOPE || 'representative',
  });
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
