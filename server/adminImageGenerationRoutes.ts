import { existsSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { Router, type RequestHandler, type Response } from 'express';

export type AdminImageGenerationJob = {
  script: string;
  output: string;
  publicUrl: string;
  cwd: string;
};

export type AdminImageGenerationDependencies = {
  adminGuard: RequestHandler;
  adminAuth: (request: Parameters<RequestHandler>[0]) => unknown | null;
  setPrivateNoStore: (response: Response) => void;
  jobs: Record<string, AdminImageGenerationJob>;
  scriptExists?: (path: string) => boolean;
  run?: (job: AdminImageGenerationJob) => ChildProcessWithoutNullStreams;
  log?: (level: 'info' | 'error', message: string) => void;
};

const safeLogText = (value: unknown) => String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 2_000);

export function createAdminImageGenerationRouter(dependencies: AdminImageGenerationDependencies): Router {
  const router = Router();
  const scriptExists = dependencies.scriptExists ?? existsSync;
  const run = dependencies.run ?? (job => spawn('python', [job.script, job.output], { cwd: job.cwd }));
  const log = dependencies.log ?? ((level, message) => level === 'error' ? console.error(message) : console.log(message));
  let isGenerating = false;

  const privateAdmin: RequestHandler[] = [
    (_request, response, next) => { dependencies.setPrivateNoStore(response); next(); },
    dependencies.adminGuard,
  ];

  router.post('/admin/gen-image', ...privateAdmin, (request, response) => {
    if (!dependencies.adminAuth(request)) return response.status(401).json({ error: 'Требуется вход' });
    const type = String(request.body?.type || 'legendaries');
    const job = dependencies.jobs[type];
    if (!job || !scriptExists(job.script)) return response.status(400).json({ error: 'Тип генерации не поддерживается' });
    if (isGenerating) return response.status(409).json({ error: 'Генерация уже запущена' });

    try {
      isGenerating = true;
      const child = run(job);
      let settled = false;
      const settle = (level: 'info' | 'error', message: string) => {
        if (settled) return;
        settled = true;
        isGenerating = false;
        log(level, message);
      };
      child.stdout.on('data', chunk => {
        const line = safeLogText(chunk);
        if (line) log('info', `[gen-image] ${line}`);
      });
      child.stderr.on('data', chunk => {
        const line = safeLogText(chunk);
        if (line) log('error', `[gen-image] ${line}`);
      });
      child.once('error', error => settle('error', `[gen-image] process error: ${safeLogText(error instanceof Error ? error.message : error)}`));
      child.once('close', code => settle(code === 0 ? 'info' : 'error', code === 0
        ? `[gen-image] completed: ${job.publicUrl}`
        : `[gen-image] failed with code ${Number(code)}`));
      return response.json({ message: 'Генерация запущена', outUrl: job.publicUrl });
    } catch (error) {
      isGenerating = false;
      log('error', `[gen-image] failed to start: ${safeLogText(error instanceof Error ? error.message : error)}`);
      return response.status(500).json({ error: 'Не удалось запустить генерацию' });
    }
  });

  router.get('/admin/gen-status', ...privateAdmin, (request, response) => {
    if (!dependencies.adminAuth(request)) return response.status(401).json({ error: 'Требуется вход' });
    return response.json({ busy: isGenerating });
  });

  return router;
}
