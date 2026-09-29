import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { startNextServer } from '../lib/next-server.mjs';
import { createPublicWebGateway } from '../public-web-gateway.mjs';
import { startQaBackend } from './backend.mjs';

/**
 * The production page topology for browser QA: the gateway routes pages the
 * way nginx does, Next.js renders them from the QA backend, and the QA backend
 * serves release files and fixture `/api` answers in place of Express.
 * Requires `npm run build` (release files in dist/) and `npm run build:next`.
 */
export async function startQaNextRuntime() {
  for (const [artifact, script] of [['dist/index.html', 'build'], ['apps/public-web/.next/BUILD_ID', 'build:next']]) {
    if (!existsSync(artifact)) throw new Error(`${artifact} is missing; run npm run ${script} first`);
  }
  const backend = await startQaBackend({ distDir: resolve('dist') });
  let next; let gateway;
  const close = async () => {
    if (gateway) {
      gateway.closeAllConnections();
      await new Promise(resolveClose => gateway.close(resolveClose));
    }
    if (next) await next.close();
    await backend.close();
  };
  try {
    next = await startNextServer({ legacyOrigin: backend.origin });
    backend.setNotFoundOrigin(next.origin);
    gateway = createPublicWebGateway({
      legacyOrigin: backend.origin, nextOrigin: next.origin, enabled: true, pagesEnabled: true, galleryEnabled: true,
    });
    gateway.listen(0, '127.0.0.1');
    await once(gateway, 'listening');
    return { origin: `http://127.0.0.1:${gateway.address().port}`, close, output: next.output };
  } catch (error) {
    await close();
    throw error;
  }
}
