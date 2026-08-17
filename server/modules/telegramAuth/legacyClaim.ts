// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import type { DatabaseSync } from 'node:sqlite';
import { TelegramAuthIdentityError } from './model.js';
import { claimTelegramAuthIdentities } from './repository.js';
import { telegramBotIdentityPayload } from './schema.js';

export function claimNumericTelegramIdentity(
  database: DatabaseSync,
  input: {
    userId: string;
    telegramId: unknown;
    username?: unknown;
    photoUrl?: unknown;
    verifiedAt: string;
  },
): string {
  const payload = telegramBotIdentityPayload({
    id: input.telegramId,
    username: input.username,
    photo_url: input.photoUrl,
  });
  if (!payload?.id) {
    throw new TelegramAuthIdentityError(
      'INVALID_TELEGRAM_ID',
      'Telegram передал некорректный ID пользователя',
    );
  }
  const telegramId = String(payload.id);
  claimTelegramAuthIdentities(database, input.userId, [{
    provider: 'telegram',
    providerUserId: telegramId,
    email: '',
    username: String(payload.username ?? '').trim().replace(/^@/, '').slice(0, 64),
    photoUrl: String(payload.photo_url ?? ''),
    verifiedAt: input.verifiedAt,
  }]);
  return telegramId;
}
