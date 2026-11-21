import { readFileSync, writeFileSync } from 'node:fs';
import { INLINE_SCRIPTS } from '../apps/public-web/lib/inlineScripts';
import { inlineScriptHash } from '../apps/public-web/contentSecurityPolicy.mjs';

/**
 * Writes `apps/public-web/inlineScriptHashes.json` from `INLINE_SCRIPTS`:
 * `next.config.mjs` loads without TypeScript, so the policy reads the hashes
 * from that file. `--check` only reports a stale file (docs/specs/csp.md).
 */
const file = new URL('../apps/public-web/inlineScriptHashes.json', import.meta.url);
const expected = `${JSON.stringify(Object.fromEntries(Object.entries(INLINE_SCRIPTS)
  .map(([id, source]) => [id, inlineScriptHash(source)])), null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8') !== expected) {
    console.error('apps/public-web/inlineScriptHashes.json is stale: run npm run csp:hashes');
    process.exit(1);
  }
} else {
  writeFileSync(file, expected);
}
