#!/usr/bin/env node

/**
 * PostToolUse hook: formats the file a Write/Edit tool call just produced.
 *
 * The hook event arrives as JSON on stdin (same contract as
 * scripts/claude-post-push-review.mjs). Prettier is invoked through the local
 * binary only, so the hook stays a no-op until it is installed.
 *
 * This hook never fails the tool call: every path exits 0.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const FORMATTABLE = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.md',
  '.yml',
  '.yaml',
]);

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
    });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', () => resolve(''));
  });
}

function resolveTarget(event) {
  const filePath = event?.tool_input?.file_path;
  if (typeof filePath !== 'string' || filePath.length === 0) return null;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const absolute = path.resolve(projectDir, filePath);

  // Never format outside the repository.
  const relative = path.relative(projectDir, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

  if (!FORMATTABLE.has(path.extname(absolute))) return null;
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return null;

  return { absolute, projectDir };
}

async function main() {
  const raw = await readStdin();
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }

  const target = resolveTarget(event);
  if (!target) return;

  const prettier = path.join(
    target.projectDir,
    'node_modules',
    '.bin',
    'prettier',
  );
  if (!existsSync(prettier)) return;

  try {
    execFileSync(prettier, ['--write', '--log-level', 'warn', target.absolute], {
      cwd: target.projectDir,
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 20_000,
    });
  } catch {
    // Formatting is advisory: a prettier failure must not break the session.
  }
}

main().then(
  () => process.exit(0),
  () => process.exit(0),
);
