#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_REPOSITORY = 'Zulut30/manacost-arena';
const MAX_DIFF_CHARS = 120_000;
const MAX_REVIEW_WORDS = 300;
const REVIEW_MARKER = '<!-- manacost-claude-post-push-review -->';

function jsonResult(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 2 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout ?? 30_000,
  }).trim();
}

function parseSimpleShellWords(command) {
  if (
    !command ||
    /[\r\n;]/.test(command) ||
    command.includes('&&') ||
    command.includes('||') ||
    command.includes('|') ||
    command.includes('`') ||
    command.includes('$(') ||
    command.includes('>') ||
    command.includes('<')
  ) {
    return null;
  }

  const tokens = command.match(/"(?:\\.|[^"])*"|'[^']*'|[^\s]+/g);
  if (!tokens) return [];

  return tokens.map((token) => {
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token.slice(1, -1);
    }
    return token;
  });
}

export function classifyHookEvent(event) {
  if (!event || event.hook_event_name !== 'PostToolUse') {
    return { action: 'skip', reason: 'not-post-tool-use' };
  }
  if (event.tool_name !== 'Bash') {
    return { action: 'skip', reason: 'not-bash' };
  }
  if (
    event.tool_response?.interrupted === true ||
    Number.isFinite(event.tool_response?.timedOutAfterMs) ||
    (Number.isFinite(event.tool_response?.exitCode) &&
      event.tool_response.exitCode !== 0)
  ) {
    return { action: 'skip', reason: 'unsuccessful-command' };
  }

  const words = parseSimpleShellWords(event.tool_input?.command);
  if (!words || words[0] !== 'git') {
    return { action: 'skip', reason: 'not-standalone-git-push' };
  }

  let gitDirectory = null;
  let index = 1;
  while (index < words.length) {
    const word = words[index];
    if (word === '-C') {
      if (!words[index + 1]) {
        return { action: 'skip', reason: 'invalid-git-directory' };
      }
      gitDirectory = words[index + 1];
      index += 2;
      continue;
    }
    if (word.startsWith('-')) {
      index += 1;
      continue;
    }
    if (word !== 'push') {
      return { action: 'skip', reason: 'not-git-push' };
    }
    return {
      action: 'review',
      cwd: event.cwd,
      gitDirectory,
    };
  }

  return { action: 'skip', reason: 'not-git-push' };
}

export function parseGitHubRepository(remoteUrl) {
  const normalized = String(remoteUrl ?? '').trim();
  const match = normalized.match(
    /^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/\s]+)\/([^/\s]+?)(?:\.git)?$/,
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

export function containsSensitiveMaterial(files, diff) {
  const sensitivePath =
    /(^|\/)(?:\.env(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|id_rsa|id_ed25519|.*\.(?:pem|p12|pfx|key))$/i;
  if (files.some((file) => sensitivePath.test(file))) return true;

  const sensitiveContent =
    /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*['"][^'"]{8,}['"]|(?:gh[opusr]_|sk-proj-)[A-Za-z0-9_-]{12,})/i;
  return sensitiveContent.test(diff);
}

function trimReview(review) {
  const normalized = String(review ?? '').trim();
  const words = normalized.split(/\s+/);
  if (words.length <= MAX_REVIEW_WORDS) return normalized;
  return `${words.slice(0, MAX_REVIEW_WORDS).join(' ')}…`;
}

function createClaudeReview({ commitMessage, diff, truncated }) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  if (process.env.CLAUDE_REVIEW_FAKE_REVIEW) {
    return {
      engine: 'fixture',
      text: trimReview(process.env.CLAUDE_REVIEW_FAKE_REVIEW),
    };
  }

  const prompt = `Review this single Git commit.

Commit: ${commitMessage}

Rules:
- Return at most 5 concise bullet points.
- Report only concrete bugs, security issues, regressions, or important risks.
- Skip style comments and speculative nitpicks.
- If there are no material issues, say exactly: "No material issues found."
- Keep the answer under ${MAX_REVIEW_WORDS} words.
${truncated ? '- The diff was truncated; do not claim unshown code was reviewed.' : ''}

Diff:
${diff}`;

  const claude = spawnSync(
    'claude',
    [
      '--print',
      '--safe-mode',
      '--no-session-persistence',
      '--model',
      process.env.CLAUDE_REVIEW_MODEL || 'haiku',
      '--output-format',
      'text',
      prompt,
    ],
    {
      cwd: os.tmpdir(),
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      timeout: 90_000,
    },
  );

  if (claude.status !== 0 || !claude.stdout?.trim()) {
    return null;
  }
  return { engine: 'claude', text: trimReview(claude.stdout) };
}

function createCodexReview({ repositoryRoot, sha, commitMessage }) {
  const codex = spawnSync(
    'codex',
    [
      'exec',
      'review',
      '--commit',
      sha,
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--title',
      commitMessage,
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      timeout: 90_000,
    },
  );

  if (codex.status !== 0 || !codex.stdout?.trim()) {
    throw new Error('No configured review engine completed successfully');
  }
  return { engine: 'codex', text: trimReview(codex.stdout) };
}

