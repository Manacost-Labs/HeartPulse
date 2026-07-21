import { spawn } from 'node:child_process';

let origin = '';
const previewArgs = ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '0', '--strictPort'];
if (process.env.QA_PREVIEW_DIST_DIR) previewArgs.push('--outDir', process.env.QA_PREVIEW_DIST_DIR);
const preview = spawn('npm', previewArgs, {
  cwd: process.cwd(),
  env: process.env,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let previewOutput = '';
preview.stdout.on('data', chunk => {
  previewOutput += chunk.toString();
  const localOrigin = previewOutput.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)\/?/);
  if (localOrigin) origin = localOrigin[1];
});
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
    if (!origin) {
      await new Promise(resolve => setTimeout(resolve, 50));
      continue;
    }
    try {
      const response = await fetch(origin);
      if (response.ok) { ready = true; break; }
    } catch { /* preview is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Vite preview did not become ready\n${previewOutput}`);
  console.log(`[browser-qa] Preview ready: ${origin}`);

  const qa = spawn(process.execPath, ['scripts/e2e-qa.mjs', `--url=${origin}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      QA_RESPONSIVE_SCOPE: process.env.QA_RESPONSIVE_SCOPE || 'representative',
    },
    stdio: 'inherit',
  });
  const status = await new Promise(resolve => qa.once('exit', code => resolve(code ?? 1)));
  if (status !== 0) process.exitCode = status;
} finally {
  await stopPreview();
}
