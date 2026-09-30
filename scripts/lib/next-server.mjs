import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

async function freeLoopbackPort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

/**
 * Starts the built Next.js app (`npm run build:next`) on a loopback port.
 * `legacyOrigin` is the Express-compatible origin its server loaders read.
 * `runtimeClientConfigFile` is a switch file in the `public/runtime-config.js`
 * format; without one the switches are off, so pages under test never load
 * card images from the public CDN.
 */
export async function startNextServer({ legacyOrigin, readyTimeoutMs = 15_000, runtimeClientConfigFile = '' }) {
  const port = await freeLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { PATH: process.env.PATH, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', LEGACY_WEB_ORIGIN: legacyOrigin,
      RUNTIME_CLIENT_CONFIG_FILE: runtimeClientConfigFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const capture = chunk => { output = (output + chunk).slice(-8000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const close = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const deadline = setTimeout(() => child.kill('SIGKILL'), 3000);
    await exited;
    clearTimeout(deadline);
  };
  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
    if (await fetch(`${origin}/health/next/`).then(response => response.ok, () => false)) {
      return { origin, close, output: () => output };
    }
    await delay(50);
  }
  await close();
  throw new Error(`Next did not start: ${output}`);
}
