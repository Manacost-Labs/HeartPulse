import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { startNextServer } from '../../scripts/lib/next-server.mjs';
import { createPublicWebGateway } from '../../scripts/public-web-gateway.mjs';
import { publicCardFixture, listenLocal, closeLocal } from './publicCardFixture.mjs';

export async function startPublicCardPilot({ gatewayPort, pagesEnabled = false, galleryEnabled = false, runtimeClientConfigFile } = {}) {
  for (const [artifact, script] of [['dist/index.html', 'build:static'], ['apps/public-web/.next/BUILD_ID', 'build:next']]) {
    if (existsSync(artifact)) continue;
    const built = spawnSync('npm', ['run', script], { encoding: 'utf8', timeout: 90000 });
    if (built.status !== 0) throw new Error(`${script} failed: ${(built.stdout + built.stderr).slice(-2500)}`);
  }
  const fixture = await publicCardFixture();
  let next; let gateway;
  const close = async () => {
    if (gateway) await closeLocal(gateway);
    if (next) await next.close();
    await fixture.close();
  };
  try {
    next = await startNextServer({ legacyOrigin: fixture.backend.origin, runtimeClientConfigFile });
    gateway = createPublicWebGateway({ legacyOrigin: fixture.legacyOrigin, nextOrigin: next.origin, enabled: true, pagesEnabled, galleryEnabled });
    let origin;
    if (gatewayPort) {
      gateway.listen(gatewayPort, '127.0.0.1'); await once(gateway, 'listening');
      origin = `http://127.0.0.1:${gatewayPort}`;
    } else { origin = await listenLocal(gateway); }
    return { ...fixture, origin, nextOrigin: next.origin, close, output: next.output };
  } catch (error) { await close(); throw error; }
}
