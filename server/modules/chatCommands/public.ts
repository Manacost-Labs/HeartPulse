/**
 * Chat bot commands of linked Twitch channels (`!deck !winrate !rank !mmr`): public plain-text answers for Nightbot
 * and StreamElements. Contract: docs/specs/chat-commands.md.
 */
export { createChatCommandsRouter, type ChatChannel, type ChatCommandsRouterDependencies, type ChatSnapshot } from './routes.js';
export { CHAT_COMMANDS, CHAT_MAX_LENGTH, chatLine, deckstringOf, rankText, type ChatDeck } from './model.js';
