// Local promo stand: the worktree's Express and built Next.js behind the
// nginx-like gateway, with a throwaway subscriber in a temporary database.
//
//   node .claude/skills/hearthpulse-promo-screenshots/scripts/stand.mjs
//
// prints the origin and the session cookie and runs until Ctrl+C. shoot.mjs
// starts and stops the same stand itself; run this only to look around.
//
// Data is real: Express reads the public datasets (api.kolodahearthstone.com)
// exactly as production does. Access is local: the temporary database holds
// one invented user with a manual access grant, the same record an
// administrator creates. No production cookie, account or database is used.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

/** Express names the session cookie after APP_URL: an http origin gets this one. */
export const SESSION_COOKIE = 'manacost_auth_token';
/** The browser asks for the session at once when this hint is set (as after a sign-in). */
export const AUTH_HINT_KEY = 'hs_arena_auth_cookie_hint';

const PROMO_USER = { id: 'promo-local', email: 'promo@example.test', name: 'Promo' };

async function freePort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise(done => server.close(done));
  return port;
}

async function waitFor(url, child, label, timeoutMs, log) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} exited:\n${log()}`);
    if (await fetch(url).then(response => response.status < 500, () => false)) return;
    await delay(250);
  }
  throw new Error(`${label} did not start in ${timeoutMs} ms:\n${log()}`);
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const force = setTimeout(() => child.kill('SIGKILL'), 4000);
  return exited.finally(() => clearTimeout(force));
}

async function seedSubscriber(databaseFile) {
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(databaseFile);
  const now = new Date().toISOString();
  const token = randomBytes(24).toString('hex');
  database.prepare(`INSERT OR REPLACE INTO users (id, email, name, role, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, 'user', '!', ?, ?)`).run(PROMO_USER.id, PROMO_USER.email, PROMO_USER.name, now, now);
  database.prepare(`INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(createHash('sha256').update(token).digest('hex'), PROMO_USER.id, PROMO_USER.email, Date.now() + 6 * 3600_000, now);
  database.prepare(`INSERT OR REPLACE INTO manual_subscription_grants
    (user_id, active, entitlements_json, granted_by, granted_at, updated_at) VALUES (?, 1, '{}', 'promo-stand', ?, ?)`)
    .run(PROMO_USER.id, now, now);
  database.close();
  return token;
}

/**
 * Starts Express, Next.js and the gateway from `root` (the worktree).
 * Requires `npm ci` and `npm run build:next`. Always call `close()`.
 */
export async function startPromoStand({ root = process.cwd(), quiet = true } = {}) {
  root = resolve(root);
  if (!existsSync(join(root, 'apps/public-web/.next/BUILD_ID'))) {
    throw new Error('No Next.js build: run `npm run build:next` in the worktree first');
  }
  const work = mkdtempSync(join(tmpdir(), 'hp-promo-stand-'));
  const children = [];
  let gateway;
  let logs = '';
  const capture = chunk => { logs = (logs + chunk).slice(-12_000); if (!quiet) process.stderr.write(chunk); };
  const close = async () => {
    if (gateway) { gateway.closeAllConnections(); await new Promise(done => gateway.close(done)); gateway = null; }
    await Promise.all(children.splice(0).map(stopChild));
    rmSync(work, { recursive: true, force: true });
  };
  try {
    const [apiPort, nextPort, gatewayPort] = [await freePort(), await freePort(), await freePort()];
    const origin = `http://127.0.0.1:${gatewayPort}`;
    // A clean environment: no production secrets, no background jobs, no Redis;
    // every file Express writes stays in the temporary directory.
    const express = spawn(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), 'server/index.ts'], {
      cwd: root,
      env: {
        PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'development',
        HOST: '127.0.0.1', PORT: String(apiPort), APP_URL: origin,
        ECOSYSTEM_DIR: join(work, 'ecosystem'), SERVER_DATA_DIR: join(work, 'data'),
        BACKGROUND_JOBS_ENABLED: '0', REDIS_ENABLED: '0', ARENA_DRAFT_REFRESH_ENABLED: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(express);
    express.stdout.on('data', capture);
    express.stderr.on('data', capture);
    await waitFor(`http://127.0.0.1:${apiPort}/api/auth/me`, express, 'Express', 90_000, () => logs);
    const token = await seedSubscriber(join(work, 'ecosystem', 'users.sqlite'));

    const next = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', 'apps/public-web',
      '--hostname', '127.0.0.1', '--port', String(nextPort)], {
      cwd: root,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
        LEGACY_WEB_ORIGIN: `http://127.0.0.1:${apiPort}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(next);
    next.stdout.on('data', capture);
    next.stderr.on('data', capture);
    await waitFor(`http://127.0.0.1:${nextPort}/health/next/`, next, 'Next.js', 60_000, () => logs);

    const { createPublicWebGateway } = await import(pathToFileURL(join(root, 'scripts/public-web-gateway.mjs')).href);
    gateway = createPublicWebGateway({
      legacyOrigin: `http://127.0.0.1:${apiPort}`, nextOrigin: `http://127.0.0.1:${nextPort}`,
      enabled: true, pagesEnabled: true, galleryEnabled: true, staticDir: join(root, 'public'),
    });
    gateway.listen(gatewayPort, '127.0.0.1');
    await once(gateway, 'listening');
    const access = await fetch(`${origin}/api/subscription/status`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } })
      .then(response => response.json());
    if (!access?.entitlements?.standard) throw new Error(`The local subscriber has no access: ${JSON.stringify(access)}`);
    return { origin, cookie: { name: SESSION_COOKIE, value: token }, close, logs: () => logs };
  } catch (error) {
    await close();
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const stand = await startPromoStand({ quiet: false });
  console.log(`\nSTAND ${stand.origin}\nCOOKIE ${stand.cookie.name}=${stand.cookie.value}\nCtrl+C stops everything.`);
  const stop = async () => { await stand.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
