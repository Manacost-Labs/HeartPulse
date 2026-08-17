export type TelegramAuthIntent = {
  kind: 'sign-in';
  nonce: string;
  expiresAt: number;
};

function telegramAuthIntentFromValue(value: unknown, now: number): TelegramAuthIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const nonce = typeof candidate.nonce === 'string' ? candidate.nonce : '';
  const expiresAt = Number(candidate.expiresAt);
  if (candidate.kind !== 'sign-in'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(nonce)
    || !Number.isFinite(expiresAt)
    || expiresAt <= now) return null;
  return { kind: 'sign-in', nonce, expiresAt };
}

export function createTelegramSignInIntent(input: {
  nonce: string;
  now: number;
  ttlMs: number;
}): TelegramAuthIntent {
  const intent = telegramAuthIntentFromValue({
    kind: 'sign-in',
    nonce: input.nonce,
    expiresAt: input.now + input.ttlMs,
  }, input.now);
  if (!intent) throw new Error('Invalid Telegram auth intent');
  return intent;
}

export function parseTelegramAuthIntents(value: unknown, now: number): TelegramAuthIntent[] {
  const container = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const values = Array.isArray(container.intents)
    ? container.intents
    : Array.isArray(value) ? value : [value];
  return values
    .map(candidate => telegramAuthIntentFromValue(candidate, now))
    .filter((intent): intent is TelegramAuthIntent => Boolean(intent))
    .slice(-5);
}

export function consumeTelegramAuthIntent(
  value: unknown,
  nonce: string,
  now: number,
): { intent: TelegramAuthIntent | null; remaining: TelegramAuthIntent[] } {
  const intents = parseTelegramAuthIntents(value, now);
  const intent = intents.find(candidate => candidate.nonce === nonce) ?? null;
  return {
    intent,
    remaining: intent ? intents.filter(candidate => candidate.nonce !== nonce) : intents,
  };
}
