import { Router, type Response } from 'express';
import { CRASH_REPORT_MAX_BYTES, readCrashReport } from './report.js';
import type { CrashReportRepository } from './repository.js';

type CrashReportRouterDependencies = {
  repository: CrashReportRepository;
  setPrivateNoStore: (response: Response) => void;
  now?: () => number;
};

const apiError = (code: string, message: string) => ({ error: { code, message } });

/**
 * `POST /v1/crash-reports` (plan 0.5): a crash report the player agreed to send from the Hearthpulse app. No sign-in and
 * no token, so a report is never tied to an account; only the app's shape is accepted, scrubbed again.
 */
export function createCrashReportRouter(dependencies: CrashReportRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;

  router.post('/v1/crash-reports', (request, response) => {
    dependencies.setPrivateNoStore(response);
    // The declared size first (nginx caps the body at 40 KB too), then the parsed report.
    if (Number(request.headers['content-length'] ?? 0) > CRASH_REPORT_MAX_BYTES + 8 * 1024
      || JSON.stringify(request.body ?? null).length > CRASH_REPORT_MAX_BYTES) {
      return response.status(413).json(apiError('TOO_LARGE', 'A crash report is at most 32 KB'));
    }
    const report = readCrashReport(request.body);
    if (!report) return response.status(400).json(apiError('INVALID_REPORT', 'Not a Hearthpulse crash report'));
    dependencies.repository.store(report, now());
    return response.status(201).json({ ok: true });
  });

  return router;
}
