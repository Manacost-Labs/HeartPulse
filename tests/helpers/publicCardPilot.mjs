import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createPublicWebGateway } from '../../scripts/public-web-gateway.mjs';
import { publicCardFixture, listenLocal, closeLocal } from './publicCardFixture.mjs';

export async function startPublicCardPilot({ gatewayPort, pagesEnabled = false } = {}) {
  for (const [artifact, script] of [['dist/index.html', 'build'], ['apps/public-web/.next/BUILD_ID', 'build:next']]) {
    if (existsSync(artifact)) continue;
    const built = spawnSync('npm', ['run', script], { encoding: 'utf8', timeout: 90000 });
    if (built.status !== 0) throw new Error(`${script} failed: ${(built.stdout + built.stderr).slice(-2500)}`);
  }
  const fixture = await publicCardFixture();
  const reservation = http.createServer(); const nextOrigin = await listenLocal(reservation);
  await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web', '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    env: { PATH: process.env.PATH, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', LEGACY_WEB_ORIGIN: fixture.backend.origin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let gateway;
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-8000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-8000); });
  const close = async () => {
    if (gateway) await closeLocal(gateway);
    if (child.exitCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM');
      const deadline = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exited; clearTimeout(deadline);
    }
    await fixture.close();
  };
  try {
    let ready = false;
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${nextOrigin}/health/next/`).then(response => response.ok, () => false);
      if (ready) break;
      await delay(50);
    }
    if (!ready) throw new Error(`Next did not start: ${output}`);
    gateway = createPublicWebGateway({ legacyOrigin: fixture.legacyOrigin, nextOrigin, enabled: true, pagesEnabled });
    let origin;
    if (gatewayPort) {
      gateway.listen(gatewayPort, '127.0.0.1'); await once(gateway, 'listening');
      origin = `http://127.0.0.1:${gatewayPort}`;
    } else { origin = await listenLocal(gateway); }
    return { ...fixture, origin, nextOrigin, close, output: () => output };
  } catch (error) { await close(); throw error; }
}
