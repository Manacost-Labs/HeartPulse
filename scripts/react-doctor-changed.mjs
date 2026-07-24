#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const FRONTEND_SOURCE = /^src\/(?!vendor\/).+\.(?:[cm]?[jt]sx?)$/;

function runGit(args, cwd = PROJECT_ROOT) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolveGitRef(ref, cwd = PROJECT_ROOT) {
  const result = runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
  return result.status === 0 ? result.stdout.trim() : null;
}

export function resolveBase(env = process.env, resolveRef = ref => resolveGitRef(ref)) {
  if (env.REACT_DOCTOR_BASE?.trim()) {
    const resolved = resolveRef(env.REACT_DOCTOR_BASE.trim());
    if (resolved) return resolved;
    throw new Error(`Базовый Git ref не найден: ${env.REACT_DOCTOR_BASE.trim()}`);
  }

  if (env.GITHUB_BASE_REF?.trim()) {
    const remoteRef = `origin/${env.GITHUB_BASE_REF.trim()}`;
    const resolved = resolveRef(remoteRef);
    if (resolved) return resolved;
  }

  if (env.GITHUB_ACTIONS === 'true' && /^[a-f0-9]{40}$/i.test(env.GITHUB_EVENT_BEFORE || '')) {
    const before = resolveRef(env.GITHUB_EVENT_BEFORE);
    if (before) return before;
  }

  if (env.GITHUB_ACTIONS === 'true') {
    const parent = resolveRef('HEAD^');
    if (parent) return parent;
  }
  const main = resolveRef('origin/main');
  if (main) return main;
  const parent = resolveRef('HEAD^');
  if (parent) return parent;

  throw new Error('Не удалось определить базовый Git ref для React Doctor');
}

export function isFrontendSource(file) {
  return FRONTEND_SOURCE.test(String(file || '').replaceAll('\\', '/'));
}

function gitLines(args, cwd = PROJECT_ROOT) {
  const result = runGit(args, cwd);
  if (result.status !== 0) {
    throw new Error((result.stderr || `git ${args.join(' ')} завершился с кодом ${result.status}`).trim());
  }
  return result.stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
}

export function changedFrontendFiles(base, cwd = PROJECT_ROOT) {
  const tracked = gitLines(['diff', '--name-only', '--diff-filter=ACMR', base, '--', 'src'], cwd);
  const untracked = gitLines(['ls-files', '--others', '--exclude-standard', '--', 'src'], cwd);
  return [...new Set([...tracked, ...untracked].filter(isFrontendSource))].sort();
}

export function buildDoctorArgs(base) {
  return [
    '.',
    '--no-telemetry',
    '--verbose',
    '--scope', 'changed',
    '--base', base,
    '--blocking', 'error',
    '--no-dead-code',
  ];
}

function resolveDoctorBinary(env = process.env, cwd = PROJECT_ROOT) {
  if (env.REACT_DOCTOR_BIN?.trim()) return env.REACT_DOCTOR_BIN.trim();
  const localBinary = join(cwd, 'node_modules', '.bin', 'react-doctor');
  return existsSync(localBinary) ? localBinary : 'react-doctor';
}

export function main(env = process.env, cwd = PROJECT_ROOT) {
  const base = resolveBase(env, ref => resolveGitRef(ref, cwd));
  const files = changedFrontendFiles(base, cwd);

  if (files.length === 0) {
    console.log(`[react-doctor] нет изменённых frontend-файлов относительно ${base}; проверка пропущена`);
    return 0;
  }

  const binary = resolveDoctorBinary(env, cwd);
  const args = buildDoctorArgs(base);
  console.log(`[react-doctor] ${files.length} frontend-файл(ов), база ${base}: ${files.join(', ')}`);

  if (env.REACT_DOCTOR_DRY_RUN === '1') {
    console.log(`[react-doctor] dry-run: ${binary} ${args.join(' ')}`);
    return 0;
  }

  const result = spawnSync(binary, args, { cwd, stdio: 'inherit', env });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[react-doctor] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
