import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

function controlledSmtp() {
  const sockets = new Set();
  const messages = new Map();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setEncoding('utf8');
    socket.write('220 qa.local ESMTP ready\r\n');
    let buffer = '';
    let recipient = '';
    let dataMode = false;
    socket.on('data', chunk => {
      buffer += chunk;
      if (dataMode) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end < 0) return;
        const body = buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        dataMode = false;
        messages.set(recipient, {
          body,
          accept: () => socket.write('250 queued\r\n'),
          reject: () => socket.write('550 delivery rejected\r\n'),
        });
        return;
      }
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n');
        const command = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (command.startsWith('EHLO ')) socket.write('250 qa.local\r\n');
        else if (command.startsWith('MAIL FROM:')) socket.write('250 sender accepted\r\n');
        else if (command.startsWith('RCPT TO:')) {
          recipient = command.match(/<([^>]+)>/)[1];
          socket.write('250 recipient accepted\r\n');
        } else if (command === 'DATA') {
          dataMode = true;
          socket.write('354 send message\r\n');
          break;
        } else if (command === 'QUIT') socket.end('221 bye\r\n');
      }
    });
  });
  return {
    server,
    async delivery(email) {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (messages.has(email)) {
          const message = messages.get(email);
          messages.delete(email);
          return message;
        }
        await delay(20);
      }
      assert.fail(`SMTP message not received for ${email}`);
    },
    close() {
      for (const socket of sockets) socket.destroy();
      return new Promise(resolve => server.close(resolve));
    },
  };
}

/** Runs the current backend entry point with only temporary state and local SMTP. */
export async function startCredentialBackend() {
  const directory = mkdtempSync(join(tmpdir(), 'hearthpulse-auth-integration-'));
  const dataDirectory = join(directory, 'data');
  mkdirSync(dataDirectory);
  const smtp = controlledSmtp();
  const smtpPort = await listen(smtp.server);
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const databasePath = join(directory, 'users.sqlite');
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      BACKGROUND_JOBS_ENABLED: '0',
      APP_URL: origin,
      APP_ROOT_DIR: directory,
      SERVER_DATA_DIR: dataDirectory,
      ECOSYSTEM_DIR: directory,
      ECOSYSTEM_DB_FILE: databasePath,
      KHA_VIP_PROFILES_FILE: join(directory, 'profiles.json'),
      KOLODAHS_DB_ROOT: join(directory, 'koloda'),
      HOST: '127.0.0.1',
      PORT: String(port),
      REDIS_ENABLED: '0',
      LOCAL_SMTP_HOST: '127.0.0.1',
      LOCAL_SMTP_PORT: String(smtpPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  let database;
  const close = async () => {
    database?.close();
    await smtp.close();
    if (child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      const deadline = setTimeout(() => child.kill('SIGKILL'), 3000);
      await stopped;
      clearTimeout(deadline);
    }
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      assert.equal(child.exitCode, null, `Backend exited before readiness: ${output}`);
      ready = await fetch(`${origin}/health/live`).then(r => r.ok, () => false);
      if (ready) break;
      await delay(30);
    }
    assert.ok(ready, `Backend did not start: ${output}`);
    database = new DatabaseSync(databasePath);
    return {
      database, smtp, close,
      request(path, body, headers = {}) {
        return fetch(`${origin}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
        });
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
