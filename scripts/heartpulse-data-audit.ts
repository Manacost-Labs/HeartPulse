import { auditBattlegroundStrategyPayload } from '../server/modules/publicApi/battlegroundStrategyAudit.js';

const endpoint = process.env.HEARTPULSE_AUDIT_URL?.trim()
  || 'http://127.0.0.1:3107/api/tier-lists?list=strategies&source=hsreplay';

try {
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json', 'user-agent': 'HeartPulse-Control/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  const audit = auditBattlegroundStrategyPayload(payload);
  const result = { endpoint, httpStatus: response.status, ...audit };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!response.ok || !audit.ok) process.exitCode = 2;
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    endpoint,
    status: 'invalid',
    ok: false,
    issues: [error instanceof Error ? error.message : String(error)],
  })}\n`);
  process.exitCode = 2;
}
