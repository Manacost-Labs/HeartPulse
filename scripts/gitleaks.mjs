import { spawnSync } from 'node:child_process';
import process from 'node:process';

export const GITLEAKS_IMAGE =
  'ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f';

export function buildGitleaksArgs(cwd = process.cwd(), scan = 'git') {
  const target = scan === 'dir' ? ['dir', '--no-banner', '--redact', '--verbose', '.'] : [
    'git',
    '--no-banner',
    '--redact',
    '--verbose',
  ];
  return [
    'run',
    '--rm',
    '-v',
    `${cwd}:/repo`,
    '-w',
    '/repo',
    GITLEAKS_IMAGE,
    ...target,
  ];
}

function commandAvailable(command, args) {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0;
}

export function resolveDockerCommand() {
  if (commandAvailable('docker', ['info'])) return { command: 'docker', prefix: [] };
  if (commandAvailable('sudo', ['-n', 'docker', 'info'])) {
    return { command: 'sudo', prefix: ['-n', 'docker'] };
  }
  throw new Error(
    'Docker недоступен. Установите Docker или дайте текущему пользователю доступ к Docker daemon.',
  );
}

export function runGitleaks() {
  const runtime = resolveDockerCommand();
  for (const scan of ['git', 'dir']) {
    const result = spawnSync(
      runtime.command,
      [...runtime.prefix, ...buildGitleaksArgs(process.cwd(), scan)],
      { stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  process.exitCode = runGitleaks();
}
