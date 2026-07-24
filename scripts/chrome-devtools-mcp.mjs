#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

export const DEFAULT_ALLOWED_URL_PATTERNS = Object.freeze([
  'https://arena.hs-manacost.ru/*',
  'https://stats.hs-manacost.ru/*',
  'http://localhost:3000/*',
  'http://127.0.0.1:3000/*',
  'http://127.0.0.1:3108/*',
]);

function splitPatterns(value) {
  return String(value || '')
    .split(',')
    .map(pattern => pattern.trim())
    .filter(Boolean);
}

export function resolveChromeExecutable(env = process.env, exists = existsSync) {
  const candidates = [
    env.CHROME_BIN,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  const executable = candidates.find(candidate => exists(candidate));
  if (!executable) {
    throw new Error('Google Chrome не найден. Укажите путь через CHROME_BIN.');
  }
  return executable;
}

export function buildChromeDevtoolsArgs(env = process.env, exists = existsSync) {
  const patterns = splitPatterns(env.MANACOST_DEVTOOLS_ALLOWED_URL_PATTERNS);
  const allowedPatterns = patterns.length > 0 ? patterns : DEFAULT_ALLOWED_URL_PATTERNS;
  const args = [
    '--headless',
    '--isolated',
    `--executable-path=${resolveChromeExecutable(env, exists)}`,
    '--viewport=1440x900',
    '--no-usage-statistics',
    '--no-performance-crux',
    '--redact-network-headers',
    '--screenshot-format=webp',
    '--screenshot-quality=80',
    '--screenshot-max-width=1600',
    '--screenshot-max-height=1200',
    '--chrome-arg=--disable-dev-shm-usage',
  ];

  if (env.MANACOST_DEVTOOLS_CHROME_SANDBOX !== '1') {
    args.push('--chrome-arg=--no-sandbox');
  }
  for (const pattern of allowedPatterns) {
    args.push(`--allowed-url-pattern=${pattern}`);
  }
  return args;
}

export function resolveMcpBinary(env = process.env, exists = existsSync) {
  if (env.CHROME_DEVTOOLS_MCP_BIN?.trim()) return env.CHROME_DEVTOOLS_MCP_BIN.trim();
  const localBinary = join(PROJECT_ROOT, 'node_modules', '.bin', 'chrome-devtools-mcp');
  if (!exists(localBinary)) {
    throw new Error('chrome-devtools-mcp не установлен. Выполните npm ci.');
  }
  return localBinary;
}

export function main(env = process.env) {
  const binary = resolveMcpBinary(env);
  const args = buildChromeDevtoolsArgs(env);
  const child = spawn(binary, args, {
    cwd: PROJECT_ROOT,
    env: {
      ...env,
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1',
    },
    stdio: 'inherit',
  });

  child.on('error', error => {
    console.error(`[chrome-devtools-mcp] ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal));
  }
  return child;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(`[chrome-devtools-mcp] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
