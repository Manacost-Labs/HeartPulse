import { createConnection, type Socket } from 'node:net';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 25;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
const SMTP_LINE = /^(\d{3})([- ])(.*)$/;
const SAFE_MAILBOX = /^[^\s<>@\r\n]+@[^\s<>@\r\n]+$/u;

export interface LocalSmtpMessage {
  envelopeFrom: string;
  recipients: string[];
  message: string;
  host?: string;
  port?: number;
  timeoutMs?: number;
}

type SmtpPhase = 'greeting' | 'ehlo' | 'mail' | 'recipient' | 'data' | 'body';

function validateMailbox(value: string, label: string): string {
  const mailbox = value.trim();
  if (mailbox.length > 320 || !SAFE_MAILBOX.test(mailbox)) {
    throw new Error(`Invalid ${label} mailbox`);
  }
  return mailbox;
}

function smtpData(message: string): string {
  if (message.includes('\0')) throw new Error('SMTP message contains a null byte');
  const normalized = message.replace(/\r\n|\r|\n/g, '\n');
  if (Buffer.byteLength(normalized, 'utf8') > MAX_MESSAGE_BYTES) {
    throw new Error('SMTP message exceeds the local transport limit');
  }
  const stuffed = normalized
    .split('\n')
    .map(line => line.startsWith('.') ? `.${line}` : line)
    .join('\r\n')
    .replace(/(?:\r\n)*$/, '');
  return `${stuffed}\r\n.\r\n`;
}

function responseAllowed(phase: SmtpPhase, code: number): boolean {
  if (phase === 'greeting') return code === 220;
  if (phase === 'recipient') return code === 250 || code === 251;
  if (phase === 'data') return code === 354;
  return code === 250;
}

/**
 * Delivers one already-serialized RFC 5322 message to the local Exim daemon.
 *
 * The application service runs with NoNewPrivileges=true, so executing Exim's
 * setuid sendmail compatibility binary cannot enter the Debian-exim account.
 * Loopback SMTP keeps the systemd sandbox intact and lets Exim remain the only
 * process that writes its protected spool.
 */
export function sendLocalSmtpMessage(input: LocalSmtpMessage): Promise<void> {
  const envelopeFrom = validateMailbox(input.envelopeFrom, 'sender');
  const recipients = [...new Set(input.recipients.map(value => validateMailbox(value, 'recipient')))];
  if (recipients.length === 0 || recipients.length > 100) throw new Error('Invalid SMTP recipient count');
  const message = smtpData(input.message);
  const host = input.host?.trim() || DEFAULT_HOST;
  const port = Number.isInteger(input.port) && Number(input.port) > 0 && Number(input.port) <= 65_535
    ? Number(input.port)
    : DEFAULT_PORT;
  const timeoutMs = Number.isFinite(input.timeoutMs) && Number(input.timeoutMs) >= 50
    ? Math.min(Number(input.timeoutMs), 120_000)
    : DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let socket: Socket;
    let settled = false;
    let buffer = '';
    let multilineCode: number | null = null;
    let phase: SmtpPhase = 'greeting';
    let recipientIndex = 0;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) {
        socket.destroy();
        reject(error);
      } else {
        socket.end('QUIT\r\n');
        resolve();
      }
    };

    const send = (command: string) => socket.write(`${command}\r\n`);
    const rejectResponse = (code: number) => finish(new Error(`Local SMTP rejected ${phase} (${code})`));

    const acceptResponse = (code: number) => {
      if (!responseAllowed(phase, code)) {
        rejectResponse(code);
        return;
      }
      if (phase === 'greeting') {
        phase = 'ehlo';
        send('EHLO arena.hs-manacost.ru');
      } else if (phase === 'ehlo') {
        phase = 'mail';
        send(`MAIL FROM:<${envelopeFrom}>`);
      } else if (phase === 'mail') {
        phase = 'recipient';
        send(`RCPT TO:<${recipients[recipientIndex]}>`);
      } else if (phase === 'recipient') {
        recipientIndex += 1;
        if (recipientIndex < recipients.length) {
          send(`RCPT TO:<${recipients[recipientIndex]}>`);
        } else {
          phase = 'data';
          send('DATA');
        }
      } else if (phase === 'data') {
        phase = 'body';
        socket.write(message);
      } else {
        finish();
      }
    };

    socket = createConnection({ host, port });
    socket.setEncoding('utf8');
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish(new Error('Local SMTP timed out')));
    socket.on('error', () => finish(new Error('Local SMTP connection failed')));
    socket.on('close', () => {
      if (!settled) finish(new Error('Local SMTP closed before accepting the message'));
    });
    socket.on('data', chunk => {
      buffer += chunk;
      while (!settled) {
        const newline = buffer.indexOf('\n');
        if (newline < 0) break;
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        const match = SMTP_LINE.exec(line);
        if (!match) {
          finish(new Error('Local SMTP returned an invalid response'));
          break;
        }
        const code = Number(match[1]);
        if (match[2] === '-') {
          if (multilineCode !== null && multilineCode !== code) {
            finish(new Error('Local SMTP returned an invalid multiline response'));
            break;
          }
          multilineCode = code;
          continue;
        }
        if (multilineCode !== null && multilineCode !== code) {
          finish(new Error('Local SMTP returned an invalid multiline response'));
          break;
        }
        multilineCode = null;
        acceptResponse(code);
      }
    });
  });
}
