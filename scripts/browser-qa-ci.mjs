import { spawn } from 'node:child_process';

const origin = 'http://127.0.0.1:4173';
const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
  cwd: process.cwd(),
  env: process.env,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let previewOutput = '';
preview.stdout.on('data', chunk => { previewOutput += chunk.toString(); });
preview.stderr.on('data', chunk => { previewOutput += chunk.toString(); });

async function stopPreview() {
  if (preview.exitCode !== null) return;
  try { process.kill(-preview.pid, 'SIGTERM'); } catch { /* already stopped */ }
  await new Promise(resolve => setTimeout(resolve, 250));
  if (preview.exitCode === null) {
    try { process.kill(-preview.pid, 'SIGKILL'); } catch { /* already stopped */ }
  }
}

try {
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) throw new Error(`Vite preview exited early\n${previewOutput}`);
    try {
      const response = await fetch(origin);
      if (response.ok) { ready = true; break; }
    } catch { /* preview is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Vite preview did not become ready\n${previewOutput}`);

  const qa = spawn(process.execPath, ['scripts/e2e-qa.mjs', `--url=${origin}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  const status = await new Promise(resolve => qa.once('exit', code => resolve(code ?? 1)));
  if (status !== 0) process.exitCode = status;
} finally {
  await stopPreview();
}
