import { Router, type Request, type Response } from 'express';

type Row = Record<string, unknown>;
type Details = Record<string, any>;

export type AdminTelegramReadDependencies = {
  adminAuth: (request: Request) => unknown | null;
  repository: { all: (sql: string) => Row[] };
  safeJsonObject: (value: unknown) => Details;
  normalizeBoosty: (detail: Details) => Details;
  normalizeTelegram: (detail: Details) => Details;
  deriveEntitlements: (hasAccess: boolean, source: string, boosty: Details, telegram: Details) => Record<string, boolean>;
  hasAnyEntitlement: (entitlements: Record<string, boolean>) => boolean;
  subscriptionRefreshMs: number;
  configured: () => boolean;
  chatIds: () => string[];
  setPrivateNoStore: (response: Response) => void;
  now?: () => Date;
};

const TELEGRAM_ACCOUNTS_SQL = `
  SELECT
    u.*,
    tg.provider_user_id AS telegram_id,
    tg.username AS telegram_username,
    tg.photo_url AS telegram_photo_url,
    oidc.provider_user_id AS telegram_oidc_id,
    oidc.username AS telegram_oidc_username,
    s.has_access,
    s.source AS subscription_source,
    s.message AS subscription_message,
    s.checked_at AS subscription_checked_at,
    s.updated_at AS subscription_updated_at,
    s.boosty_json,
    s.telegram_json
  FROM users u
  LEFT JOIN identities tg ON tg.user_id = u.id AND tg.provider = 'telegram'
  LEFT JOIN identities oidc ON oidc.user_id = u.id AND oidc.provider = 'telegram_oidc'
  LEFT JOIN subscriptions s ON s.user_id = u.id
  ORDER BY u.updated_at DESC, u.created_at DESC
`;

const text = (value: unknown) => String(value ?? '');
const username = (value: unknown) => text(value).trim().replace(/^@/, '');

export function createAdminTelegramReadRouter(dependencies: AdminTelegramReadDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());
  const authorize = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    const admin = dependencies.adminAuth(request);
    if (!admin) response.status(403).json({ error: 'Недостаточно прав' });
    return Boolean(admin);
  };

  router.get('/admin/telegram/accounts', (request, response) => {
    if (!authorize(request, response)) return;
    try {
      const currentTime = now();
      const accounts = dependencies.repository.all(TELEGRAM_ACCOUNTS_SQL).map(row => {
        const boosty = dependencies.normalizeBoosty(dependencies.safeJsonObject(row.boosty_json));
        const telegram = dependencies.normalizeTelegram(dependencies.safeJsonObject(row.telegram_json));
        const source = text(row.subscription_source || 'none');
        const entitlements = dependencies.deriveEntitlements(Boolean(row.has_access), source, boosty, telegram);
        const contactTelegram = username(row.contact_telegram);
        const telegramUsername = username(row.telegram_username || telegram.username || row.telegram_oidc_username || contactTelegram);
        const telegramId = text(row.telegram_id || telegram.telegramId).trim();
        const telegramOidcId = text(row.telegram_oidc_id).trim();
        const chats = Array.isArray(telegram.chats) ? telegram.chats.filter(chat => chat && typeof chat === 'object' && !Array.isArray(chat)) : [];
        const hasTelegramIdentity = Boolean(telegramId || telegramOidcId);
        const hasContactOnly = Boolean(!hasTelegramIdentity && contactTelegram);
        const telegramAccess = Boolean(telegram.hasAccess);
        const checkedAt = row.subscription_checked_at ? text(row.subscription_checked_at) : '';
        const checkedMs = checkedAt ? Date.parse(checkedAt) : Number.NaN;
        const stale = Number.isFinite(checkedMs) ? currentTime.getTime() - checkedMs > dependencies.subscriptionRefreshMs : true;
        const canBeChecked = Boolean(telegramId);
        let accessState: 'access' | 'checkable' | 'contact-only' | 'no-access' | 'blocked' = 'no-access';
        if (row.blocked_at) accessState = 'blocked';
        else if (telegramAccess) accessState = 'access';
        else if (canBeChecked) accessState = 'checkable';
        else if (hasContactOnly) accessState = 'contact-only';
        return {
          id: text(row.id), profileId: text(row.id), name: text(row.name), email: text(row.email),
          role: text(row.role || 'user'), blockedAt: text(row.blocked_at), telegramId, telegramOidcId,
          telegramUsername, contactTelegram, photoUrl: text(row.telegram_photo_url), hasTelegramIdentity,
          hasContactOnly, canBeChecked, hasAccess: dependencies.hasAnyEntitlement(entitlements),
          telegramHasAccess: telegramAccess, accessState, source,
          message: text(row.subscription_message || telegram.message), checkedAt,
          updatedAt: row.subscription_updated_at ? text(row.subscription_updated_at) : '', stale, entitlements, chats,
          boostyHasAccess: Boolean(boosty.hasAccess), createdAt: text(row.created_at), userUpdatedAt: text(row.updated_at),
        };
      }).filter(account => account.hasTelegramIdentity || account.hasContactOnly || account.telegramHasAccess || account.source.includes('telegram') || account.chats.length > 0);

      return response.json({
        configured: dependencies.configured(),
        chatIds: dependencies.chatIds(),
        summary: {
          total: accounts.length,
          access: accounts.filter(account => account.telegramHasAccess).length,
          checkable: accounts.filter(account => account.accessState === 'checkable').length,
          contactOnly: accounts.filter(account => account.accessState === 'contact-only').length,
          stale: accounts.filter(account => account.stale).length,
          blocked: accounts.filter(account => account.accessState === 'blocked').length,
        },
        accounts,
        fetchedAt: currentTime.toISOString(),
      });
    } catch {
      return response.status(500).json({ error: 'Не удалось загрузить Telegram-аккаунты' });
    }
  });

  return router;
}
