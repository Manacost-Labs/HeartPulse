import {
  TelegramAuthIdentityError,
  type TelegramAuthIdentityClaim,
  type TelegramBotLinkToken,
} from './model.js';

type TelegramBotLinkResolution = {
  claims: readonly TelegramAuthIdentityClaim[];
};

type TelegramBotLinkPersistence<Result> = {
  resolution: Result;
  token: TelegramBotLinkToken;
  telegramId: string;
  now: number;
};

export function createTelegramBotLinkService<Result extends TelegramBotLinkResolution>(
  dependencies: {
    now: () => number;
    findToken: (code: string) => TelegramBotLinkToken | undefined;
    resolve: (payload: Record<string, unknown>, linkUserId: string) => Result;
    persist: (input: TelegramBotLinkPersistence<Result>) => void;
  },
) {
  return (input: { code: string; payload: Record<string, unknown> }): Result => {
    const now = dependencies.now();
    const token = dependencies.findToken(input.code);
    if (!token || !token.sessionTokenHash || token.usedAt || token.expiresAt <= now) {
      throw new TelegramAuthIdentityError(
        'LINK_TOKEN_INVALID',
        'Код не найден или устарел. Создайте новый код в профиле.',
      );
    }

    const resolution = dependencies.resolve(input.payload, token.userId);
    const telegramId = resolution.claims.find(claim => claim.provider === 'telegram')?.providerUserId;
    if (!telegramId) {
      throw new TelegramAuthIdentityError(
        'INVALID_TELEGRAM_ID',
        'Telegram передал некорректный ID пользователя',
      );
    }
    dependencies.persist({ resolution, token, telegramId, now });
    return resolution;
  };
}
