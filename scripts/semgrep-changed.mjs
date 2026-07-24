#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const SEMGREP_VERSION = '1.171.0';
const SEMGREP_SOURCE = /^(?:src\/(?!vendor\/)|server\/|scripts\/).+\.(?:[cm]?[jt]sx?)$/;

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

export function resolveSemgrepBase(env = process.env, resolveRef = ref => resolveGitRef(ref)) {
  if (env.SEMGREP_BASE?.trim()) {
    const resolved = resolveRef(env.SEMGREP_BASE.trim());
    if (resolved) return resolved;
    throw new Error(`Базовый Git ref не найден: ${env.SEMGREP_BASE.trim()}`);
  }
  if (env.GITHUB_BASE_REF?.trim()) {
    const resolved = resolveRef(`origin/${env.GITHUB_BASE_REF.trim()}`);
    if (resolved) return resolved;
  }
  if (env.GITHUB_ACTIONS === 'true' && /^[a-f0-9]{40}$/i.test(env.GITHUB_EVENT_BEFORE || '')) {
    const resolved = resolveRef(env.GITHUB_EVENT_BEFORE);
    if (resolved) return resolved;
  }
  const main = resolveRef('origin/main');
  if (main) return main;
  const parent = resolveRef('HEAD^');
  if (parent) return parent;
  throw new Error('Не удалось определить базовый Git ref для Semgrep');
}

export function isSemgrepSource(file) {
  return SEMGREP_SOURCE.test(String(file || '').replaceAll('\\', '/'));
}

function gitLines(args, cwd = PROJECT_ROOT) {
  const result = runGit(args, cwd);
  if (result.status !== 0) {
    throw new Error((result.stderr || `git ${args.join(' ')} завершился с кодом ${result.status}`).trim());
  }
  return result.stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
}

export function changedSemgrepFiles(base, cwd = PROJECT_ROOT) {
  const roots = ['src', 'server', 'scripts'];
  const tracked = gitLines(['diff', '--name-only', '--diff-filter=ACMR', base, '--', ...roots], cwd);
  const untracked = gitLines(['ls-files', '--others', '--exclude-standard', '--', ...roots], cwd);
  return [...new Set([...tracked, ...untracked].filter(isSemgrepSource))].sort();
}

export function buildSemgrepInvocation(files, env = process.env) {
  const semgrepArgs = [
    'scan',
    '--config=p/typescript',
    '--metrics=off',
    '--disable-version-check',
    '--json',
    '--quiet',
    '--timeout=10',
    '--jobs=4',
    ...files,
  ];
  if (env.SEMGREP_BIN?.trim()) {
    return { command: env.SEMGREP_BIN.trim(), args: semgrepArgs };
  }
  return {
    command: 'uvx',
    args: ['--from', `semgrep==${SEMGREP_VERSION}`, 'semgrep', ...semgrepArgs],
  };
}

function printReport(payload, base) {
  const findings = Array.isArray(payload.results) ? payload.results : [];
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  console.log(`[semgrep] база ${base}; findings: ${findings.length}; parser/errors: ${errors.length}`);
  for (const finding of findings) {
    const line = finding.start?.line ?? '?';
    const severity = String(finding.extra?.severity || 'INFO').toUpperCase();
    const message = String(finding.extra?.message || '').replace(/\s+/g, ' ').trim();
    console.log(`  ${finding.path}:${line} [${severity}] ${finding.check_id}: ${message}`);
  }
  for (const error of errors) {
    const path = error.path || 'unknown';
    const message = String(error.message || error.type || 'parser error').replace(/\s+/g, ' ').trim();
    console.warn(`  ${path}: ${message}`);
  }
  return { findings, errors };
}

export function main(env = process.env, cwd = PROJECT_ROOT) {
  const base = resolveSemgrepBase(env, ref => resolveGitRef(ref, cwd));
  const files = changedSemgrepFiles(base, cwd);
  if (files.length === 0) {
    console.log(`[semgrep] нет изменённых JS/TS-файлов относительно ${base}; проверка пропущена`);
    return 0;
  }

  const { command, args } = buildSemgrepInvocation(files, env);
  console.log(`[semgrep] сканируются ${files.length} изменённых файл(ов): ${files.join(', ')}`);
  if (env.SEMGREP_DRY_RUN === '1') {
    console.log(`[semgrep] dry-run: ${command} ${args.join(' ')}`);
    return 0;
  }

  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.stderr?.trim()) console.error(result.stderr.trim());
  if (result.status !== 0) return result.status ?? 1;

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error('Semgrep вернул некорректный JSON');
  }
  const { findings, errors } = printReport(payload, base);
  if (env.SEMGREP_BLOCK_FINDINGS === '1' && (findings.length > 0 || errors.length > 0)) {
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[semgrep] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
