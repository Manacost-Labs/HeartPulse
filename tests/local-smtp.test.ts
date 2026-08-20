import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { sendLocalSmtpMessage } from '../server/localSmtp.js';

async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return address.port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function scriptedServer(onMessage: (message: string, commands: string[]) => void): Server {
  return createServer((socket: Socket) => {
    socket.setEncoding('utf8');
    socket.write('220 qa.local ESMTP ready\r\n');
    let buffer = '';
    let dataMode = false;
    const commands: string[] = [];
    socket.on('data', chunk => {
      buffer += chunk;
      if (dataMode) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end < 0) return;
        const message = buffer.slice(0, end + 2);
        buffer = buffer.slice(end + 5);
        onMessage(message, commands);
        dataMode = false;
        socket.write('250 2.0.0 queued\r\n');
        return;
      }
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n');
        const command = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        commands.push(command);
        if (command.startsWith('EHLO ')) socket.write('250-qa.local\r\n250 PIPELINING\r\n');
        else if (command.startsWith('MAIL FROM:')) socket.write('250 2.1.0 sender accepted\r\n');
        else if (command.startsWith('RCPT TO:')) socket.write('250 2.1.5 recipient accepted\r\n');
        else if (command === 'DATA') {
          dataMode = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          break;
        } else if (command === 'QUIT') socket.end('221 2.0.0 bye\r\n');
      }
    });
  });
}

let capturedMessage = '';
let capturedCommands: string[] = [];
const successServer = scriptedServer((message, commands) => {
  capturedMessage = message;
  capturedCommands = [...commands];
});
const successPort = await listen(successServer);
try {
  await sendLocalSmtpMessage({
    envelopeFrom: 'noreply@hs-manacost.ru',
    recipients: ['member@example.test', 'member@example.test'],
    message: 'From: noreply@hs-manacost.ru\nTo: member@example.test\nSubject: QA\n\n.first\nbody',
    port: successPort,
    timeoutMs: 1_000,
  });
  assert.deepEqual(capturedCommands, [
    'EHLO hearthpulse.net',
    'MAIL FROM:<noreply@hs-manacost.ru>',
    'RCPT TO:<member@example.test>',
    'DATA',
  ]);
  assert.match(capturedMessage, /Subject: QA\r\n\r\n\.\.first\r\nbody\r\n$/);
  assert.equal(capturedMessage.replace(/\r\n/g, '').includes('\n'), false);
} finally {
  await close(successServer);
}

const rejectServer = createServer(socket => {
  socket.setEncoding('utf8');
  socket.write('220 qa.local ready\r\n');
  socket.on('data', chunk => {
    const command = String(chunk);
    if (command.startsWith('EHLO ')) socket.write('250 qa.local\r\n');
    else if (command.startsWith('MAIL FROM:')) socket.write('550 private upstream diagnostic\r\n');
  });
});
const rejectPort = await listen(rejectServer);
try {
  await assert.rejects(
    sendLocalSmtpMessage({
      envelopeFrom: 'noreply@hs-manacost.ru',
      recipients: ['member@example.test'],
      message: 'Subject: rejected\n\nbody',
      port: rejectPort,
      timeoutMs: 1_000,
    }),
    error => error instanceof Error
      && error.message === 'Local SMTP rejected mail (550)'
      && !error.message.includes('private upstream diagnostic'),
  );
} finally {
  await close(rejectServer);
}

const timeoutServer = createServer(() => undefined);
const timeoutPort = await listen(timeoutServer);
try {
  await assert.rejects(
    sendLocalSmtpMessage({
      envelopeFrom: 'noreply@hs-manacost.ru',
      recipients: ['member@example.test'],
      message: 'Subject: timeout\n\nbody',
      port: timeoutPort,
      timeoutMs: 50,
    }),
    /Local SMTP timed out/,
  );
} finally {
  await close(timeoutServer);
}

assert.throws(
  () => sendLocalSmtpMessage({
    envelopeFrom: 'noreply@hs-manacost.ru\r\nRCPT TO:<attacker@example.test>',
    recipients: ['member@example.test'],
    message: 'Subject: invalid\n\nbody',
  }),
  /Invalid sender mailbox/,
);

const serviceUnit = readFileSync(new URL('../deploy/hs-arena.service', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
assert.match(
  serviceUnit,
  /^NoNewPrivileges=true$/m,
  'mail delivery must remain compatible with the hardened service instead of weakening it',
);
assert.doesNotMatch(
  serverSource,
  /SENDMAIL_PATH|\/usr\/sbin\/sendmail|spawn\([^\n]*sendmail/i,
  'the application must not reintroduce a setuid sendmail child under NoNewPrivileges',
);

console.log('local SMTP transport contract tests passed');