function createReview(context) {
  if (process.env.CLAUDE_REVIEW_FAKE_REVIEW) {
    return {
      engine: 'fixture',
      text: trimReview(process.env.CLAUDE_REVIEW_FAKE_REVIEW),
    };
  }

  const requestedEngine = process.env.CLAUDE_REVIEW_ENGINE || 'auto';
  if (!['auto', 'claude', 'codex'].includes(requestedEngine)) {
    throw new Error('CLAUDE_REVIEW_ENGINE must be auto, claude, or codex');
  }

  if (requestedEngine !== 'codex') {
    const claudeReview = createClaudeReview(context);
    if (claudeReview) return claudeReview;
    if (requestedEngine === 'claude') {
      throw new Error('Claude review engine is not configured');
    }
  }

  return createCodexReview(context);
}

function readHookInput() {
  return new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
      if (input.length > 1_000_000) {
        reject(new Error('Hook input is unexpectedly large'));
      }
    });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(input));
      } catch {
        reject(new Error('Hook input is not valid JSON'));
      }
    });
    process.stdin.on('error', reject);
  });
}

async function main() {
  const event = await readHookInput();
  const classification = classifyHookEvent(event);
  if (classification.action !== 'review') {
    jsonResult(classification);
    return;
  }

  const eventCwd = path.resolve(classification.cwd || process.cwd());
  const gitCwd = classification.gitDirectory
    ? path.resolve(eventCwd, classification.gitDirectory)
    : eventCwd;
  const repositoryRoot = run('git', ['rev-parse', '--show-toplevel'], {
    cwd: gitCwd,
  });
  const repository = parseGitHubRepository(
    run('git', ['remote', 'get-url', 'origin'], { cwd: repositoryRoot }),
  );
  const expectedRepository =
    process.env.CLAUDE_REVIEW_REPOSITORY || DEFAULT_REPOSITORY;

  if (repository !== expectedRepository) {
    jsonResult({ action: 'skip', reason: 'unexpected-origin' });
    return;
  }

  const sha = run('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot });
  if (
    process.env.CLAUDE_REVIEW_SKIP_REMOTE_VERIFY !== '1' ||
    process.env.CLAUDE_REVIEW_DRY_RUN !== '1'
  ) {
    const remoteRefs = run(
      'git',
      ['ls-remote', '--heads', '--tags', 'origin'],
      { cwd: repositoryRoot, timeout: 45_000 },
    );
    if (!remoteRefs.split('\n').some((line) => line.startsWith(`${sha}\t`))) {
      jsonResult({ action: 'skip', reason: 'head-not-on-origin', sha });
      return;
    }
  }

  const commitMessage = run('git', ['log', '-1', '--format=%s', sha], {
    cwd: repositoryRoot,
  });
  const files = run(
    'git',
    ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', sha],
    { cwd: repositoryRoot },
  )
    .split('\n')
    .filter(Boolean);
  const rawDiff = run(
    'git',
    [
      'diff-tree',
      '--root',
      '--no-commit-id',
      '--patch',
      '--no-ext-diff',
      '--unified=40',
      sha,
    ],
    { cwd: repositoryRoot, maxBuffer: 4 * 1024 * 1024 },
  );

  if (containsSensitiveMaterial(files, rawDiff)) {
    jsonResult({ action: 'skip', reason: 'sensitive-material', sha });
    return;
  }

  const truncated = rawDiff.length > MAX_DIFF_CHARS;
  const diff = rawDiff.slice(0, MAX_DIFF_CHARS);
  const generatedReview = createReview({
    repositoryRoot,
    sha,
    commitMessage,
    diff,
    truncated,
  });
  const review = generatedReview.text;
  const body = `${REVIEW_MARKER}
### Auto Code Review

${review}

---
_${generatedReview.engine} review for \`${sha.slice(0, 12)}\` after a verified push_`;

  if (process.env.CLAUDE_REVIEW_DRY_RUN === '1') {
    jsonResult({
      action: 'dry-run',
      repository,
      sha,
      files: files.length,
      truncated,
      engine: generatedReview.engine,
    });
    return;
  }

  const comments = JSON.parse(
    run(
      'gh',
      [
        'api',
        `repos/${repository}/commits/${sha}/comments`,
        '--paginate',
        '--slurp',
      ],
      { cwd: repositoryRoot, timeout: 45_000 },
    ) || '[]',
  )
    .flat()
    .filter(Boolean);
  if (comments.some((comment) => comment?.body?.includes(REVIEW_MARKER))) {
    jsonResult({ action: 'skip', reason: 'already-reviewed', sha });
    return;
  }

  const posted = JSON.parse(
    run(
      'gh',
      [
        'api',
        '--method',
        'POST',
        `repos/${repository}/commits/${sha}/comments`,
        '--raw-field',
        `body=${body}`,
      ],
      { cwd: repositoryRoot, timeout: 45_000 },
    ),
  );
  jsonResult({ action: 'posted', sha, url: posted.html_url });
}

const isDirectExecution =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`claude-post-push-review: ${error.message}\n`);
    process.exitCode = 1;
  });
}
