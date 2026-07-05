#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const DEFAULT_ENV_FILE = '/etc/hs-arena/hs-arena.env';
const DEFAULT_CHANNEL = '@changelogarena';

function parseArgs(argv) {
  const args = {
    channel: DEFAULT_CHANNEL,
    envFile: DEFAULT_ENV_FILE,
    text: '',
    version: 'v1.0.0',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--channel') args.channel = argv[++index] || args.channel;
    else if (arg === '--env-file') args.envFile = argv[++index] || args.envFile;
    else if (arg === '--text') args.text = argv[++index] || '';
    else if (arg === '--version') args.version = argv[++index] || args.version;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run changelog:post -- --version v1.0.0 --text "Что изменено"');
      process.exit(0);
    }
  }

  return args;
}

function parseEnvFile(path) {
  const env = {};
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separator = trimmed.indexOf('=');
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8').trim();
}

function buildMessage({ version, text }) {
  const body = text.trim();
  if (!body) throw new Error('Changelog text is required. Pass --text or pipe stdin.');
  const date = new Date().toISOString().slice(0, 10);
  return [`HS-Arena ${version}`, date, '', body].join('\n');
}

const args = parseArgs(process.argv.slice(2));
if (!args.text) args.text = await readStdin();

const env = parseEnvFile(args.envFile);
const token = env.TELEGRAM_AUTH_BOT_TOKEN || process.env.TELEGRAM_AUTH_BOT_TOKEN;
if (!token) throw new Error(`TELEGRAM_AUTH_BOT_TOKEN is not set in ${args.envFile}`);

const message = buildMessage(args);
const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: args.channel,
    disable_web_page_preview: true,
    text: message,
  }),
});

const data = await response.json().catch(() => null);
if (!response.ok || !data?.ok) {
  const description = data?.description || `${response.status} ${response.statusText}`;
  throw new Error(`Telegram sendMessage failed: ${description}`);
}

console.log(`Posted changelog message ${data.result.message_id} to ${args.channel}`);
