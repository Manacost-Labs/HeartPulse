/**
 * The site side of the Twitch extension (EBS): linking a Twitch account,
 * relaying the desktop app's deck state into Extension PubSub and the last
 * envelope for viewers who join later. Contract: docs/specs/twitch-extension.md.
 */
export { readTwitchExtensionConfig, twitchExtensionOrigin, type TwitchExtensionConfig } from './config.js';
export { externalPubsubJwt, signTwitchJwt, verifyTwitchJwt } from './jwt.js';
export { createTwitchLiveState, type TwitchLiveState } from './liveState.js';
export {
  TWITCH_PUBSUB_MAX_MESSAGE_BYTES,
  TWITCH_SNAPSHOT_TTL_MS,
  TWITCH_STATE_MAX_BODY_BYTES,
  buildTwitchEnvelope,
  readTwitchEnvelope,
  validateTwitchState,
  type TwitchStreamState,
} from './model.js';
export { TWITCH_LINK_TABLES_SQL, createTwitchLinkRepository, type TwitchLink, type TwitchLinkRepository } from './repository.js';
export { TwitchApiError, createTwitchApi, type TwitchApi, type TwitchFetch } from './twitchApi.js';
export { createTwitchApiRouter, createTwitchExtensionCors } from './apiRoutes.js';
export { TWITCH_ACCOUNT_PAGE, createTwitchAccountRouter, createTwitchLinkPageRouter } from './accountRoutes.js';
export {
  TWITCH_EXTENSION_OPENAPI_PATHS,
  TWITCH_EXTENSION_OPENAPI_SCHEMAS,
  TWITCH_EXTENSION_OPENAPI_SECURITY_SCHEMES,
  TWITCH_EXTENSION_OPENAPI_TAG,
} from './openapi.js';
