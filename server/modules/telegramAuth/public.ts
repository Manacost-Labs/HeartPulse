export { createTelegramAuthUserResolver } from './service.js';
export { createTelegramBotLinkService } from './botLink.js';
export {
  TelegramAuthIdentityError,
  type TelegramAuthIdentityErrorCode,
  type TelegramAuthIdentityClaim,
  type TelegramBotLinkToken,
} from './model.js';
export {
  assertActiveTelegramLinkSession,
  claimTelegramAuthIdentities,
  consumeTelegramAuthIntentAndClaimIdentities,
  consumeTelegramLinkTokenAndClaimIdentities,
  ensureTelegramAuthDatabaseConstraints,
  ensureTelegramIdentityOwnershipConstraint,
  ensureTelegramLinkTokenSessionBinding,
  issueTelegramLinkToken,
  storeTelegramAuthIntent,
} from './repository.js';
export {
  assertTelegramAuthEnvironment,
  assertTelegramOidcAudience,
  legacyTelegramIdentityPayload,
  normalizeTelegramLinkCode,
  telegramAuthMode,
  telegramBotIdentityPayload,
  telegramLinkCodeTtlMs,
  telegramLoginWidgetDataCheckString,
} from './schema.js';
export { createTelegramAuthIntentCookieManager } from './intentCookie.js';
export { createTelegramOidcFlow, telegramOidcLinkUserId } from './oidcFlow.js';
export { claimNumericTelegramIdentity } from './legacyClaim.js';
