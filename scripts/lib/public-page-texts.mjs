import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = fileURLToPath(new URL('..', import.meta.url));

/**
 * The text a visitor reads on each text page, by canonical path (`/faq`, `/privacy`,
 * `/terms`, `/developers/api`), read from the page components under `root`. It runs
 * the renderer in a child process under `tsx`: this build is plain Node and the
 * components are TSX. Throws when the render fails, so a broken page never
 * becomes an empty (and therefore stable) fingerprint.
 */
export function renderPublicPageTexts(root) {
  // A tree with no application sources at all (a build fixture) has no page text to track.
  if (!existsSync(join(root, 'src/modules'))) return {};
  const result = spawnSync(process.execPath, [
    '--import', join(SCRIPTS, 'lib/css-import-stub.mjs'), '--import', 'tsx', join(SCRIPTS, 'render-public-page-texts.tsx'),
  ], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json') },
  });
  if (result.status !== 0) throw new Error(`Rendering the public page texts failed:\n${result.stderr}`);
  const texts = JSON.parse(result.stdout);
  for (const [pathname, text] of Object.entries(texts)) {
    if (typeof text !== 'string' || text.length < 200) throw new Error(`The rendered text of ${pathname} is empty`);
  }
  return texts;
}
