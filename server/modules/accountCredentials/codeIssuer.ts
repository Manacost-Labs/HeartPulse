import type { CredentialCodeIssuer } from './model.js';

type CodeIssuerDependencies = {
  now: () => number;
  generateCode: () => string;
  hashCode: (code: string) => string;
  ttlMs: number;
  cooldownMs: number;
  windowMs: number;
  maximumIssues: number;
};

/** Shares issuance limits across credential and legacy code flows; failed delivery can release its reservation. */
export function createCredentialCodeIssuer(dependencies: CodeIssuerDependencies): CredentialCodeIssuer {
  const history = new Map<string, Array<{ issuedAt: number }>>();
  return {
    prepare(email, previous) {
      const now = dependencies.now();
      const recent = (history.get(email) ?? []).filter(issue => issue.issuedAt > now - dependencies.windowMs);
      const last = recent.at(-1);
      if (last && now - last.issuedAt < dependencies.cooldownMs) {
        return { ok: false, status: 429, error: 'Код уже отправлен. Подождите минуту перед повторной отправкой.' };
      }
      if (recent.length >= dependencies.maximumIssues) {
        return { ok: false, status: 429, error: 'Слишком много кодов для этой почты. Попробуйте позже.' };
      }
      const code = dependencies.generateCode();
      const issue = { issuedAt: now };
      history.set(email, [...recent, issue]);
      return {
        ok: true,
        code,
        record: {
          email,
          codeHash: dependencies.hashCode(code),
          expiresAt: now + dependencies.ttlMs,
          attempts: previous && previous.expiresAt > now ? previous.attempts : 0,
        },
        cancel() {
          const remaining = (history.get(email) ?? []).filter(entry => entry !== issue);
          if (remaining.length) history.set(email, remaining);
          else history.delete(email);
        },
      };
    },
  };
}
